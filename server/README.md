# Resume email gate

The website posts an email address and consent to `/api/resume`. The API validates
the request, reads the private PDF, sends a notification to
`roshanrajani45@gmail.com`, and returns the PDF only after SMTP accepts that email.
No direct public PDF link remains in the current build. A browser cannot prove
that a visitor saved/opened a file, so notifications say “download requested.”

## Local setup

1. Copy `.env.example` to `.env` and set server-only SMTP credentials there.
   Never use a `VITE_` prefix for secrets. Do not commit `.env`.
2. The existing resume has been copied to ignored `.private/resume.pdf` locally.
3. Run `node --env-file=.env server/index.mjs` and `npm run dev` separately.
   Vite proxies `/api/resume` to port 3001. If no `.env` exists, the server still
   starts with `node server/index.mjs`; downloads correctly fail until configured.
4. Run `node --test server/resume.test.mjs`. Tests use fake mail delivery and a
   test PDF, never send real notifications, and never need credentials.

## Deployment still required

GitHub Pages only runs the frontend. Deploy the Node server on a backend host,
set `HOST=0.0.0.0`, and supply SMTP credentials in that host's secret settings.
Upload the PDF to private backend storage and point `RESUME_PDF_PATH` at it.
Set `ALLOWED_ORIGINS` to the exact portfolio origins. Serve the backend over HTTPS.
Set the GitHub repository variable `VITE_RESUME_API_URL` to its full HTTPS
`/api/resume` endpoint and rebuild the Pages site.

The mail recipient is fixed server-side. The email entered by a visitor is
syntactically validated, not ownership-verified. The visitor's address appears
only in the notification, not in app logs. Rate limits are per process (three
requests per email and thirty total every fifteen minutes); use shared limits
and bot protection at the host before scaling to multiple instances.

Removing the public PDF prevents the current website bypass. Earlier copies
already published in Git history or downloaded by others cannot be recalled.
Do not place a future private resume in a public repository or static directory.

Do not deploy the gated frontend until the backend is configured and real email
delivery has been verified, or visitors will only see an unavailable message.
