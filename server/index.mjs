import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import nodemailer from 'nodemailer';
import { createResumeHandler } from './resume.mjs';

const env = process.env;
const recipient = 'roshanrajani45@gmail.com';
const configured = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD'].every(key => env[key]);
const mail = configured ? nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: Number(env.SMTP_PORT || 465),
  secure: (env.SMTP_PORT || '465') === '465',
  requireTLS: true,
  auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
  connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
  disableFileAccess: true, disableUrlAccess: true,
}) : null;

const handler = createResumeHandler({
  origins: (env.ALLOWED_ORIGINS || 'http://localhost:5173').split(',').map(value => value.trim()),
  readResume: () => readFile(env.RESUME_PDF_PATH || '.private/resume.pdf'),
  notify: async ({ email, requestedAt }) => {
    if (!mail) throw new Error('SMTP is not configured');
    const result = await mail.sendMail({
      from: env.SMTP_USER, to: recipient,
      subject: 'New resume download request — roshanrajani.com',
      text: `A visitor requested your resume.\n\nEmail: ${email}\nTime (UTC): ${requestedAt}\n\nThey agreed to share their email for this request. The website releases the PDF after this notification is accepted. This does not confirm that the visitor saved or opened the file.`,
    });
    if (!result.accepted?.includes(recipient)) throw new Error('Notification rejected');
  },
});

createServer((request, response) => {
  if (request.url !== '/api/resume') { response.writeHead(404); response.end(); return; }
  handler(request, response).catch(() => {
    if (!response.headersSent) response.writeHead(500);
    response.end();
  });
}).listen(Number(env.PORT || 3001), env.HOST || '127.0.0.1', () => {
  console.log(`Resume API listening on port ${env.PORT || 3001}. Email ${configured ? 'configured' : 'not configured; downloads remain locked'}.`);
});
