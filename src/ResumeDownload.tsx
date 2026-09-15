import { useRef, useState } from 'react';
import { Download, X, Check } from 'lucide-react';

export function ResumeDownload() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [complete, setComplete] = useState(false);
  const pending = useRef(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      const form = new FormData(event.currentTarget);
      const response = await fetch(import.meta.env.VITE_RESUME_API_URL || '/api/resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), consent: form.get('consent') === 'on', website: form.get('website') }),
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok || !response.headers.get('content-type')?.includes('application/pdf')) {
        throw new Error(response.status === 429 ? 'Too many requests. Please try again in a few minutes.' : 'The download service is unavailable. Please try again later or contact Roshan.');
      }
      const blob = await response.blob();
      if (!blob.size) throw new Error('The file could not be downloaded. Please try again.');
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'Roshan_Rajani_Frontend.pdf';
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
      setComplete(true);
    } catch (failure) {
      setError(failure instanceof Error && failure.name !== 'TimeoutError' ? failure.message : 'The request timed out. Please try again.');
    } finally {
      setBusy(false);
      pending.current = false;
    }
  }

  return <>
    <button className="resume-link" onClick={() => { setError(''); setComplete(false); dialog.current?.showModal(); }}><Download size={17}/> Get my resume</button>
    <dialog ref={dialog} className="resume-dialog" aria-labelledby="resume-title" onCancel={event => { if (busy) event.preventDefault(); }}>
      <button type="button" className="close icon-button" aria-label="Close resume form" disabled={busy} onClick={() => dialog.current?.close()}><X/></button>
      <span className="eyebrow">LET’S MAKE AN INTRODUCTION</span>
      <h2 id="resume-title">{complete ? 'Your resume is on its way.' : 'Get to know my work.'}</h2>
      {complete ? <div role="status"><p><Check size={18}/> Your download has started. Check your browser’s downloads.</p><button className="outline-button" onClick={() => dialog.current?.close()}>Done</button></div> : <form onSubmit={submit} aria-busy={busy}>
        <p>Enter your email to download my resume. Your email address will be sent to me with a notification about your request.</p>
        <label className="resume-email-label" htmlFor="resume-email">Email address</label>
        <input id="resume-email" name="email" type="email" autoComplete="email" maxLength={254} required value={email} onChange={event => setEmail(event.target.value)} placeholder="you@company.com" disabled={busy}/>
        <div className="resume-honeypot" aria-hidden="true"><label>Leave this blank<input name="website" tabIndex={-1} autoComplete="off"/></label></div>
        <label className="resume-consent"><input type="checkbox" name="consent" required disabled={busy}/><span>I agree to share my email with Roshan for this resume request.</span></label>
        {error && <p className="resume-error" role="alert">{error} <a href="mailto:roshanrajani45@gmail.com">Email Roshan</a></p>}
        <button className="hero-button" type="submit" disabled={busy}><Download size={17}/>{busy ? 'Preparing your download…' : 'Download resume'}</button>
      </form>}
    </dialog>
  </>;
}
