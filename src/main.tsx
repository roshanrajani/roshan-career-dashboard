import { StrictMode, useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Layers,
  ArrowUpRight,
  Search,
  Bookmark,
  Github,
  Linkedin,
  Mail,
  Check,
  X,
} from 'lucide-react';
import { experiences, projects, skills, education, recognition } from './data';
import './theme.css';
import './theme';
import './style.css';

import { Game } from './Game';
import { ResumeDownload } from './ResumeDownload';
import { FluidCanvas } from './FluidCanvas';
type View = 'Overview' | 'Projects' | 'Skills' | 'Games' | 'Saved';
function App() {
  const [view, setView] = useState<View>('Overview'),
    [query, setQuery] = useState(''),
    [category, setCategory] = useState('All'),
    [selected, setSelected] = useState<(typeof projects)[number] | null>(null);
  const [saved, setSaved] = useState<string[]>(() => {
    try {
      const value = JSON.parse(localStorage.getItem('career-saved') || '[]');
      return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
    } catch {
      return [];
    }
  });
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    try {
      localStorage.setItem('career-saved', JSON.stringify(saved));
    } catch {}
  }, [saved]);
  useEffect(() => {
    if (selected) dialog.current?.showModal();
    else dialog.current?.close();
  }, [selected]);
  const toggle = (id: string) =>
    setSaved((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const matches = (s: string) => s.toLowerCase().includes(query.toLowerCase());
  const nav = (v: View) => {
    setView(v);
    setQuery('');
    setCategory('All');
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  const visibleProjects = projects.filter(
    (p) =>
      matches([p.name, p.client, p.category, p.description, ...p.tags].join(' ')) &&
      (view !== 'Saved' || saved.includes(p.id)),
  );
  return (
    <div className="shell">
      <FluidCanvas />
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            nav('Overview');
          }}
        >
          <span className="brandmark">r.</span>
          <span>by roshan</span>
        </a>
        <nav aria-label="Main navigation">
          {(['Overview', 'Projects', 'Skills'] as const).map((name) => (
            <button
              key={name}
              aria-current={view === name ? 'page' : undefined}
              className={view === name ? 'active' : ''}
              onClick={() => nav(name)}
            >
              <span>{name === 'Overview' ? 'Home' : name}</span>
            </button>
          ))}
        </nav>
        <div className="header-actions">
          <a
            className="header-github"
            href="https://github.com/roshanrajani"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Roshan on GitHub (opens in a new tab)"
          >
            <Github size={16} aria-hidden="true" />
            <span>GitHub</span>
          </a>
          <a
            className="header-github"
            href="https://linkedin.com/in/roshr234"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Roshan on LinkedIn (opens in a new tab)"
          >
            <Linkedin size={16} />
            <span>LinkedIn</span>
          </a>
          <a
            className="header-github"
            href="mailto:roshanrajani45@gmail.com"
            aria-label="Email Roshan (opens your email app)"
          >
            <Mail size={16} aria-hidden="true" />
            <span>Email me</span>
          </a>
        </div>
      </header>
      <div className="workspace">
        <main id="main">
          {view === 'Overview' ? (
            <>
              <section className="hero">
                <div className="hero-topline">
                  <span>
                    <span className="dot" /> SENIOR / LEAD FRONTEND ENGINEER · JERSEY CITY, NJ
                  </span>
                  <span>ANGULAR · REACT · TYPESCRIPT</span>
                </div>
                <div className="hero-grid">
                  <div className="hero-copy">
                    <p className="hello">
                      Hey, I’m Roshan <span>↗</span>
                    </p>
                    <h1>
                      Complex systems.
                      <br />
                      <em>Clear experiences.</em>
                    </h1>
                    <p className="hero-description">
                      I’m Roshan Rajani, a senior / lead frontend engineer with 10+ years of
                      experience building secure enterprise applications in retirement, banking,
                      payments, and HR.
                    </p>
                    <div className="hero-actions">
                      <button className="hero-button" onClick={() => nav('Projects')}>
                        Explore my work <ArrowUpRight size={20} />
                      </button>
                      <ResumeDownload />
                    </div>
                    <div className="hero-footnote">
                      <span /> CURRENTLY BUILDING AT <strong>Transamerica</strong>
                    </div>
                  </div>
                  <div className="portrait-composition">
                    <div className="portrait-outline" />
                    <figure className="portrait-frame">
                      <img
                        src="/images/roshan.webp"
                        alt="Roshan Rajani outdoors, wearing a beige suit and sunglasses"
                      />
                      <figcaption>
                        <span>THE HUMAN BEHIND THE CODE</span>
                        <strong>Roshan Rajani</strong>
                      </figcaption>
                    </figure>
                  </div>
                </div>
                <div className="company-strip">
                  <span>TEAMS I’VE BUILT WITH</span>
                  <div>
                    {['Transamerica', 'Wells Fargo', 'IBM', 'Paychex', 'Serco'].map((c) => (
                      <span key={c}>{c}</span>
                    ))}
                  </div>
                </div>
              </section>
              <section className="intro-section">
                <span className="eyebrow">01 / THE APPROACH</span>
                <div>
                  <h2>
                    Complex under the hood.
                    <br />
                    <span>Effortless on the surface.</span>
                  </h2>
                  <p>
                    I work across frontend architecture, API contracts, accessibility, and
                    production delivery. My focus is turning complex financial workflows into
                    interfaces people can navigate with confidence.
                  </p>
                  <div className="principles">
                    <span>
                      <Layers size={18} /> Systems that scale
                    </span>
                    <span>
                      <Check size={18} /> Accessible by design
                    </span>
                    <span>
                      <ArrowUpRight size={18} /> Production ownership
                    </span>
                  </div>
                </div>
              </section>
            </>
          ) : (
            <section className={'page-heading ' + (view === 'Games' ? 'game-heading' : '')}>
              <span className="eyebrow">
                {view === 'Games'
                  ? 'OFF THE CLOCK / ON THE GRID'
                  : 'EXPERIENCE / ENGINEERING / DELIVERY'}
              </span>
              <h1>
                {
                  {
                    Projects: 'Selected engineering work.',
                    Skills: 'A toolkit with purpose.',
                    Games: 'A little room to play.',
                    Saved: 'The work you kept.',
                  }[view]
                }
              </h1>
              <p>
                {
                  {
                    Projects:
                      'Selected work across retirement, platform modernization, financial risk, payroll, and internal HR.',
                    Skills: 'The tools and practices behind the experience.',
                    Games: 'Take a detour. Dodge the traffic. Chase your next high score.',
                    Saved: 'Your personal shortlist, saved in this browser.',
                  }[view]
                }
              </p>
            </section>
          )}
          {view === 'Games' && <Game />}
          {view !== 'Overview' && view !== 'Games' && (
            <div className="toolbar">
              <label className="search">
                <Search size={17} />
                <input
                  aria-label="Search portfolio"
                  placeholder={`Search ${view.toLowerCase()}…`}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              {view === 'Skills' && (
                <select
                  aria-label="Filter category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  {['All', ...skills.map((s) => s.category)].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              )}
            </div>
          )}
          <div className={view === 'Overview' ? 'overview-grid' : 'detail-grid'}>
            {view === 'Overview' && (
              <section className="panel">
                <div className="section-title">
                  <div>
                    <span className="eyebrow">02 / THE JOURNEY</span>
                    <h2>Built along the way.</h2>
                  </div>
                </div>
                <div className="timeline">
                  {experiences
                    .filter((e) => matches([e.company, e.role, e.description, ...e.tags].join(' ')))
                    .map((e, i) => (
                      <article className="timeline-row" key={e.company + e.period}>
                        <div className={'company-icon c' + i}>{e.company[0]}</div>
                        <div>
                          <div className="row-title">
                            <h3>{e.company}</h3>
                            {e.period.includes('Present') && (
                              <span className="current">Current</span>
                            )}
                          </div>
                          <p>{e.role}</p>
                          <small>
                            {e.period} · {e.location}
                          </small>
                          <p className="experience-summary">{e.description}</p>
                          <div className="tags">
                            {e.tags.map((t) => (
                              <span key={t}>{t}</span>
                            ))}
                          </div>
                        </div>
                      </article>
                    ))}
                  {!experiences.some((e) =>
                    matches([e.company, e.role, e.description, ...e.tags].join(' ')),
                  ) && <p className="empty">No experience matches your search.</p>}
                </div>
              </section>
            )}
            {(view === 'Overview' || view === 'Skills') && (
              <section className="panel skills-panel">
                <div className="section-title">
                  <div>
                    <span className="eyebrow">03 / THE TOOLKIT</span>
                    <h2>The right tools.</h2>
                  </div>
                  <Layers size={20} />
                </div>
                {skills
                  .filter((s) => category === 'All' || s.category === category)
                  .map((s) => (
                    <div className="skill-group" key={s.category}>
                      <span>{s.category}</span>
                      <div>
                        {(view === 'Overview' ? s.items.slice(0, 4) : s.items)
                          .filter(matches)
                          .map((skill, i) => (
                            <span className="skill-chip" key={skill}>
                              <span className={'skill-dot d' + i} />
                              {skill}
                            </span>
                          ))}
                      </div>
                    </div>
                  ))}
                {!skills
                  .filter((s) => category === 'All' || s.category === category)
                  .some((s) => s.items.some(matches)) && (
                  <p className="empty">No skills match your search.</p>
                )}
                <p className="panel-foot">
                  {view === 'Overview' ? (
                    <button className="text-button" onClick={() => nav('Skills')}>
                      Explore the full toolkit <ArrowUpRight size={16} />
                    </button>
                  ) : (
                    'A toolkit for accessible, scalable interfaces.'
                  )}
                </p>
                {view === 'Skills' && (
                  <>
                    <div className="credential-block">
                      <span className="eyebrow">EDUCATION</span>
                      {education.map((e) => (
                        <p key={e.degree}>
                          <strong>{e.degree}</strong>
                          <br />
                          <small>{e.school}</small>
                        </p>
                      ))}
                    </div>
                    <div className="credential-block">
                      <span className="eyebrow">RECOGNITION</span>
                      <p>
                        <strong>{recognition}</strong>
                      </p>
                    </div>
                  </>
                )}
              </section>
            )}
          </div>
          {(view === 'Overview' || view === 'Projects' || view === 'Saved') && (
            <section className="projects-section">
              <div className="section-title">
                <div>
                  <span className="eyebrow">04 / SELECTED WORK</span>
                  <h2>{view === 'Saved' ? 'Saved projects' : 'Selected projects.'}</h2>
                </div>
                {view === 'Overview' && (
                  <button className="text-button" onClick={() => nav('Projects')}>
                    All projects <ArrowUpRight size={15} />
                  </button>
                )}
              </div>
              <div className="project-grid">
                {(view === 'Overview'
                  ? visibleProjects.filter((p) =>
                      ['tar-px-mirror', 'retirement', 'risk'].includes(p.id),
                    )
                  : visibleProjects
                ).map((p) => (
                  <article className="project" key={p.id}>
                    <div className="project-body">
                      <div className="project-top">
                        <span className="client-badge">{p.client}</span>
                        <button
                          className="icon-button"
                          aria-label={`${saved.includes(p.id) ? 'Unsave' : 'Save'} ${p.name}`}
                          aria-pressed={saved.includes(p.id)}
                          onClick={() => toggle(p.id)}
                        >
                          {saved.includes(p.id) ? <Check size={18} /> : <Bookmark size={18} />}
                        </button>
                      </div>
                      <button className="project-link" onClick={() => setSelected(p)}>
                        {p.name}
                        <ArrowUpRight size={20} />
                      </button>
                      <span className="project-category">{p.category}</span>
                      <p>{p.description}</p>
                      <div className="tags">
                        {p.tags.map((t) => (
                          <span key={t}>{t}</span>
                        ))}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
              {!visibleProjects.length && (
                <div className="empty">
                  <Bookmark />
                  <h3>
                    {view === 'Saved'
                      ? 'A little space for your favorites.'
                      : 'No matching projects.'}
                  </h3>
                  <p>
                    {view === 'Saved'
                      ? 'Save a project to keep it here on this browser.'
                      : 'Try a different project, client, or technology.'}
                  </p>
                  <button className="outline-button" onClick={() => nav('Projects')}>
                    Browse projects
                  </button>
                </div>
              )}
            </section>
          )}
          {view === 'Overview' && (
            <section className="leadership-section">
              <span className="eyebrow">HOW I CONTRIBUTE</span>
              <h2>Beyond the component.</h2>
              <div className="leadership-grid">
                <article>
                  <h3>Architecture & integration</h3>
                  <p>
                    Reusable frontend patterns, REST and GraphQL contracts, and secure access across
                    services.
                  </p>
                </article>
                <article>
                  <h3>Team & delivery</h3>
                  <p>
                    Design reviews, code reviews, mentoring, testing, and release coordination
                    across engineering and QA.
                  </p>
                </article>
                <article>
                  <h3>Production ownership</h3>
                  <p>
                    Logging, monitoring, root-cause analysis, and validation after release to keep
                    critical journeys reliable.
                  </p>
                </article>
              </div>
              <p className="award-note">Recognition · {recognition}</p>
            </section>
          )}
          <footer>
            <a
              className="footer-brand"
              href="#"
              onClick={(e) => {
                e.preventDefault();
                nav('Overview');
              }}
            >
              r.
            </a>
            <span>© {new Date().getFullYear()} Roshan Rajani</span>
            <div className="footer-extras">
              <button className="text-button" onClick={() => nav('Games')}>
                Playground
              </button>
              <button className="text-button" onClick={() => nav('Saved')}>
                Saved work ({saved.length})
              </button>
            </div>
            <span>
              <a href="https://github.com/roshanrajani" target="_blank" rel="noreferrer">
                <Github size={16} /> GitHub <ArrowUpRight size={15} />
              </a>
            </span>
          </footer>
        </main>
      </div>
      <dialog
        aria-label="Project details"
        ref={dialog}
        onCancel={() => setSelected(null)}
        onClick={(e) => {
          if (e.target === dialog.current) setSelected(null);
        }}
      >
        <button
          className="close icon-button"
          aria-label="Close project details"
          onClick={() => setSelected(null)}
        >
          <X />
        </button>
        {selected && (
          <>
            <span className="client-badge">{selected.client}</span>
            <p className="eyebrow">{selected.category}</p>
            <h2>{selected.name}</h2>
            <p>{selected.description}</p>
            <p className="work-context">{selected.context}</p>
            <h3>My contributions</h3>
            <ul>
              {selected.focus.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            <div className="tags">
              {selected.tags.map((t) => (
                <span key={t}>{t}</span>
              ))}
            </div>
            <p className="source-note">
              Selected contributions and project context. Employer code and internal screens are not
              published here.
            </p>
            <button className="outline-button" onClick={() => toggle(selected.id)}>
              {saved.includes(selected.id) ? 'Remove from saved' : 'Save project'}
            </button>
          </>
        )}
      </dialog>
    </div>
  );
}
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
