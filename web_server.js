import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { exec, execFile } from 'node:child_process';
import { promisify } from 'node:util';

const PORT = Number(process.env.PORT || process.env.WEB_PORT || 8080);
const PUBLIC_DIR = path.join(process.cwd(), 'exports');
const WEB_DIR = path.join(process.cwd(), 'web');
const RESUME_REWRITE_DIR = path.join(PUBLIC_DIR, 'resume-rewrites');
const ROLE_KNOWLEDGE_PATH = path.join(process.cwd(), 'data', 'internet_role_knowledge.json');
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
  const requestedModelConfig = readRequestedModelConfig(payload?.modelConfig);
  const resumeFileName = readOptionalString(profile.resumeFileName, 'profile.resumeFileName');
  const resumeText = readOptionalString(profile.resumeText, 'profile.resumeText');
  const websiteUrl = readOptionalString(profile.websiteUrl, 'profile.websiteUrl');
  const githubUrl = readOptionalString(profile.githubUrl, 'profile.githubUrl');
  const resumeFileText = await extractResumeFileText(profile.resumeFile, resumeFileName);
  const llmEnabled = isLlmEnabled(requestedModelConfig);
  const profileSourceText = [resumeFileName, resumeFileText, resumeText, websiteUrl, githubUrl]
    .filter(Boolean)
    .join('\n\n');
  const profileText = profileSourceText.toLowerCase();
  const resumeLanguage = detectResumeLanguage([resumeFileText, resumeText].filter(Boolean).join('\n\n'));

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

  if (shouldUseApiJobFeedback(requestedModelConfig)) {
    for (const analysis of analyses) {
      const job = normalizedJobs.find((item) => item.title === analysis.title && item.company === analysis.company) || analysis;
      const roleKnowledge = retrieveInternetRoleKnowledge(job, 3);
      const feedback = await generateModelJobFeedback({
        modelConfig: requestedModelConfig,
        profileSourceText,
        resumeLanguage,
        profile: { resumeFileName, resumeText, websiteUrl, githubUrl },
        job,
        baselineAnalysis: analysis,
        roleKnowledge
      });
      Object.assign(analysis, feedback);
      analysis.retrievedRoleKnowledge = roleKnowledge.map(toPublicRoleKnowledge);
      analysis.resumeLanguage = resumeLanguage;
      analysis.rewrittenResumePdfUrl = await writeRewrittenResumePdf(analysis);
    }
  } else {
    for (const analysis of analyses) {
      const job = normalizedJobs.find((item) => item.title === analysis.title && item.company === analysis.company) || analysis;
      analysis.rewriteSource = 'not_configured';
      analysis.resumeLanguage = resumeLanguage;
      analysis.retrievedRoleKnowledge = retrieveInternetRoleKnowledge(job, 3).map(toPublicRoleKnowledge);
      analysis.changeLog = buildFallbackChangeLog(analysis);
      analysis.contentIntegrityNotes = [
        'No API-backed LLM provider is configured, so this run used deterministic local scoring only.',
        `Detected resume language: ${resumeLanguage}. Any rewritten resume draft must preserve the original resume language.`,
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

async function analyzeTargetJd(payload){
  const job = payload?.job;
  if (!job || typeof job !== 'object') {
    throw new Error('job must be an object.');
  }

  const result = await analyzeJds({
    profile: payload.profile,
    jobs: [job],
    modelConfig: payload.modelConfig
  });
  const analysis = result.analyses[0];
  return {
    generatedAt: result.generatedAt,
    summary: {
      targetRole: analysis?.title || '',
      successProbability: analysis?.successProbability || 0,
      level: analysis?.level || 'Low',
      recommendation: analysis
        ? `Use this JD-specific resume draft as a reviewable edit plan for ${analysis.title}.`
        : 'Submit one JD to generate a targeted resume rewrite.'
    },
    analysis
  };
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
      'User-Agent': 'GetThatJob/0.1 local UI prototype'
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
  let score = 38;
  score += Math.min(24, matchedAi.length * 8);
  score += Math.min(18, matchedProduct.length * 6);
  score += Math.min(18, matchedSkills.length * 5);
  score += hasEnglish && wantsEnglish ? 8 : 0;
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
    wantsEnglish
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

function buildRankingReasons({ matchedAi, matchedProduct, matchedSkills, missingSkills, riskTerms, hasEnglish, wantsEnglish }){
  const reasons = [];
  if (matchedAi.length > 0) reasons.push(`AI fit is supported by ${matchedAi.slice(0, 3).join(', ')}.`);
  if (matchedProduct.length > 0) reasons.push(`Product background matches ${matchedProduct.slice(0, 3).join(', ')} requirements.`);
  if (matchedSkills.length > 0) reasons.push(`Skill overlap includes ${matchedSkills.slice(0, 4).join(', ')}.`);
  if (hasEnglish && wantsEnglish) reasons.push('English/global experience can be used as a differentiator.');
  if (missingSkills.length > 0) reasons.push(`Main gaps to address: ${missingSkills.slice(0, 3).join(', ')}.`);
  if (riskTerms.length > 0) reasons.push(`Risk keywords detected: ${riskTerms.join(', ')}.`);
  return reasons.slice(0, 5);
}

function buildFallbackChangeLog(analysis){
  const changes = [];
  if ((analysis.matchedSkills || []).length > 0) {
    changes.push({
      section: 'Skills / summary',
      before: 'Relevant skills may be scattered in the original resume.',
      after: `Surface ${analysis.matchedSkills.slice(0, 4).join(', ')} near the top.`,
      reason: 'These terms appear directly in the target JD and can help the recruiter connect the resume to the role.',
      sourceEvidence: 'Local keyword overlap between submitted resume/profile text and the JD.'
    });
  }
  if ((analysis.rankingReasons || []).length > 0) {
    changes.push({
      section: 'Experience bullets',
      before: 'Original bullets are treated as general career history.',
      after: 'Reorder bullets so the most JD-relevant product, AI, data, or engineering evidence appears first.',
      reason: analysis.rankingReasons[0],
      sourceEvidence: 'Deterministic local analysis.'
    });
  }
  if ((analysis.missingSkills || []).length > 0) {
    changes.push({
      section: 'Gaps',
      before: 'Missing evidence is not added to the resume.',
      after: `Keep ${analysis.missingSkills.slice(0, 3).join(', ')} as interview prep or learning gaps unless you have real evidence.`,
      reason: 'The tool must not fabricate capabilities that were not present in the supplied resume/profile.',
      sourceEvidence: 'JD requirements not found in submitted resume/profile text.'
    });
  }
  return changes;
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

function shouldUseApiJobFeedback(modelConfig){
  return Boolean(getFeedbackModelConfig(undefined, modelConfig));
}

async function generateModelJobFeedback({ modelConfig, profileSourceText, resumeLanguage, profile, job, baselineAnalysis, roleKnowledge = [] }){
  const config = getFeedbackModelConfig(undefined, modelConfig);
  if (!config) {
    throw new Error('No API-backed LLM provider is configured.');
  }
  const system = [
    'You are a careful job-search copilot and resume editor.',
    'You must only reuse facts present in the candidate resume/profile text or the supplied URLs.',
    'Never invent employers, titles, dates, degrees, metrics, tools, certifications, projects, or achievements.',
    'If a JD asks for something not evidenced in the profile, mark it as a gap instead of adding it to the rewritten resume.',
    'Preserve the original resume language for every rewritten resume-facing field. Do not translate the resume into the JD language.',
    'Return one strict JSON object and no markdown fences.'
  ].join(' ');
  const user = JSON.stringify({
    task: 'Analyze one target JD against one candidate profile, then produce a JD-targeted resume rewrite with an explicit change log. The change log is the primary product output; interview prep is secondary.',
    languageRule: {
      detectedResumeLanguage: resumeLanguage,
      instruction: 'The rewrittenResume.title, rewrittenResume.summary, rewrittenResume.sections headings, rewrittenResume.sections bullets, and changeLog before/after resume snippets must stay in the original resume language. If the JD is in another language, use it only for understanding requirements, not for translating the resume.'
    },
    roleKnowledge: {
      instruction: 'Use these internet role playbooks as general guidance for role expectations, resume emphasis, gaps, and interview preparation. Do not treat role playbooks as candidate facts. Candidate claims must still come only from the submitted resume/profile.',
      retrievedPlaybooks: roleKnowledge.map((item) => ({
        id: item.id,
        title: item.title,
        family: item.family,
        content: item.content,
        resumeSignals: item.resumeSignals,
        interviewFocus: item.interviewFocus,
        matchedTerms: item.matchedTerms,
        relevanceReason: item.relevanceReason
      }))
    },
    requiredOutputShape: {
      successProbability: 'integer 0-100',
      level: 'Strong | Medium | Low',
      rankingReasons: ['clear reason grounded in resume and JD; do not compare against other JDs'],
      changeLog: [
        {
          section: 'resume section or bullet group changed',
          before: 'what the original resume likely emphasized, using only supplied evidence',
          after: 'how the rewritten resume now frames the same evidence',
          reason: 'why this edit helps for this JD',
          sourceEvidence: 'which supplied resume/profile fact supports the edit'
        }
      ],
      resumeImprovements: ['specific edit recommendation without inventing facts'],
      resumeRewritePlan: ['how to reorder or re-narrate existing content'],
      rewrittenResume: {
        title: 'candidate or target role title in the original resume language',
        summary: 'short summary using only evidenced facts in the original resume language',
        sections: [
          {
            heading: 'section heading in the original resume language',
            bullets: ['resume bullet using only original facts and the original resume language']
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
    deterministicBaseline: {
      ...baselineAnalysis,
      resumeLanguage,
      retrievedRoleKnowledgeIds: roleKnowledge.map((item) => item.id)
    }
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
  return normalizeOpenAiFeedback(parsed, resumeLanguage);
}

function getFeedbackModelConfig(providerOverride, requestedConfig){
  if (requestedConfig) {
    const provider = String(requestedConfig.provider || '').trim().toLowerCase();
    if (!provider || !requestedConfig.apiKey || !requestedConfig.model) {
      return undefined;
    }
    const endpoint = requestedConfig.endpoint || defaultEndpointForProvider(provider);
    if (!endpoint) {
      throw new Error(`Custom provider "${provider}" needs an endpoint.`);
    }
    return {
      provider,
      apiKey: requestedConfig.apiKey,
      model: requestedConfig.model,
      endpoint
    };
  }

  const provider = String(providerOverride || process.env.LLM_PROVIDER || '').trim().toLowerCase();
  if (provider === 'openai' && process.env.OPENAI_API_KEY) {
    return {
      provider,
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL || 'gpt-5.5',
      endpoint: defaultEndpointForProvider(provider)
    };
  }

  const zhipuApiKey = process.env.ZHIPU_API_KEY || process.env.BIGMODEL_API_KEY;
  if (provider === 'zhipu' && zhipuApiKey) {
    return {
      provider,
      apiKey: zhipuApiKey,
      model: process.env.ZHIPU_MODEL || 'glm-4.5-air',
      endpoint: process.env.ZHIPU_ENDPOINT || defaultEndpointForProvider(provider)
    };
  }

  return undefined;
}

function readRequestedModelConfig(value){
  if (value === undefined || value === null || value === false) return undefined;
  if (!value || typeof value !== 'object') {
    throw new Error('modelConfig must be an object when provided.');
  }

  const provider = readOptionalString(value.provider, 'modelConfig.provider').toLowerCase();
  const apiKey = readOptionalString(value.apiKey, 'modelConfig.apiKey');
  const model = readOptionalString(value.model, 'modelConfig.model');
  const endpoint = readOptionalString(value.endpoint, 'modelConfig.endpoint');

  if (!provider && !apiKey && !model && !endpoint) {
    return undefined;
  }
  if (!provider) {
    throw new Error('modelConfig.provider is required when using a custom model.');
  }
  if (!apiKey) {
    throw new Error('modelConfig.apiKey is required when using a custom model.');
  }
  if (!model) {
    throw new Error('modelConfig.model is required when using a custom model.');
  }
  if (endpoint) {
    try {
      new URL(endpoint);
    } catch (_error) {
      throw new Error('modelConfig.endpoint must be a valid URL when provided.');
    }
  }

  return {
    provider,
    apiKey,
    model,
    endpoint
  };
}

function defaultEndpointForProvider(provider){
  if (provider === 'openai') return 'https://api.openai.com/v1/chat/completions';
  if (provider === 'zhipu') return 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
  return '';
}

function normalizeOpenAiFeedback(value, resumeLanguage = 'unknown'){
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

  const rewrittenResume = normalizeRewrittenResume(value.rewrittenResume);
  const contentIntegrityNotes = readStringList(value.contentIntegrityNotes, 'contentIntegrityNotes');
  const languageNote = `Language preservation: detected original resume language is ${resumeLanguage}; the rewritten resume must preserve that language rather than translating to the JD language.`;
  const languageWarnings = buildLanguageWarnings(rewrittenResume, resumeLanguage);

  return {
    rewriteSource: getFeedbackModelConfig()?.provider || 'api',
    resumeLanguage,
    successProbability,
    level,
    rankingReasons: readStringList(value.rankingReasons, 'rankingReasons'),
    changeLog: readChangeLog(value.changeLog),
    resumeImprovements: readStringList(value.resumeImprovements, 'resumeImprovements'),
    resumeRewritePlan: readStringList(value.resumeRewritePlan, 'resumeRewritePlan'),
    rewrittenResume,
    gaps: readStringList(value.gaps, 'gaps'),
    interviewQuestions: readInterviewQuestions(value.interviewQuestions),
    contentIntegrityNotes: [languageNote, ...languageWarnings, ...contentIntegrityNotes].slice(0, 12)
  };
}

function readChangeLog(value){
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw new Error(`changeLog[${index}] must be an object.`);
    }
    return {
      section: readRequiredPlainString(item.section, `changeLog[${index}].section`),
      before: readRequiredPlainString(item.before, `changeLog[${index}].before`),
      after: readRequiredPlainString(item.after, `changeLog[${index}].after`),
      reason: readRequiredPlainString(item.reason, `changeLog[${index}].reason`),
      sourceEvidence: readRequiredPlainString(item.sourceEvidence, `changeLog[${index}].sourceEvidence`)
    };
  }).slice(0, 10);
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

function buildLanguageWarnings(rewrittenResume, resumeLanguage){
  const text = [
    rewrittenResume?.title,
    rewrittenResume?.summary,
    ...(rewrittenResume?.sections || []).flatMap((section) => [
      section.heading,
      ...section.bullets
    ])
  ].filter(Boolean).join('\n');

  if (!text.trim()) return [];

  if (resumeLanguage === 'Chinese' && countMatches(text, /[\u4e00-\u9fff]/g) < 20 && countMatches(text, /[a-z]/gi) > 80) {
    return ['Language warning: the original resume appears to be Chinese, but the rewritten draft contains very little Chinese. Review before using.'];
  }

  if (resumeLanguage === 'Japanese' && countMatches(text, /[\u3040-\u30ff\u4e00-\u9fff]/g) < 20 && countMatches(text, /[a-z]/gi) > 80) {
    return ['Language warning: the original resume appears to be Japanese, but the rewritten draft may have shifted languages. Review before using.'];
  }

  if (resumeLanguage === 'Korean' && countMatches(text, /[\uac00-\ud7af]/g) < 20 && countMatches(text, /[a-z]/gi) > 80) {
    return ['Language warning: the original resume appears to be Korean, but the rewritten draft may have shifted languages. Review before using.'];
  }

  return [];
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
    const labels = getResumePdfLabels(analysis.resumeLanguage);
    const stream = fs.createWriteStream(filePath);
    stream.on('finish', resolve);
    stream.on('error', reject);
    doc.on('error', reject);
    doc.pipe(stream);
    const mojibakeBullet = String.fromCodePoint(0x9225, 0x3f);
    const originalText = doc.text.bind(doc);
    doc.text = (value, ...options) => originalText(String(value).replaceAll(mojibakeBullet, '\u2022 '), ...options);
    applyReadableFont(doc);

    doc.fontSize(18).text(resume.title || `${analysis.title} Resume Draft`, { bold: true });
    doc.moveDown(0.35);
    doc.fontSize(10).fillColor('#555555').text(`${labels.targetRole}: ${analysis.title} | ${analysis.company} | ${analysis.location}`);
    doc.moveDown();
    doc.fillColor('#111111').fontSize(11).text(labels.integrityNote);
    if (resume.summary) {
      doc.moveDown();
      doc.fontSize(13).text(labels.summary);
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
      doc.fontSize(13).fillColor('#111111').text(labels.contentIntegrityNotes);
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
    path.join(process.cwd(), 'assets', 'fonts', 'NotoSansCJKsc-Regular.otf'),
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

function getResumePdfLabels(resumeLanguage){
  if (resumeLanguage === 'Chinese') {
    return {
      targetRole: '目标岗位',
      integrityNote: '真实性说明：这份草稿只应重排和重新叙事已提交简历/资料中的事实。使用前请逐条核对。',
      summary: '摘要',
      contentIntegrityNotes: '真实性检查'
    };
  }

  if (resumeLanguage === 'Japanese') {
    return {
      targetRole: '対象ポジション',
      integrityNote: '整合性メモ：この草稿は提出された履歴書/プロフィール内の事実のみを再構成したものです。使用前に各項目を確認してください。',
      summary: '要約',
      contentIntegrityNotes: '整合性チェック'
    };
  }

  if (resumeLanguage === 'Korean') {
    return {
      targetRole: '지원 포지션',
      integrityNote: '무결성 메모: 이 초안은 제출된 이력서/프로필의 사실만 재구성해야 합니다. 사용 전 각 항목을 확인하세요.',
      summary: '요약',
      contentIntegrityNotes: '무결성 확인'
    };
  }

  return {
    targetRole: 'Target role',
    integrityNote: 'Integrity note: This draft must only reorder and re-narrate facts from the submitted resume/profile. Verify every bullet before use.',
    summary: 'Summary',
    contentIntegrityNotes: 'Content Integrity Notes'
  };
}

// Keep PDF labels in escaped form so source encoding cannot corrupt multilingual output.
function getLegacyPdfLabels(resumeLanguage){
  if (resumeLanguage === 'Chinese') {
    return {
      targetRole: '\u76ee\u6807\u5c97\u4f4d',
      integrityNote: '\u771f\u5b9e\u6027\u8bf4\u660e\uff1a\u8fd9\u4efd\u8349\u7a3f\u53ea\u5e94\u91cd\u6392\u548c\u91cd\u65b0\u53d9\u8ff0\u63d0\u4ea4\u6750\u6599\u4e2d\u7684\u4e8b\u5b9e\u3002\u4f7f\u7528\u524d\u8bf7\u9010\u6761\u6838\u5bf9\u3002',
      summary: '\u6458\u8981',
      contentIntegrityNotes: '\u5185\u5bb9\u771f\u5b9e\u6027\u68c0\u67e5'
    };
  }
  if (resumeLanguage === 'Japanese') {
    return {
      targetRole: '\u5bfe\u8c61\u8077\u7a2e',
      integrityNote: '\u771f\u5b9f\u6027\u306e\u8aac\u660e\uff1a\u3053\u306e\u8349\u7a3f\u306f\u63d0\u51fa\u3055\u308c\u305f\u7d4c\u6b74\u306e\u4e8b\u5b9f\u306e\u307f\u3092\u4e26\u3079\u66ff\u3048\u305f\u3082\u306e\u3067\u3059\u3002\u4f7f\u7528\u524d\u306b\u5404\u9805\u76ee\u3092\u78ba\u8a8d\u3057\u3066\u304f\u3060\u3055\u3044\u3002',
      summary: '\u6982\u8981',
      contentIntegrityNotes: '\u5185\u5bb9\u306e\u771f\u5b9f\u6027\u30c1\u30a7\u30c3\u30af'
    };
  }
  if (resumeLanguage === 'Korean') {
    return {
      targetRole: '\ubaa9\ud45c \uc9c1\ubb34',
      integrityNote: '\uc0ac\uc2e4\uc131 \uc548\ub0b4: \uc774 \ucd08\uc548\uc740 \uc81c\ucd9c\ub41c \uc790\ub8cc\uc758 \uc0ac\uc2e4\ub9cc \uc7ac\ubc30\uc5f4\ud558\uace0 \uc7ac\uc11c\uc220\ud55c \uac83\uc785\ub2c8\ub2e4. \uc0ac\uc6a9 \uc804\uc5d0 \ud56d\ubaa9\ubcc4\ub85c \ud655\uc778\ud574 \uc8fc\uc138\uc694.',
      summary: '\uc694\uc57d',
      contentIntegrityNotes: '\ub0b4\uc6a9 \uc0ac\uc2e4\uc131 \uac80\ud1a0'
    };
  }
  return {
    targetRole: 'Target role',
    integrityNote: 'Integrity note: This draft must only reorder and re-narrate facts from the submitted resume/profile. Verify every bullet before use.',
    summary: 'Summary',
    contentIntegrityNotes: 'Content Integrity Notes'
  };
}

function detectResumeLanguage(text){
  const source = String(text || '').trim();
  if (!source) return 'unknown';

  const counts = {
    han: countMatches(source, /[\u4e00-\u9fff]/g),
    kana: countMatches(source, /[\u3040-\u30ff]/g),
    hangul: countMatches(source, /[\uac00-\ud7af]/g),
    arabic: countMatches(source, /[\u0600-\u06ff]/g),
    cyrillic: countMatches(source, /[\u0400-\u04ff]/g),
    devanagari: countMatches(source, /[\u0900-\u097f]/g),
    thai: countMatches(source, /[\u0e00-\u0e7f]/g),
    latin: countMatches(source, /[a-z]/gi)
  };

  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  if (total < 20) return 'unknown';
  if (counts.kana >= 20 || (counts.kana > 0 && counts.han > 0)) return 'Japanese';
  if (counts.hangul >= 20) return 'Korean';
  if (counts.han >= 20) return 'Chinese';
  if (counts.arabic >= 20) return 'Arabic';
  if (counts.cyrillic >= 20) return 'Cyrillic-script language';
  if (counts.devanagari >= 20) return 'Devanagari-script language';
  if (counts.thai >= 20) return 'Thai';
  if (counts.latin >= 20) return 'English or other Latin-script language';
  return 'unknown';
}

function countMatches(text, pattern){
  return (String(text || '').match(pattern) || []).length;
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

function retrieveInternetRoleKnowledge(job, limit = 3){
  const knowledge = readInternetRoleKnowledge();
  const queryTerms = buildRoleQueryTerms(job);
  return knowledge
    .map((item) => scoreRoleKnowledge(item, queryTerms))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
    .slice(0, limit);
}

function readInternetRoleKnowledge(){
  if (!fs.existsSync(ROLE_KNOWLEDGE_PATH)) return [];
  const parsed = JSON.parse(fs.readFileSync(ROLE_KNOWLEDGE_PATH, 'utf8'));
  if (!Array.isArray(parsed)) {
    throw new Error(`${ROLE_KNOWLEDGE_PATH} must contain a JSON array.`);
  }
  return parsed.map((item, index) => validateRoleKnowledge(item, index));
}

function validateRoleKnowledge(item, index){
  if (!item || typeof item !== 'object') {
    throw new Error(`Role knowledge at index ${index} must be an object.`);
  }
  return {
    id: readRequiredPlainString(item.id, `roleKnowledge[${index}].id`),
    title: readRequiredPlainString(item.title, `roleKnowledge[${index}].title`),
    family: readRequiredPlainString(item.family, `roleKnowledge[${index}].family`),
    content: readRequiredPlainString(item.content, `roleKnowledge[${index}].content`),
    resumeSignals: readStringList(item.resumeSignals, `roleKnowledge[${index}].resumeSignals`),
    interviewFocus: readStringList(item.interviewFocus, `roleKnowledge[${index}].interviewFocus`),
    keywords: readStringList(item.keywords, `roleKnowledge[${index}].keywords`),
    citation: readRequiredPlainString(item.citation, `roleKnowledge[${index}].citation`)
  };
}

function buildRoleQueryTerms(job){
  const text = [
    job.title,
    job.company,
    job.location,
    job.description,
    ...(Array.isArray(job.skillset) ? job.skillset : []),
    ...(Array.isArray(job.language) ? job.language : [])
  ].filter(Boolean).join(' ');
  return roleTokenize(text);
}

function scoreRoleKnowledge(item, queryTerms){
  const searchable = roleNormalize([
    item.id,
    item.title,
    item.family,
    item.content,
    ...item.resumeSignals,
    ...item.interviewFocus,
    ...item.keywords
  ].join(' '));
  const matchedTerms = queryTerms.filter((term) => searchable.includes(term));
  const keywordMatches = item.keywords
    .map(roleNormalize)
    .filter((keyword) => keywordMatchesRoleQuery(keyword, queryTerms));
  const uniqueMatches = [...new Set([...keywordMatches, ...matchedTerms])].slice(0, 10);
  const score = uniqueMatches.reduce((sum, term) => sum + Math.max(2, term.length > 8 ? 5 : 3), 0);
  return {
    ...item,
    score,
    matchedTerms: uniqueMatches,
    relevanceReason: uniqueMatches.length
      ? `Retrieved because ${item.title} matches: ${uniqueMatches.slice(0, 5).join(', ')}.`
      : `No direct match found for ${item.title}.`
  };
}

function toPublicRoleKnowledge(item){
  return {
    id: item.id,
    title: item.title,
    family: item.family,
    score: item.score,
    matchedTerms: item.matchedTerms,
    relevanceReason: item.relevanceReason
  };
}

function keywordMatchesRoleQuery(keyword, queryTerms){
  if (queryTerms.includes(keyword)) return true;
  const parts = keyword.split(/[^a-z0-9\u4e00-\u9fff+#.]+/iu).filter((part) => part.length >= 2);
  if (parts.length > 1) {
    return parts.every((part) => queryTerms.includes(part));
  }
  return queryTerms.some((term) => keyword.includes(term) || term.includes(keyword));
}

function roleTokenize(text){
  return [...new Set(roleNormalize(text)
    .split(/[^a-z0-9\u4e00-\u9fff+#.]+/iu)
    .filter((term) => term.length >= 2 && !ROLE_STOP_WORDS.has(term)))];
}

function roleNormalize(text){
  return String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

const ROLE_STOP_WORDS = new Set([
  'and',
  'or',
  'the',
  'for',
  'to',
  'of',
  'in',
  'a',
  'an',
  'with',
  'role',
  'job',
  'work',
  'team',
  'teams',
  'user',
  'users',
  '负责',
  '岗位',
  '团队',
  '工作'
]);

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

function isLlmEnabled(requestedConfig){
  if (requestedConfig) return true;
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

    if (pathname === '/healthz'){
      sendJson(res, {
        ok: true,
        service: 'get-that-job'
      });
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

    if (pathname === '/api/analyze-target-jd' && method === 'POST'){
      try {
        const payload = await readRequestJson(req);
        sendJson(res, await analyzeTargetJd(payload));
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
      const disposition = parsed.searchParams.get('download') === '1' ? 'attachment' : 'inline';
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `${disposition}; filename="${fileName.replace(/"/g, '')}"`);
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
