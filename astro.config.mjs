// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';
import rehypeExternalLinks from 'rehype-external-links';

// https://astro.build/config
export default defineConfig({
  // GitHub Pages project site: served under /GNCE-Onyx/
  site: 'https://darkelights-del.github.io',
  base: '/GNCE-Onyx',
  // The old standalone pages now live as sections of the one-page home.
  redirects: {
    '/season': '/GNCE-Onyx/#season',
    '/contact': '/GNCE-Onyx/#contact',
    '/outreach': '/GNCE-Onyx/#outreach',
  },
  // External links in post bodies leave the site, so they open their own tab.
  markdown: {
    rehypePlugins: [[rehypeExternalLinks, { target: '_blank', rel: ['noopener'] }]],
  },
  vite: {
    plugins: [tailwindcss()]
  }
});
