const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');
const mammoth = require('mammoth');
const XLSX = require('xlsx');

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.ANTHROPIC_API_KEY || '';

const MIME = {
  '.html': 'text/html', '.css': 'text/css',
  '.js': 'application/javascript', '.json': 'application/json',
  '.png': 'image/png', '.ico': 'image/x-icon'
};

const SYSTEM_MAIN = 'You are Lexis, an elite AI legal counsel with 15+ years of experience in commercial contract law, corporate finance, and regulatory compliance. You combine the analytical depth of a senior partner at a top-tier law firm with the commercial judgment of a seasoned CFO. Your expertise spans contract drafting and disputes, cross-border commercial agreements, UAE and GCC commercial law, corporate governance, financial risk, and regulatory compliance across multiple jurisdictions. Your users are CFOs, business owners, and legal teams reviewing contracts before signing or during due diligence. Some have deep legal expertise, others have none. You adapt your language accordingly. When reviewing contracts you give equal weight to four dimensions: commercial risk, legal risk, operational risk, and compliance risk. You are direct, thorough, and honest. Always follow the exact format and structure specified in each request.';

const SYSTEM_FORMAT = 'You are a document formatter. Reformat the provided content into the exact template shown. Do not add any content not present in the source. Do not add explanations or commentary.';

const FMT = {
  summary: "The following is raw analysis of a legal document. Reformat into ONLY these exact sections:\n\n## Document Type\n[one sentence]\n\n## Parties\n| Party | Role | Jurisdiction |\n|-------|------|-------------|\n| name | role | country |\n\n## Core Purpose\n[2-3 sentences]\n\n## Key Commercial Terms\n| Term | Detail |\n|------|--------|\n| Duration | |\n| Payment terms | |\n| Key rates | |\n| Insurance | |\n| Governing law | |\n\n## Obligations\n**[Party 1 name]:**\n- obligation\n\n**[Party 2 name]:**\n- obligation\n\n## Verdict\n[One paragraph: Standard / Favorable to X / Requires negotiation]\n\nHere is the raw analysis:",

  dates: "The following deadlines were extracted. Reformat into ONLY a table, missing dates, and top 3 critical.\n\n## Dates & Deadlines\n\n| Date or Timeframe | Action Required | Responsible Party | If Missed | Priority |\n|------------------|----------------|------------------|-----------|----------|\n| 30 days from invoice | Pay fees | Company | Suspension | Critical |\n\nPriority = Critical, Important, or Advisory.\n\n## Missing Dates\n- dates that should exist but are not specified\n\n## Top 3 Critical Deadlines\n1. deadline - why critical\n2. deadline - why critical\n3. deadline - why critical\n\nHere are the deadlines to reformat:",

  clauses: "The following clause analysis was extracted. Reformat into ONLY a scorecard and clause cards.\n\n## Clause Scorecard\n| Standard | Favorable | Unfavorable | Unusual |\n|----------|-----------|-------------|--------|\n| 0 | 0 | 0 | 0 |\n\n---\n\n### [Clause Name] - STANDARD\nPlain language explanation.\nConcerns: none\n\n---\n\n### [Clause Name] - UNFAVORABLE\nPlain language explanation.\nConcern: specific concern\n\nUse only: STANDARD, FAVORABLE, UNFAVORABLE, UNUSUAL after the dash.\n\nHere is the analysis to reformat:",

  definitions: "The following was extracted. Reformat into ONLY these sections:\n\n## Defined Terms\n| Term | Definition | Concerns |\n|------|-----------|----------|\n| term | definition | none or issue |\n\n## Undefined but Important Terms\n- term used but never defined\n\n## Ambiguous Language\n**phrase** - found in clause reference\n- Interpretation 1: meaning\n- Interpretation 2: meaning\n- Risk: dispute that could arise\n\n## Inconsistencies\n- inconsistency found\n\nHere is the content to reformat:",

  compliance: "The following compliance review was extracted. Reformat into ONLY these sections:\n\n## Applicable Laws\n| Law or Regulation | Jurisdiction | How It Applies |\n|------------------|-------------|----------------|\n| law name | country | explanation |\n\n## Compliance Gaps\n| Missing Provision | Severity | Recommendation |\n|------------------|---------|----------------|\n| what is missing | High/Medium/Low | what to add |\n\n## Regulatory Red Flags\n- provision conflicting with law\n\n## Jurisdiction\n[Is governing law appropriate?]\n\n## Data Privacy\n- data protection issues\n\nHere is the review to reformat:",

  obligations: "The following obligations mapping was extracted. Reformat into ONLY these sections:\n\n## [Party 1 Name]\n\n### Must Do\n| Obligation | By When | If Breached |\n|-----------|---------|-------------|\n| obligation | deadline | consequence |\n\n### Entitled To\n- right - conditions\n\n### Cannot Do\n- restriction - scope\n\n---\n\n## [Party 2 Name]\n\n### Must Do\n| Obligation | By When | If Breached |\n|-----------|---------|-------------|\n\n### Entitled To\n- right - conditions\n\n### Cannot Do\n- restriction - scope\n\n---\n\n## Imbalances\n- anything one-sided\n\n## Enforcement\n[remedies for breach]\n\nHere is the mapping to reformat:",

  score: "The following contract scoring analysis was done. Reformat into ONLY this exact structure:\n\n## Contract Score\n\nOverall: [number]/100 - [HIGH RISK / MEDIUM RISK / LOW RISK]\n\n## Dimension Scores\n\n| Dimension | Score | Key Finding |\n|-----------|-------|------------|\n| Commercial | [0-100] | [one finding] |\n| Legal | [0-100] | [one finding] |\n| Operational | [0-100] | [one finding] |\n| Compliance | [0-100] | [one finding] |\n\n## What Drives the Score\n\n### Positives\n- [positive finding]\n- [positive finding]\n\n### Negatives\n- [negative finding]\n- [negative finding]\n\n## Recommendation\n[One paragraph: what to fix and projected score after negotiation]\n\nHere is the scoring analysis to reformat:",

  exec: "Reformat the following analysis into ONLY these exact sections with EXACTLY these headings. No other headings or content.\n\n## WHAT THIS CONTRACT DOES\n[2-3 plain sentences. No jargon.]\n\n## FINANCIAL EXPOSURE\n**Maximum uninsured gap:** [AED amount or description]\n[One sentence: liability cap vs asset value and the gap]\n\n## RISKS REQUIRING BOARD ATTENTION\n\n**HIGH RISKS**\n- [risk title]: [one sentence]\n[list ALL high risks]\n\n**MEDIUM RISKS**\n- [risk title]: [one sentence]\n- [risk title]: [one sentence - top 2 only]\n\n## BEFORE SIGNING\n1. [specific action]\n2. [specific action]\n3. [specific action]\nProjected score after negotiation: [X]/100\n\n## VERDICT\n[One sentence: Sign as-is / Negotiate first / Do not sign - and the single most important reason]\n\nHere is the analysis to reformat:",
  negotiate: "The following negotiation analysis was extracted. Reformat into ONLY clause cards and a summary.\n\n### [HIGH] Clause name - Section reference\n**Current language:** exact quote from contract\n**Why it must change:** one sentence\n**Suggested redline:** complete replacement language\n**Negotiation note:** one sentence\n\n---\n\n### [MEDIUM] Clause name - Section reference\n**Current language:** exact quote\n**Why it must change:** explanation\n**Suggested redline:** replacement language\n**Negotiation note:** how to present\n\n---\n\n## Negotiation Summary\nTotal clauses to negotiate: X\nEstimated sessions needed: X\nOpening position: which clause to lead with and why\nWalk-away clause: the one non-negotiable clause\n\nHere is the negotiation analysis to reformat:"
};

const TWO_CALL_MODES = ['summary','dates','clauses','definitions','compliance','negotiate','score','exec'];

function callAnthropic(payload) {
  return new Promise((resolve, reject) => {
    const outBody = JSON.stringify(payload);
    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(outBody)
      }
    };
    const apiReq = https.request(options, apiRes => {
      let data = '';
      apiRes.on('data', chunk => { data += chunk; });
      apiRes.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (apiRes.statusCode !== 200) {
            reject(new Error(parsed && parsed.error ? parsed.error.message : 'API error ' + apiRes.statusCode));
          } else {
            const text = (parsed.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
            const tokens = (parsed.usage ? parsed.usage.input_tokens || 0 : 0) + (parsed.usage ? parsed.usage.output_tokens || 0 : 0);
            resolve({ text: text, tokens: tokens });
          }
        } catch(e) {
          reject(new Error('Failed to parse API response: ' + e.message));
        }
      });
    });
    apiReq.on('error', reject);
    apiReq.write(outBody);
    apiReq.end();
  });
}

function serveFile(res, filePath, contentType) {
  fs.readFile(filePath, function(err, data) {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

async function extractOfficeText(buffer, fileType) {
  if (fileType === 'docx' || fileType === 'doc') {
    const result = await mammoth.extractRawText({ buffer: buffer });
    return result.value;
  }
  if (fileType === 'xlsx' || fileType === 'xls') {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    let text = '';
    workbook.SheetNames.forEach(function(sheetName) {
      text += '\n=== Sheet: ' + sheetName + ' ===\n';
      text += XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName]);
    });
    return text;
  }
  return '[Unsupported file type]';
}

function handleAnalyze(req, res) {
  let body = '';
  req.on('data', function(chunk) { body += chunk.toString(); });
  req.on('end', async function() {
    const totalStart = Date.now();
    try {
      const payload = JSON.parse(body);
      const fileType = (payload._fileType || '').toLowerCase();
      const fileData = payload._fileData;
      const mode = (payload._mode || '').toLowerCase();
      const obligations2Prompt = payload._obligations2Prompt || '';
      const officeTypes = ['doc', 'docx', 'xlsx', 'xls', 'pptx'];

      console.log('[REQUEST] mode=' + mode + ', fileType=' + fileType);

      // Extract Office text if needed
      let extractedText = '';
      if (fileType && fileData && officeTypes.includes(fileType)) {
        const buffer = Buffer.from(fileData, 'base64');
        try {
          extractedText = await extractOfficeText(buffer, fileType);
          console.log('[EXTRACT] length=' + extractedText.length);
        } catch(e) {
          extractedText = '[Extraction error: ' + e.message + ']';
        }
      }

      // Get prompt text from message
      const origContent = payload.messages[0].content;
      let promptText = '';
      if (Array.isArray(origContent)) {
        const textBlock = origContent.find(function(b) { return b.type === 'text'; });
        promptText = textBlock ? textBlock.text : '';
      } else if (typeof origContent === 'string') {
        promptText = origContent;
      }

      // Clean custom fields
      delete payload._fileType;
      delete payload._fileData;
      delete payload._mode;
      delete payload._obligations2Prompt;

      // Build document message
      function buildDocMessage(prompt) {
        if (extractedText) {
          return [{ role: 'user', content: 'Here is the content of a ' + fileType.toUpperCase() + ' document:\n\n' + extractedText + '\n\n---\n\n' + prompt }];
        }
        // PDF or text — use original content blocks but replace text
        if (Array.isArray(origContent)) {
          return [{ role: 'user', content: origContent.map(function(b) {
            return b.type === 'text' ? { type: 'text', text: prompt } : b;
          })}];
        }
        return [{ role: 'user', content: prompt }];
      }

      let finalText = '';
      let totalTokens = 0;

      if (mode === 'obligations') {
        // THREE-CALL PIPELINE
        console.log('[PIPELINE] three calls');

        const p2 = obligations2Prompt || 'List ONLY the service provider obligations in this legal document: their obligations with deadlines and consequences, their top rights, their top restrictions.';

        const t1a = Date.now();
        const r1a = await callAnthropic({ model: payload.model, max_tokens: payload.max_tokens, system: SYSTEM_MAIN, messages: buildDocMessage(promptText) });
        console.log('[CALL1a] ' + (Date.now()-t1a) + 'ms, ' + r1a.text.length + ' chars');
        totalTokens += r1a.tokens;

        const t1b = Date.now();
        const r1b = await callAnthropic({ model: payload.model, max_tokens: payload.max_tokens, system: SYSTEM_MAIN, messages: buildDocMessage(p2) });
        console.log('[CALL1b] ' + (Date.now()-t1b) + 'ms, ' + r1b.text.length + ' chars');
        totalTokens += r1b.tokens;

        const combined = 'PARTY 1 (CLIENT):\n' + r1a.text + '\n\nPARTY 2 (SERVICE PROVIDER):\n' + r1b.text;
        const t2 = Date.now();
        const r2 = await callAnthropic({ model: payload.model, max_tokens: payload.max_tokens, system: SYSTEM_FORMAT, messages: [{ role: 'user', content: FMT['obligations'] + '\n\n' + combined }] });
        console.log('[CALL2] ' + (Date.now()-t2) + 'ms');
        totalTokens += r2.tokens;
        finalText = r2.text;

      } else if (TWO_CALL_MODES.includes(mode)) {
        // TWO-CALL PIPELINE
        console.log('[PIPELINE] two calls');

        const t1 = Date.now();
        const r1 = await callAnthropic({ model: payload.model, max_tokens: payload.max_tokens, system: SYSTEM_MAIN, messages: buildDocMessage(promptText) });
        console.log('[CALL1] ' + (Date.now()-t1) + 'ms, ' + r1.text.length + ' chars');
        totalTokens += r1.tokens;

        const formatPrompt = (FMT[mode] || '') + '\n\n' + r1.text;
        const t2 = Date.now();
        const r2 = await callAnthropic({ model: payload.model, max_tokens: payload.max_tokens, system: SYSTEM_FORMAT, messages: [{ role: 'user', content: formatPrompt }] });
        console.log('[CALL2] ' + (Date.now()-t2) + 'ms');
        totalTokens += r2.tokens;
        finalText = r2.text;

      } else {
        // SINGLE CALL (risks, custom, chat)
        console.log('[PIPELINE] single call');

        if (extractedText) {
          payload.messages = buildDocMessage(promptText);
        }
        payload.system = payload.system || SYSTEM_MAIN;

        const t1 = Date.now();
        const r1 = await callAnthropic(payload);
        console.log('[CALL1] ' + (Date.now()-t1) + 'ms');
        totalTokens += r1.tokens;
        finalText = r1.text;
      }

      const totalTime = Date.now() - totalStart;
      console.log('[TOTAL] ' + totalTime + 'ms, tokens=' + totalTokens);

      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({
        content: [{ type: 'text', text: finalText }],
        usage: { input_tokens: Math.floor(totalTokens * 0.7), output_tokens: Math.floor(totalTokens * 0.3) }
      }));

    } catch(err) {
      console.log('[FATAL] ' + err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: err.message } }));
    }
  });
}

const server = http.createServer(function(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
    res.end();
    return;
  }
  const pathname = url.parse(req.url).pathname;
  if (pathname === '/api/analyze' && req.method === 'POST') {
    handleAnalyze(req, res);
    return;
  }
  let filePath = pathname === '/' ? '/index.html' : pathname;
  filePath = path.join(__dirname, 'public', filePath);
  const ext = path.extname(filePath);
  serveFile(res, filePath, MIME[ext] || 'text/plain');
});

server.listen(PORT, function() {
  console.log('Lexis Intelligence v2 running on port ' + PORT);
  if (!API_KEY) console.warn('WARNING: ANTHROPIC_API_KEY not set.');
});
