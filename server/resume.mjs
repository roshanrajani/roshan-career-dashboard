import { createHash } from 'node:crypto';

export function createResumeHandler({ notify, readResume, origins, now = Date.now }) {
  const attempts = new Map();
  let total = { start: now(), count: 0 };
  return async function handle(request, response) {
    const json = (status, message) => {
      response.writeHead(status, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: message }));
    };
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Vary', 'Origin');
    if (!origins.includes(request.headers.origin)) return json(403, 'Origin not allowed.');
    response.setHeader('Access-Control-Allow-Origin', request.headers.origin);
    if (request.method === 'OPTIONS') {
      response.writeHead(204, { 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600' });
      return response.end();
    }
    if (request.method !== 'POST') return json(405, 'Use POST.');
    if (!request.headers['content-type']?.startsWith('application/json')) return json(415, 'Use JSON.');
    let payload;
    try {
      let body = '';
      for await (const chunk of request) {
        body += chunk.toString();
        if (Buffer.byteLength(body) > 2048) return json(413, 'Request too large.');
      }
      payload = JSON.parse(body);
    } catch { return json(400, 'Invalid request.'); }
    const email = typeof payload?.email === 'string' ? payload.email.trim() : '';
    if (email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) || payload?.consent !== true || payload?.website) {
      return json(400, 'A valid email and consent are required.');
    }
    const time = now();
    // Bound memory and email volume without storing visitors' addresses in logs.
    for (const [key, value] of attempts) if (time - value.start >= 900000) attempts.delete(key);
    const key = createHash('sha256').update(email.toLowerCase()).digest('hex');
    const record = attempts.get(key) || { start: time, count: 0 };
    if (time - total.start >= 900000) total = { start: time, count: 0 };
    if (record.count >= 3 || total.count >= 30) return json(429, 'Please try again later.');
    record.count++; total.count++; attempts.set(key, record);
    try {
      const file = await readResume();
      if (!Buffer.isBuffer(file) || file.subarray(0, 5).toString() !== '%PDF-') throw new Error('Invalid PDF');
      // Fail closed: never release the PDF if the notification is rejected.
      await notify({ email, requestedAt: new Date(time).toISOString() });
      response.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="Roshan_Rajani_Frontend.pdf"',
        'Content-Length': file.length,
      });
      response.end(file);
    } catch {
      json(503, 'Download service unavailable.');
    }
  };
}
