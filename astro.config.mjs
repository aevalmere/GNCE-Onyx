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
  // Astro's stock image service resizes without sharpening, so every
  // rendition ships softer than its source. This is that service with one
  // unsharp pass added after the resize; see the file for what it does and
  // does not touch. Set `sharpen: false` to fall back to stock behaviour.
  image: {
    service: {
      entrypoint: './src/lib/sharpen-image-service.mjs',
      config: {
        sharpen: { sigma: 0.75 },
        // sharp defaults WebP to 80, which blocks up in fine detail: the
        // pine needles behind Ethan Zhang go crunchy and skin goes waxy.
        // 90 clears both. 95 costs another 30% for almost nothing.
        webp: { quality: 90 },
      },
    },
  },
  // External links in post bodies leave the site, so they open their own tab.
  markdown: {
    rehypePlugins: [[rehypeExternalLinks, { target: '_blank', rel: ['noopener'] }]],
  },
  vite: {
    plugins: [tailwindcss()]
  }
});
