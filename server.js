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

function serveFile(res, filePath, contentType) {
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

async function extractText(buffer, fileType) {
  if (fileType === 'docx' || fileType === 'doc') {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }
  if (fileType === 'xlsx' || fileType === 'xls') {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    let text = '';
    workbook.SheetNames.forEach(sheetName => {
      text += `\n=== Sheet: ${sheetName} ===\n`;
      text += XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName]);
    });
    return text;
  }
  if (fileType === 'pptx') {
    const xml = buffer.toString('utf8');
    const matches = xml.match(/<a:t[^>]*>([^<]+)<\/a:t>/g) || [];
    return matches.map(m => m.replace(/<[^>]+>/g, '')).join('\n');
  }
  return null;
}

function handleAnalyze(req, res) {
  let body = '';
  req.on('data', chunk => { body += chunk.toString(); });
  req.on('end', async () => {
    try {
      const payload = JSON.parse(body);
      const fileType = payload._fileType;
      const fileData = payload._fileData;
      const officeTypes = ['doc', 'docx', 'xlsx', 'xls', 'pptx'];

      if (fileType && fileData && officeTypes.includes(fileType)) {
        const buffer = Buffer.from(fileData, 'base64');
        let extractedText = '';
        try {
          extractedText = await extractText(buffer, fileType);
          if (!extractedText || extractedText.trim().length === 0) {
            extractedText = '[Document text could not be extracted]';
          }
        } catch (e) {
          extractedText = `[Extraction error: ${e.message}]`;
        }

        if (payload.messages && payload.messages[0]) {
          const lastBlock = payload.messages[0].content;
          const promptBlock = Array.isArray(lastBlock)
            ? lastBlock.find(b => b.type === 'text')
            : null;
          const promptText = promptBlock ? promptBlock.text : '';

          payload.messages[0].content = [
            {
              type: 'text',
              text: `[Document: ${fileType.toUpperCase()} file]\n\n${extractedText}`
            },
            {
              type: 'text',
              text: promptText
            }
          ];
        }
      }

      delete payload._fileType;
      delete payload._fileData;

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
          res.writeHead(apiRes.statusCode, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          });
          res.end(data);
        });
      });

      apiReq.on('error', err => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: err.message } }));
      });

      apiReq.write(outBody);
      apiReq.end();

    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: err.message } }));
    }
  });
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
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

server.listen(PORT, () => {
  console.log(`Lexis Intelligence v2 running on port ${PORT}`);
  if (!API_KEY) console.warn('WARNING: ANTHROPIC_API_KEY not set.');
});
