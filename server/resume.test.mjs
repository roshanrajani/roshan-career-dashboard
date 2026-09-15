import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createResumeHandler } from './resume.mjs';

async function fixture(t, notify = async () => {}) {
  const calls = [];
  const server = createServer(createResumeHandler({
    origins: ['https://roshanrajani.com'],
    notify: async payload => { calls.push(payload); await notify(payload); },
    readResume: async () => Buffer.from('%PDF-1.4\nTest document'),
  }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const url = `http://127.0.0.1:${server.address().port}/api/resume`;
  return { calls, request: (body, headers = {}) => fetch(url, { method: 'POST', headers: { Origin: 'https://roshanrajani.com', 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) }) };
}

test('requires valid email and explicit consent; does not notify or release file', async t => {
  const { request, calls } = await fixture(t);
  for (const body of [{}, { email: 'invalid', consent: true }, { email: 'visitor@example.com', consent: false }, { email: 'visitor@example.com', consent: true, website: 'spam' }]) {
    const result = await request(body);
    assert.equal(result.status, 400);
    assert.match(result.headers.get('content-type'), /json/);
  }
  assert.equal(calls.length, 0);
});

test('sends visitor address and returns uncached PDF only after notification', async t => {
  let accepted = false;
  const { request, calls } = await fixture(t, async () => { accepted = true; });
  const result = await request({ email: ' visitor@example.com ', consent: true });
  assert.equal(result.status, 200);
  assert.equal(accepted, true);
  assert.equal(calls[0].email, 'visitor@example.com');
  assert.equal(result.headers.get('cache-control'), 'no-store');
  assert.equal(result.headers.get('content-type'), 'application/pdf');
  assert.match(await result.text(), /^%PDF-/);
});

test('notification failure keeps PDF locked', async t => {
  const { request } = await fixture(t, async () => { throw new Error('SMTP unavailable'); });
  const result = await request({ email: 'visitor@example.com', consent: true });
  assert.equal(result.status, 503);
  assert.doesNotMatch(await result.text(), /%PDF/);
});

test('rejects foreign origins and limits repeated notifications', async t => {
  const { request, calls } = await fixture(t);
  const body = { email: 'visitor@example.com', consent: true };
  assert.equal((await request(body, { Origin: 'https://other.example' })).status, 403);
  for (let i = 0; i < 3; i++) assert.equal((await request(body)).status, 200);
  assert.equal((await request(body)).status, 429);
  assert.equal(calls.length, 3);
});
