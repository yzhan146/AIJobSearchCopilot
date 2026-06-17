import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { exec, execFile } from 'node:child_process';
import { promisify } from 'node:util';

const PORT = process.env.WEB_PORT ? Number(process.env.WEB_PORT) : 8080;
const PUBLIC_DIR = path.join(process.cwd(), 'exports');
const WEB_DIR = path.join(process.cwd(), 'web');
const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

function sendJson(res, obj){
  res.setHeader('Content-Type','application/json');
  res.end(JSON.stringify(obj));
}

function readJsonArray(filePath){
  if (!fs.existsSync(filePath)) return [];
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!Array.isArray(parsed)) throw new Error(`${filePath} must contain a JSON array`);
  return parsed;
}

function writeJsonArray(filePath, list){
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(list, null, 2), 'utf8');
}

async function runPlannerDemo(goal){
  const allowedGoals = new Set(['shortlist', 'apply', 'explain']);
  if (!allowedGoals.has(goal)) {
    throw new Error(`Unsupported demo goal: ${goal}`);
  }

  await execAsync('npm run build', { cwd: process.cwd(), timeout: 120000 });
  return execFileAsync(
    process.execPath,
    ['dist/plannerDemo.js', '--llm', 'mock', '--goal', goal],
    { cwd: process.cwd(), timeout: 120000 }
  );
}

function resetDemoFiles(){
  for (const fileName of ['tool-call-trace.json', 'approvals.json', 'pending-approvals.json']) {
    const filePath = path.join(PUBLIC_DIR, fileName);
    if (fs.existsSync(filePath)) {
      fs.rmSync(filePath, { force: true });
    }
  }
}

const server = http.createServer(async (req, res) => {
  try{
    const { method, url } = req;
    const parsed = new URL(url, `http://localhost:${PORT}`);
    const pathname = parsed.pathname;

    if (pathname === '/' || pathname === '/index.html'){
      const indexPath = path.join(WEB_DIR, 'index.html');
      if (!fs.existsSync(indexPath)) { res.statusCode = 404; res.end('Not found'); return; }
      const content = fs.readFileSync(indexPath, 'utf8');
      res.setHeader('Content-Type', 'text/html');
      res.end(content);
      return;
    }

    if (pathname === '/api/run-demo' && method === 'POST'){
      const goal = parsed.searchParams.get('goal') || 'apply';
      try {
        const result = await runPlannerDemo(goal);
        sendJson(res, {
          ok: true,
          goal,
          stdout: result.stdout,
          stderr: result.stderr
        });
      } catch (e) {
        res.statusCode = 500;
        sendJson(res, {
          ok: false,
          goal,
          error: String(e),
          stdout: e?.stdout,
          stderr: e?.stderr
        });
      }
      return;
    }

    if (pathname === '/api/reset-demo' && method === 'POST'){
      resetDemoFiles();
      sendJson(res, { ok: true });
      return;
    }

    if (pathname === '/tool-call-trace.json'){
      const tracePath = path.join(PUBLIC_DIR, 'tool-call-trace.json');
      if (!fs.existsSync(tracePath)) { res.statusCode = 404; res.end('No trace'); return; }
      const content = fs.readFileSync(tracePath, 'utf8');
      res.setHeader('Content-Type','application/json');
      res.end(content);
      return;
    }

    if (pathname === '/approvals.json'){
      const approvalsPath = path.join(PUBLIC_DIR, 'approvals.json');
      sendJson(res, readJsonArray(approvalsPath));
      return;
    }

    if (pathname === '/pending-approvals.json'){
      const pendingPath = path.join(PUBLIC_DIR, 'pending-approvals.json');
      sendJson(res, readJsonArray(pendingPath));
      return;
    }

    if (pathname === '/approve' && method === 'POST'){
      let body = '';
      req.on('data', (chunk) => body += chunk);
      req.on('end', () => {
        try{
          const payload = JSON.parse(body || '{}');
          const actionId = payload.actionId || payload.id;
          if (!actionId && !payload.tool && !payload.name) {
            res.statusCode = 400;
            res.end('Approval requires actionId or tool');
            return;
          }

          const approvalsPath = path.join(PUBLIC_DIR, 'approvals.json');
          const list = readJsonArray(approvalsPath);
          const approval = {
            ...payload,
            actionId,
            tool: payload.tool || payload.name,
            status: 'approved',
            approvedAt: new Date().toISOString()
          };
          const next = list.filter((item) => item.actionId !== actionId);
          next.push(approval);
          writeJsonArray(approvalsPath, next);

          const pendingPath = path.join(PUBLIC_DIR, 'pending-approvals.json');
          const pending = readJsonArray(pendingPath).filter((item) => item.actionId !== actionId);
          writeJsonArray(pendingPath, pending);
          sendJson(res, { ok: true });
        }catch(e){ res.statusCode = 400; res.end(String(e)); }
      });
      return;
    }

    // fallback: serve static files from web dir
    const candidate = path.join(WEB_DIR, pathname);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()){
      const ext = path.extname(candidate).toLowerCase();
      const mime = ext === '.html' ? 'text/html' : ext === '.js' ? 'application/javascript' : 'text/plain';
      res.setHeader('Content-Type', mime);
      res.end(fs.readFileSync(candidate));
      return;
    }

    res.statusCode = 404; res.end('Not found');
  }catch(err){ res.statusCode = 500; res.end(String(err)); }
});

server.listen(PORT, () => {
  console.log(`Web server running at http://localhost:${PORT}/`);
  console.log('Serving exports/ directory and web UI.');
});
