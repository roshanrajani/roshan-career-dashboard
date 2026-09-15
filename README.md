# Career OS — Roshan Rajani

A new responsive React + TypeScript career dashboard, adapted from the content in [portfolio-emergent](https://github.com/roshanrajani/portfolio-emergent). The original repository is unchanged.

## Run

Requires Node.js 22 or later.

```sh
npm ci
npm run dev
```

`npm run build` type-checks and creates `dist/`. `npm run preview` serves that build locally. Vite uses a root deployment path by default; for GitHub Pages under a repository path, build with `npm run build -- --base=/roshan-career-dashboard/` (or set Vite's base explicitly).

## Features

- Overview, experience, projects, skills and saved-project views
- Search across career roles, company names, descriptions and tags
- Project technology and skill-category filtering
- Native accessible project dialog with Escape support
- Browser-persisted project bookmarks, with storage error handling
- Responsive desktop/mobile layouts and visible keyboard focus
- Working email, GitHub and portfolio links

`src/data.ts` owns portfolio content. `src/main.tsx` owns the React UI and derived filters. `src/style.css` owns presentation. No backend, analytics, credentials, or paid services are required. Google Fonts is optional; local fallbacks work if unavailable.

## Content provenance

Career entries, listed skills, project titles, descriptions and contact email come from the source portfolio. Current-role information is reproduced as stated there; it has not been independently verified. Counts represent dataset entries, not traffic or live analytics. The source's self-rated skill percentages, performance claims and financial impact figures are deliberately omitted. Project preview illustrations are decorative CSS mockups, not screenshots of client systems. Client source code is not included.

## Publish to a new GitHub repository

Create an empty `roshan-career-dashboard` repository under your account, then from this folder:

```sh
git init -b main
git add .
git commit -m "Build React career dashboard from portfolio content"
git remote add origin https://github.com/roshanrajani/roshan-career-dashboard.git
git push -u origin main
```

If using the prepared local checkout with its existing initial commit, skip initialization and commit steps.

## Source review

See REVIEW.md for findings in the original portfolio and how this implementation addresses them.
