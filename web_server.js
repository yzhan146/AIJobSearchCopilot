import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { exec, execFile } from 'node:child_process';
import { promisify } from 'node:util';

const PORT = process.env.WEB_PORT ? Number(process.env.WEB_PORT) : 8080;
const PUBLIC_DIR = path.join(process.cwd(), 'exports');
const WEB_DIR = path.join(process.cwd(), 'web');
const RESUME_REWRITE_DIR = path.join(PUBLIC_DIR, 'resume-rewrites');
const MAX_REQUEST_BYTES = 15 * 1024 * 1024;
const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

loadLocalEnvFiles();

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

function loadLocalEnvFiles(){
  for (const fileName of ['.env.local', '.env']) {
    const filePath = path.join(process.cwd(), fileName);
    if (!fs.existsSync(filePath)) continue;

    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const separator = trimmed.indexOf('=');
      if (separator === -1) continue;

      const key = trimmed.slice(0, separator).trim();
      const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '');
      if (key && process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }
}

function readRequestJson(req){
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > MAX_REQUEST_BYTES) {
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
  const resumeFileText = await extractResumeFileText(profile.resumeFile, resumeFileName);
  const llmEnabled = isLlmEnabled();
  const profileSourceText = [resumeFileName, resumeFileText, resumeText, websiteUrl, githubUrl]
    .filter(Boolean)
    .join('\n\n');
  const profileText = profileSourceText.toLowerCase();

  if (!resumeFileName.trim()) {
    throw new Error('Resume File is required. Resume text, personal website, and GitHub are optional background sources.');
  }

  const unknownProfileKeys = Object.keys(profile).filter((key) => !['resumeFileName', 'resumeText', 'websiteUrl', 'githubUrl', 'resumeFile'].includes(key));
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

  if (shouldUseApiJobFeedback()) {
    for (const analysis of analyses) {
      const job = normalizedJobs.find((item) => item.title === analysis.title && item.company === analysis.company) || analysis;
      const feedback = await generateModelJobFeedback({
        profileSourceText,
        profile: { resumeFileName, resumeText, websiteUrl, githubUrl },
        job,
        baselineAnalysis: analysis
      });
      Object.assign(analysis, feedback);
      analysis.rewrittenResumePdfUrl = await writeRewrittenResumePdf(analysis);
    }
  } else {
    for (const analysis of analyses) {
      analysis.rewriteSource = 'not_configured';
      analysis.contentIntegrityNotes = [
        'No API-backed LLM provider is configured, so this run used deterministic local scoring only.',
        'Set LLM_PROVIDER=zhipu and ZHIPU_API_KEY in .env.local to generate rewritten resume PDFs with Zhipu.'
      ];
      analysis.gaps = analysis.missingSkills || [];
    }
  }

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

async function extractResumeFileText(resumeFile, resumeFileName){
  if (!resumeFile) return '';
  if (!resumeFile || typeof resumeFile !== 'object') {
    throw new Error('profile.resumeFile must be an object when provided.');
  }

  const name = readOptionalString(resumeFile.name, 'profile.resumeFile.name') || resumeFileName;
  const type = readOptionalString(resumeFile.type, 'profile.resumeFile.type');
  const dataBase64 = readOptionalString(resumeFile.dataBase64, 'profile.resumeFile.dataBase64');
  if (!dataBase64) return '';

  const buffer = Buffer.from(dataBase64, 'base64');
  const lowerName = name.toLowerCase();
  if (type === 'application/pdf' || lowerName.endsWith('.pdf')) {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      const text = String(result?.text || '').replace(/\s+/g, ' ').trim();
      if (!text) {
        throw new Error('Could not extract readable text from the PDF resume. If it is scanned, paste OCR text into Resume text.');
      }
      return text.slice(0, 20000);
    } finally {
      await parser.destroy();
    }
  }

  if (type.startsWith('text/') || /\.(txt|md|csv|json)$/i.test(name)) {
    return buffer.toString('utf8').slice(0, 20000);
  }

  return '';
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

function shouldUseApiJobFeedback(){
  const provider = String(process.env.LLM_PROVIDER || '').trim().toLowerCase();
  return Boolean(getFeedbackModelConfig(provider));
}

async function generateModelJobFeedback({ profileSourceText, profile, job, baselineAnalysis }){
  const config = getFeedbackModelConfig();
  if (!config) {
    throw new Error('No API-backed LLM provider is configured.');
  }
  const system = [
    'You are a careful job-search copilot and resume editor.',
    'You must only reuse facts present in the candidate resume/profile text or the supplied URLs.',
    'Never invent employers, titles, dates, degrees, metrics, tools, certifications, projects, or achievements.',
    'If a JD asks for something not evidenced in the profile, mark it as a gap instead of adding it to the rewritten resume.',
    'Return one strict JSON object and no markdown fences.'
  ].join(' ');
  const user = JSON.stringify({
    task: 'Analyze one JD against one candidate profile, then produce interview feedback and a JD-targeted resume rewrite.',
    requiredOutputShape: {
      successProbability: 'integer 0-100',
      level: 'Strong | Medium | Low',
      rankingReasons: ['clear reason grounded in resume and JD'],
      resumeImprovements: ['specific edit recommendation without inventing facts'],
      resumeRewritePlan: ['how to reorder or re-narrate existing content'],
      rewrittenResume: {
        title: 'candidate or target role title',
        summary: 'short summary using only evidenced facts',
        sections: [
          {
            heading: 'section heading',
            bullets: ['resume bullet using only original facts']
          }
        ]
      },
      gaps: ['missing or weak evidence for this JD'],
      interviewQuestions: [
        {
          question: 'likely interview question',
          answer: 'answer using only evidenced background; say what to learn if evidence is missing',
          focusArea: 'skill/product/AI/risk area'
        }
      ],
      contentIntegrityNotes: ['brief notes proving no new facts were added']
    },
    candidateProfile: {
      resumeFileName: profile.resumeFileName,
      websiteUrl: profile.websiteUrl,
      githubUrl: profile.githubUrl,
      text: profileSourceText.slice(0, 24000)
    },
    job,
    deterministicBaseline: baselineAnalysis
  });

  const requestBody = {
    model: config.model,
    temperature: 0.2,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ],
    ...(config.provider === 'zhipu' ? { thinking: { type: 'disabled' } } : {})
  };

  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`${config.provider} feedback request failed (${response.status}): ${errorBody}`);
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error(`${config.provider} feedback response did not include JSON content.`);
  }

  const parsed = JSON.parse(content);
  return normalizeOpenAiFeedback(parsed);
}

function getFeedbackModelConfig(providerOverride){
  const provider = String(providerOverride || process.env.LLM_PROVIDER || '').trim().toLowerCase();
  if (provider === 'openai' && process.env.OPENAI_API_KEY) {
    return {
      provider,
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL || 'gpt-5.5',
      endpoint: 'https://api.openai.com/v1/chat/completions'
    };
  }

  const zhipuApiKey = process.env.ZHIPU_API_KEY || process.env.BIGMODEL_API_KEY;
  if (provider === 'zhipu' && zhipuApiKey) {
    return {
      provider,
      apiKey: zhipuApiKey,
      model: process.env.ZHIPU_MODEL || 'glm-4.5-air',
      endpoint: process.env.ZHIPU_ENDPOINT || 'https://open.bigmodel.cn/api/paas/v4/chat/completions'
    };
  }

  return undefined;
}

function normalizeOpenAiFeedback(value){
  if (!value || typeof value !== 'object') {
    throw new Error('OpenAI feedback must be an object.');
  }

  const successProbability = clampNumber(Number(value.successProbability), 0, 100);
  const level = ['Strong', 'Medium', 'Low'].includes(value.level)
    ? value.level
    : successProbability >= 75
      ? 'Strong'
      : successProbability >= 55
        ? 'Medium'
        : 'Low';

  return {
    rewriteSource: 'openai',
    successProbability,
    level,
    rankingReasons: readStringList(value.rankingReasons, 'rankingReasons'),
    resumeImprovements: readStringList(value.resumeImprovements, 'resumeImprovements'),
    resumeRewritePlan: readStringList(value.resumeRewritePlan, 'resumeRewritePlan'),
    rewrittenResume: normalizeRewrittenResume(value.rewrittenResume),
    gaps: readStringList(value.gaps, 'gaps'),
    interviewQuestions: readInterviewQuestions(value.interviewQuestions),
    contentIntegrityNotes: readStringList(value.contentIntegrityNotes, 'contentIntegrityNotes')
  };
}

function normalizeRewrittenResume(value){
  if (!value || typeof value !== 'object') {
    throw new Error('rewrittenResume must be an object.');
  }

  const sections = Array.isArray(value.sections) ? value.sections : [];
  return {
    title: typeof value.title === 'string' && value.title.trim() ? value.title.trim() : 'Targeted Resume Draft',
    summary: typeof value.summary === 'string' ? value.summary.trim() : '',
    sections: sections.map((section, index) => {
      if (!section || typeof section !== 'object') {
        throw new Error(`rewrittenResume.sections[${index}] must be an object.`);
      }
      return {
        heading: typeof section.heading === 'string' && section.heading.trim()
          ? section.heading.trim()
          : `Section ${index + 1}`,
        bullets: readStringList(section.bullets, `rewrittenResume.sections[${index}].bullets`)
      };
    }).filter((section) => section.bullets.length > 0)
  };
}

function readInterviewQuestions(value){
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw new Error(`interviewQuestions[${index}] must be an object.`);
    }
    return {
      question: readRequiredPlainString(item.question, `interviewQuestions[${index}].question`),
      answer: readRequiredPlainString(item.answer, `interviewQuestions[${index}].answer`),
      focusArea: readRequiredPlainString(item.focusArea, `interviewQuestions[${index}].focusArea`)
    };
  }).slice(0, 10);
}

function readStringList(value, fieldName){
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      if (typeof item !== 'string') {
        throw new Error(`${fieldName}[${index}] must be a string.`);
      }
      return item.trim();
    })
    .filter(Boolean)
    .slice(0, 12);
}

function readRequiredPlainString(value, fieldName){
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${fieldName} must be a non-empty string.`);
  }
  return value.trim();
}

async function writeRewrittenResumePdf(analysis){
  const resume = analysis.rewrittenResume;
  if (!resume || !Array.isArray(resume.sections) || resume.sections.length === 0) {
    return '';
  }

  const { default: PDFDocument } = await import('pdfkit');
  fs.mkdirSync(RESUME_REWRITE_DIR, { recursive: true });
  const fileName = `${safeFilePart(analysis.rank)}-${safeFilePart(analysis.title)}.pdf`;
  const filePath = path.join(RESUME_REWRITE_DIR, fileName);

  await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48, size: 'A4' });
    const stream = fs.createWriteStream(filePath);
    stream.on('finish', resolve);
    stream.on('error', reject);
    doc.on('error', reject);
    doc.pipe(stream);
    applyReadableFont(doc);

    doc.fontSize(18).text(resume.title || `${analysis.title} Resume Draft`, { bold: true });
    doc.moveDown(0.35);
    doc.fontSize(10).fillColor('#555555').text(`Target role: ${analysis.title} | ${analysis.company} | ${analysis.location}`);
    doc.moveDown();
    doc.fillColor('#111111').fontSize(11).text('Integrity note: This draft must only reorder and re-narrate facts from the submitted resume/profile. Verify every bullet before use.');
    if (resume.summary) {
      doc.moveDown();
      doc.fontSize(13).text('Summary');
      doc.moveDown(0.2);
      doc.fontSize(10.5).text(resume.summary, { lineGap: 3 });
    }

    for (const section of resume.sections) {
      doc.moveDown();
      doc.fontSize(13).fillColor('#111111').text(section.heading);
      doc.moveDown(0.2);
      for (const bullet of section.bullets) {
        doc.fontSize(10.5).fillColor('#222222').text(`• ${bullet}`, { indent: 8, lineGap: 3 });
      }
    }

    if (Array.isArray(analysis.contentIntegrityNotes) && analysis.contentIntegrityNotes.length > 0) {
      doc.moveDown();
      doc.fontSize(13).fillColor('#111111').text('Content Integrity Notes');
      doc.moveDown(0.2);
      for (const note of analysis.contentIntegrityNotes.slice(0, 6)) {
        doc.fontSize(9.5).fillColor('#555555').text(`• ${note}`, { indent: 8, lineGap: 2 });
      }
    }

    doc.end();
  });

  return `/resume-rewrites/${encodeURIComponent(fileName)}`;
}

function applyReadableFont(doc){
  const candidates = [
    'C:/Windows/Fonts/msyh.ttc',
    'C:/Windows/Fonts/simhei.ttf',
    'C:/Windows/Fonts/simsun.ttc',
    'C:/Windows/Fonts/arial.ttf'
  ];
  for (const fontPath of candidates) {
    try {
      if (fs.existsSync(fontPath)) {
        doc.font(fontPath);
        return;
      }
    } catch (_error) {}
  }
}

function safeFilePart(value){
  return String(value || 'resume')
    .replace(/[^a-z0-9\u4e00-\u9fff-]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'resume';
}

function clampNumber(value, min, max){
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
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

function readConfiguredModelName(){
  const provider = String(process.env.LLM_PROVIDER || '').trim().toLowerCase();
  if (provider === 'zhipu') return process.env.ZHIPU_MODEL || 'glm-4.5-air';
  if (provider === 'openai') return process.env.OPENAI_MODEL || 'gpt-5.5';
  if (provider === 'deepseek') return process.env.DEEPSEEK_MODEL || 'deepseek-chat';
  if (provider === 'gemini') return process.env.GEMINI_MODEL || 'gemini-2.0-flash-lite';
  if (provider === 'groq') return process.env.GROQ_MODEL || 'llama-3.1-8b-instant';
  return null;
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
      const feedbackConfig = getFeedbackModelConfig();
      sendJson(res, {
        llmEnabled: isLlmEnabled(),
        llmProvider: process.env.LLM_PROVIDER || null,
        apiFeedbackConfigured: shouldUseApiJobFeedback(),
        apiFeedbackProvider: feedbackConfig?.provider || null,
        apiFeedbackModel: feedbackConfig?.model || readConfiguredModelName()
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

    if (pathname.startsWith('/resume-rewrites/')){
      const fileName = path.basename(decodeURIComponent(pathname.slice('/resume-rewrites/'.length)));
      const filePath = path.join(RESUME_REWRITE_DIR, fileName);
      if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        res.statusCode = 404;
        res.end('Not found');
        return;
      }
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${fileName.replace(/"/g, '')}"`);
      fs.createReadStream(filePath).pipe(res);
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
