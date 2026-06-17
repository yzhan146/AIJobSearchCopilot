import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const PORT = process.env.WEB_PORT ? Number(process.env.WEB_PORT) : 8080;
const PUBLIC_DIR = path.join(process.cwd(), 'exports');
const WEB_DIR = path.join(process.cwd(), 'web');

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

const server = http.createServer((req, res) => {
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
