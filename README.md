# GNCE Onyx — FTC Team Website

Website for GNCE Onyx, team 37122, a rookie [FIRST Tech Challenge](https://www.firstinspires.org/robotics/ftc)
team at Weston High School competing in the 2026-2027 BIOBUZZ season.

The whole site is one scrolling page. Blog posts and the drivetrain
calculator are the only separate routes.

## Stack

- [Astro](https://astro.build) — static site framework
- [Tailwind CSS 4](https://tailwindcss.com) — styling (tokens in `src/styles/global.css`, no config file)
- [GSAP](https://gsap.com) + ScrollTrigger and [Lenis](https://lenis.darkroom.engineering) — the motion engine
- LEMON MILK Medium (display, self-hosted in `src/assets/fonts/`), Grey Qo and Ubuntu (via Fontsource)

## Commands

| Command | Action |
| --- | --- |
| `npm install` | Install dependencies |
| `npm run dev` | Dev server at `localhost:4321` |
| `npm run build` | Production build to `./dist/`, and the type/syntax check |
| `npm run preview` | Preview the production build |

## Structure

```
src/
├── layouts/
│   └── BaseLayout.astro   # Shared shell: nav, footer, intro cover, heat rail, motion
├── components/
│   ├── home/              # The six one-page sections
│   ├── GearNav.astro      # Corner toggle + right-side drawer nav
│   ├── Reveal.astro       # Scroll-driven entrance wrapper
│   ├── Placeholder.astro  # Invisible marker for open content slots
│   └── Footer.astro       # Small-print bar (blog pages only)
├── pages/
│   ├── index.astro        # The whole site, one scrolling page
│   ├── drivetrain.astro   # The FTC drivetrain calculator, a self-contained tool page
│   └── outreach/          # One page per blog post
├── content/
│   └── blog/              # Blog posts (one .md file per post)
├── scripts/
│   └── motion.ts          # Motion engine: primitives + named scenes
└── styles/
    └── global.css         # Design tokens, bands, reveal system
```

The six home sections, in order: Hero, Team, Season, Outreach, Sponsors,
Finale. The Finale carries the contact line, so the home page runs no footer.

## Blog

The Outreach section of the home page lists the blog. Each post is one
markdown file in `src/content/blog/` with `title`, `date`, `description`
(and optional `author`) frontmatter; the filename becomes the URL
(`/outreach/<filename>/`). Photos go in `public/`; reference them as
`![alt](/GNCE-Onyx/photo-name.jpg)`. Post pages run the paper scheme with
a back button and a reading-progress bar; there are no comments or view
counters.

## Roster photos

Save a square photo as `src/assets/team/<slug>.<ext>`, where the slug is the
member's name from `Team.astro`'s `roster` array, lowercased and hyphenated.
It replaces that member's silhouette automatically, so faces can land one at
a time. Crop to square with `-auto-orient` applied first, aim for the head at
45-50% of the frame, and keep the source at 520px or better. Five of the
ten are in.

## Dropping in remaining content

Blocks still waiting on content (season highlights and galleries) are wrapped
in `<Placeholder name="...">`, which renders nothing visible: it only stamps a
`data-placeholder` attribute so open slots are one search away. Replace the
contents, then remove the wrapper and keep its children.

Inline unknowns use a `.stub` span (a dashed grape underline). Nothing wears
one at the moment; the convention stands for the next one.

Find every remaining slot:

```sh
grep -rn "data-placeholder\|<Placeholder\|class=\"stub\"" src/
```

## Design system

Visual direction, tokens, type, and motion rules live in [`DESIGN.md`](./DESIGN.md).
Working notes for agents are in [`AGENTS.md`](./AGENTS.md). Animation
philosophy comes from the skills installed in [`.claude/skills/`](./.claude/skills/),
which Claude Code picks up automatically when working in this repo.
