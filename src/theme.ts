// Initialize once before React renders; refreshes rotate away from the last theme.
const themes = ['neon', 'orange', 'blue'] as const;
const requested = new URLSearchParams(window.location.search).get('theme');
let previous: string | null = null;
try { previous = sessionStorage.getItem('site-theme'); } catch { /* Storage can be disabled. */ }
const choices = themes.filter(theme => theme !== previous);
const theme = themes.find(theme => theme === requested)
  ?? choices[Math.floor(Math.random() * choices.length)];
document.documentElement.dataset.theme = theme;
try { sessionStorage.setItem('site-theme', theme); } catch { /* Theme still works without storage. */ }
const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
if (icon) icon.href = theme === 'neon' ? '/favicon.svg' : `/favicon-${theme}.svg`;
document.querySelector('meta[name="theme-color"]')?.setAttribute('content',
  { neon: '#101211', orange: '#191210', blue: '#0d1420' }[theme]);
