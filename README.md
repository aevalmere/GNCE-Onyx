# GNCE Onyx — FTC Team Website

Website for GNCE Onyx, a rookie [FIRST Tech Challenge](https://www.firstinspires.org/robotics/ftc)
team at Weston High School competing in the 2026-2027 BIOBUZZ season.
Design system, navigation, and core content are in; season content, photos,
the team number, and contact handles are still marked placeholders.

## Stack

- [Astro](https://astro.build) — static site framework
- [Tailwind CSS 4](https://tailwindcss.com) — styling (tokens in `src/styles/global.css`)
- [Lenis](https://lenis.darkroom.engineering) — smooth scrolling
- Grenze Gotisch + Vollkorn + Vollkorn SC (self-hosted via Fontsource)

## Commands

| Command | Action |
| --- | --- |
| `npm install` | Install dependencies |
| `npm run dev` | Dev server at `localhost:4321` |
| `npm run build` | Production build to `./dist/` |
| `npm run preview` | Preview the production build |

## Structure

```
src/
├── layouts/
│   └── BaseLayout.astro   # Shared shell: nav, footer, intro cover, motion
├── components/
│   ├── home/              # The eight one-page sections
│   ├── GearNav.astro      # Corner toggle + right-side drawer nav
│   ├── Reveal.astro       # Scroll-driven entrance wrapper
│   ├── Placeholder.astro  # Invisible marker for open content slots
│   ├── SectionLabel.astro # Small-caps section labels
│   └── Footer.astro       # Small-print bar (blog + lab pages)
├── pages/
│   ├── index.astro        # The whole site, one scrolling page
│   └── outreach/          # One page per blog post
├── content/
│   └── blog/              # Blog posts (one .md file per post)
└── styles/
    └── global.css         # Design tokens, bands, textures, reveal system
```

## Blog

The Outreach section of the home page lists the blog. Each post is one
markdown file in `src/content/blog/` with `title`, `date`, `description`
(and optional `author`) frontmatter; the filename becomes the URL
(`/outreach/<filename>/`). Photos go in `public/`; reference them as
`![alt](/GNCE-Onyx/photo-name.jpg)`. Post pages run the paper scheme with
a back button; there are no comments or view counters.

## Dropping in remaining content

Two kinds of placeholder marks:

- **Blocks** still waiting on content (robot photo/specs, season log, match
  results, gallery, sponsorship tiers) are wrapped in `<Placeholder name="...">`,
  a dashed orange frame with a visible tag. Replace the contents, then remove
  the wrapper (keep its children).
- **Inline stubs** (team `#XXXXX`, `[placeholder]@gmail.com`, `@placeholder`,
  TBD dates) carry a dashed-underline `.stub` span. Replace text, drop the span.

Find every remaining slot:

```sh
grep -rn "data-placeholder\|<Placeholder\|class=\"stub\"\|stub\"" src/
```

The contact-form link, email, and Instagram are stubs until the real ones exist.

## Design system

Visual direction, tokens, type, and motion rules live in [`DESIGN.md`](./DESIGN.md).
Animation philosophy comes from the Emil Kowalski skills installed in
[`.claude/skills/`](./.claude/skills/) — Claude Code picks these up
automatically when working in this repo.
