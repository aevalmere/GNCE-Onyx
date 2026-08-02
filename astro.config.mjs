// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';

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
  vite: {
    plugins: [tailwindcss()]
  }
});
