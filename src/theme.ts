// Neon is the single site theme, including visits with old theme URLs.
document.documentElement.dataset.theme = 'neon';
const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
if (icon) icon.href = '/favicon.svg';
document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#101216');
