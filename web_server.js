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

function readRequestJson(req){
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error('Request body is too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

async function analyzeJds(payload){
  const profile = payload?.profile || {};
  const resumeFileName = readOptionalString(profile.resumeFileName, 'profile.resumeFileName');
  const resumeText = readOptionalString(profile.resumeText, 'profile.resumeText');
  const websiteUrl = readOptionalString(profile.websiteUrl, 'profile.websiteUrl');
  const githubUrl = readOptionalString(profile.githubUrl, 'profile.githubUrl');
  const llmEnabled = isLlmEnabled();
  const profileText = [resumeFileName, resumeText, websiteUrl, githubUrl].filter(Boolean).join('\n').toLowerCase();

  if (!resumeFileName.trim()) {
    throw new Error('Resume File is required. Resume text, personal website, and GitHub are optional background sources.');
  }

  const unknownProfileKeys = Object.keys(profile).filter((key) => !['resumeFileName', 'resumeText', 'websiteUrl', 'githubUrl'].includes(key));
  if (unknownProfileKeys.length > 0) {
    throw new Error(`Unsupported profile fields: ${unknownProfileKeys.join(', ')}. Only resume, personal website, and GitHub are supported.`);
  }

  if (!Array.isArray(payload?.jobs)) {
    throw new Error('jobs must be an array.');
  }

  if (payload.jobs.length < 1 || payload.jobs.length > 10) {
    throw new Error('Submit between 1 and 10 JDs per analysis batch.');
  }

  const normalizedJobs = await Promise.all(
    payload.jobs.map((job, index) => normalizeJobInput(job, index, llmEnabled))
  );
  const analyses = normalizedJobs.map((job, index) => analyzeOneJob(job, index, profileText));
  analyses.sort((a, b) => b.successProbability - a.successProbability);
  analyses.forEach((analysis, index) => {
    analysis.rank = index + 1;
  });

  const summary = {
    totalJobs: analyses.length,
    topJob: analyses[0]?.title || '',
    averageSuccessProbability: Math.round(
      analyses.reduce((sum, item) => sum + item.successProbability, 0) / analyses.length
    ),
    strongCount: analyses.filter((item) => item.level === 'Strong').length,
    mediumCount: analyses.filter((item) => item.level === 'Medium').length,
    lowCount: analyses.filter((item) => item.level === 'Low').length,
    recommendation: analyses[0]
      ? `Prioritize ${analyses[0].title}; it has the highest profile-to-JD success probability in this batch.`
      : 'Add at least one JD to analyze.'
  };

  const result = {
    generatedAt: new Date().toISOString(),
    summary,
    analyses
  };

  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  fs.writeFileSync(path.join(PUBLIC_DIR, 'ui-analysis-results.json'), JSON.stringify(result, null, 2), 'utf8');
  return result;
}

async function normalizeJobInput(rawJob, index, llmEnabled){
  if (!rawJob || typeof rawJob !== 'object') {
    throw new Error(`jobs[${index}] must be an object.`);
  }

  const title = readOptionalString(rawJob.title, `jobs[${index}].title`);
  const company = readOptionalString(rawJob.company, `jobs[${index}].company`);
  const location = readOptionalString(rawJob.location, `jobs[${index}].location`);
  const url = readOptionalString(rawJob.url, `jobs[${index}].url`);
  const description = readOptionalString(rawJob.description, `jobs[${index}].description`);

  if (!url && (!title || !description)) {
    throw new Error(`jobs[${index}] requires title and JD text unless a JD URL is provided.`);
  }

  if (url && (!title || !description)) {
    if (!llmEnabled) {
      throw new Error(`jobs[${index}] has a JD URL, but LLM is not enabled. Paste the JD title and content manually, or enable LLM-backed URL extraction.`);
    }

    const fetched = await fetchJobDescriptionFromUrl(url);
    return {
      title: title || fetched.title || `JD from ${new URL(url).hostname}`,
      company: company || fetched.company || 'Unknown company',
      location: location || 'Unknown location',
      url,
      description: description || fetched.description
    };
  }

  return { title, company, location, url, description };
}

async function fetchJobDescriptionFromUrl(url){
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'AIJobSearchCopilot/0.1 local UI prototype'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch JD URL (${response.status}). Paste JD content manually.`);
  }

  const html = await response.text();
  const title = (html.match(/<title[^>]*>(.*?)<\/title>/is)?.[1] || '').replace(/\s+/g, ' ').trim();
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

  if (text.length < 80) {
    throw new Error('Fetched JD URL did not contain enough readable text. Paste JD content manually.');
  }

  return {
    title,
    company: '',
    description: text.slice(0, 8000)
  };
}

function analyzeOneJob(rawJob, index, profileText){
  if (!rawJob || typeof rawJob !== 'object') {
    throw new Error(`jobs[${index}] must be an object.`);
  }

  const title = readRequiredString(rawJob.title, `jobs[${index}].title`);
  const company = readOptionalString(rawJob.company, `jobs[${index}].company`) || 'Unknown company';
  const location = readOptionalString(rawJob.location, `jobs[${index}].location`) || 'Unknown location';
  const url = readOptionalString(rawJob.url, `jobs[${index}].url`);
  const description = readRequiredString(rawJob.description, `jobs[${index}].description`);
  const jdText = `${title}\n${company}\n${location}\n${description}`.toLowerCase();

  const aiTerms = findTerms(jdText, ['ai', 'llm', 'large language model', 'rag', 'agent', 'copilot', 'prompt', 'mcp', 'model', 'chatbot']);
  const productTerms = findTerms(jdText, ['product', 'roadmap', 'user research', '需求', '产品', '增长', 'strategy', 'market']);
  const skillTerms = findTerms(jdText, ['typescript', 'javascript', 'python', 'sql', 'react', 'node', 'api', 'data', 'analytics', 'prompt engineering', 'function calling']);
  const riskTerms = findTerms(jdText, ['996', 'fast-paced', 'high pressure', '加班', '抗压', '出差', 'on-call']);

  const matchedAi = aiTerms.filter((term) => profileText.includes(term));
  const matchedProduct = productTerms.filter((term) => profileText.includes(term));
  const matchedSkills = skillTerms.filter((term) => profileText.includes(term));
  const missingSkills = skillTerms.filter((term) => !profileText.includes(term)).slice(0, 5);
  const missingAi = aiTerms.filter((term) => !profileText.includes(term)).slice(0, 3);

  const hasEnglish = /english|英语|foreign|global|international/i.test(profileText);
  const wantsEnglish = /english|英语|global|international|海外/i.test(jdText);
  const hasBeijing = /beijing|北京/i.test(jdText);

  let score = 38;
  score += Math.min(24, matchedAi.length * 8);
  score += Math.min(18, matchedProduct.length * 6);
  score += Math.min(18, matchedSkills.length * 5);
  score += hasEnglish && wantsEnglish ? 8 : 0;
  score += hasBeijing ? 4 : 0;
  score -= Math.min(12, missingSkills.length * 3);
  score -= Math.min(10, riskTerms.length * 5);
  score = Math.max(12, Math.min(96, Math.round(score)));

  const level = score >= 75 ? 'Strong' : score >= 55 ? 'Medium' : 'Low';
  const rankingReasons = buildRankingReasons({
    matchedAi,
    matchedProduct,
    matchedSkills,
    missingSkills,
    riskTerms,
    hasEnglish,
    wantsEnglish,
    hasBeijing
  });

  return {
    rank: index + 1,
    title,
    company,
    location,
    url,
    successProbability: score,
    level,
    tags: [...new Set([...matchedAi, ...matchedProduct, ...matchedSkills])].slice(0, 8),
    rankingReasons,
    matchedSkills,
    missingSkills,
    risks: riskTerms.length > 0 ? riskTerms.map((term) => `JD mentions ${term}, review workload and expectation risk.`) : ['No obvious workload risk keywords detected.'],
    resumeImprovements: buildResumeImprovements({ matchedAi, matchedProduct, matchedSkills, missingSkills, missingAi, title }),
    interviewTalkingPoints: buildInterviewTalkingPoints({ matchedAi, matchedProduct, matchedSkills, title })
  };
}

function buildRankingReasons({ matchedAi, matchedProduct, matchedSkills, missingSkills, riskTerms, hasEnglish, wantsEnglish, hasBeijing }){
  const reasons = [];
  if (matchedAi.length > 0) reasons.push(`AI fit is supported by ${matchedAi.slice(0, 3).join(', ')}.`);
  if (matchedProduct.length > 0) reasons.push(`Product background matches ${matchedProduct.slice(0, 3).join(', ')} requirements.`);
  if (matchedSkills.length > 0) reasons.push(`Skill overlap includes ${matchedSkills.slice(0, 4).join(', ')}.`);
  if (hasEnglish && wantsEnglish) reasons.push('English/global experience can be used as a differentiator.');
  if (hasBeijing) reasons.push('Location appears compatible with Beijing-focused job search.');
  if (missingSkills.length > 0) reasons.push(`Main gaps to address: ${missingSkills.slice(0, 3).join(', ')}.`);
  if (riskTerms.length > 0) reasons.push(`Risk keywords detected: ${riskTerms.join(', ')}.`);
  return reasons.slice(0, 5);
}

function buildResumeImprovements({ matchedAi, matchedProduct, matchedSkills, missingSkills, missingAi, title }){
  const suggestions = [];
  if (matchedAi.length > 0) suggestions.push(`Move AI project experience closer to the top and explicitly mention ${matchedAi.slice(0, 3).join(', ')} for ${title}.`);
  if (matchedProduct.length > 0) suggestions.push(`Rewrite product experience bullets around ${matchedProduct.slice(0, 3).join(', ')} outcomes, not just responsibilities.`);
  if (matchedSkills.length > 0) suggestions.push(`Add a skills line that highlights ${matchedSkills.slice(0, 4).join(', ')} because the JD asks for them directly.`);
  if (missingSkills.length > 0) suggestions.push(`If truthful, add evidence for ${missingSkills.slice(0, 3).join(', ')}; otherwise prepare an interview explanation instead of overstating.`);
  if (missingAi.length > 0) suggestions.push(`Consider adding a concise project bullet showing exposure to ${missingAi.slice(0, 2).join(', ')} if you have real experience.`);
  suggestions.push('Use JD language naturally in resume bullets so recruiter screening can connect your background to the role.');
  return suggestions.slice(0, 5);
}

function buildInterviewTalkingPoints({ matchedAi, matchedProduct, matchedSkills, title }){
  const points = [];
  if (matchedAi.length > 0) points.push(`Explain how you used ${matchedAi.slice(0, 2).join(' and ')} in a practical product workflow.`);
  if (matchedProduct.length > 0) points.push(`Prepare one product decision story for ${title}: user problem, tradeoff, metric, and outcome.`);
  if (matchedSkills.length > 0) points.push(`Connect engineering fluency (${matchedSkills.slice(0, 3).join(', ')}) to better AI product execution.`);
  points.push('Be ready to discuss why deterministic validation and human approval make LLM agents safer.');
  return points.slice(0, 4);
}

function findTerms(text, terms){
  return terms.filter((term) => text.includes(term.toLowerCase()));
}

function readRequiredString(value, fieldName){
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${fieldName} must be a non-empty string.`);
  }
  return value.trim();
}

function readOptionalString(value, fieldName){
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string') {
    throw new Error(`${fieldName} must be a string when provided.`);
  }
  return value.trim();
}

function isLlmEnabled(){
  const provider = String(process.env.LLM_PROVIDER || '').trim().toLowerCase();
  return Boolean(provider && provider !== 'none' && provider !== 'false' && provider !== 'mock');
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

    if (pathname === '/api/config'){
      sendJson(res, {
        llmEnabled: isLlmEnabled(),
        llmProvider: process.env.LLM_PROVIDER || null
      });
      return;
    }

    if (pathname === '/api/analyze-jds' && method === 'POST'){
      try {
        const payload = await readRequestJson(req);
        sendJson(res, await analyzeJds(payload));
      } catch (error) {
        res.statusCode = 400;
        sendJson(res, { ok: false, error: String(error) });
      }
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
