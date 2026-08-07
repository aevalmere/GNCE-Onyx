# Agent guide

Astro 7 + Tailwind CSS 4 website for a rookie FIRST Tech Challenge (FTC)
robotics team. The whole site is one scrollable page
(`src/pages/index.astro` composing `src/components/home/`); blog posts, the
`/drivetrain/` calculator, and the parked `/lab/onyx/` page are the only
separate routes. Copy is real;
media and a few identity facts (team number, email, Instagram, form link)
are still placeholder slots.

## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

`npm run build` doubles as the type/syntax check.

## Before touching UI

1. Read `DESIGN.md` — visual direction ("Pit Bay Blueprint"), tokens, type,
   motion rules, component inventory. Follow it; don't invent new colors,
   easings, or patterns ad hoc.
2. Use the skills in `.claude/skills/` for any UI work: `emil-design-eng` +
   `animation-vocabulary` + `review-animations` (animation), `taste`
   (anti-generic frontend rules; note its em-dash ban and eyebrow-restraint
   rules), `frontend-design` (visual direction), and
   `redesign-existing-projects` (audit-first elevation).

## Architecture notes

- Fonts: Uncial Antiqua (display), Grey Qo (script accent), Ubuntu (body).
  Light site: pale slate paper, space indigo as the main color, deep-tinted
  alternate bands, grape for true highlights only; no idle glows, no
  gradient fills. See `DESIGN.md`.
- One shared shell: `src/layouts/BaseLayout.astro` (fonts, GearNav, Footer,
  intro cover, heat rail). It imports the motion engine
  `src/scripts/motion.ts` (GSAP + ScrollTrigger + Lenis): generic
  primitives (`[data-split]` masked lines, `[data-reveal]`/
  `[data-reveal-scrub]` clip wipes, `[data-parallax]`,
  `[data-hover-preview]`, `[data-cursor-card]`) plus named scenes
  (`[data-cover-wipe]`, `[data-hscroll]` horizontal pan,
  `[data-ladder]`, `[data-progress]`). The cover wipe and the finale
  gesture lock run on fine pointers only; touch scrolls the page straight
  through, with just the finale's sticky curtain reveal. Nothing follows
  the cursor on buttons and display type never answers the pointer. All reduced-motion
  safe. No opacity cross-fades.
- The WebGL ONYX word (`src/scripts/onyx3d.ts` + `src/data/onyx-glyphs.ts`)
  is parked on the unlinked page `/lab/onyx/`. Keep it building and usable;
  don't link it from nav/footer or re-import it on other pages.
- The FTC drivetrain calculator (`src/pages/drivetrain.astro`, ported whole
  from Ethan Zhang's personal site and re-skinned to this site's tokens) is
  a self-contained tool page: every style is `.dt-` prefixed or declared in
  the page, and it runs no motion-engine scenes. Its share links keep state
  in the URL hash, so it passes `keepHash` to BaseLayout (which otherwise
  strips fragments on reload). The announcement post
  `src/content/blog/drivetrain-calculator.md` links to it; it is not in the
  nav. E2E regression: `tests/drivetrain.e2e.mjs` (run steps in its header).
  Research notes + third-party notices moved with it into `docs/`.
- Navigation is `src/components/GearNav.astro` (corner toggle opening a
  right-side paper drawer; old filename, no gear), a scroll nav over the
  one-page home: section anchor changes go in its `links` array AND
  `Footer.astro` (blog/lab pages).
- Design tokens live in the `@theme` block of `src/styles/global.css`;
  Tailwind v4 derives utilities from them (`bg-bg`, `text-accent`,
  `ease-out-strong`, ...). There is no `tailwind.config.*`.
- Scroll entrances: wrap content in `components/Reveal.astro`; stagger
  siblings by putting `data-reveal-group` on their parent. For a heading
  that should fly in per character, add `data-split` to it instead (plain
  text only, no inner markup). See `DESIGN.md` "Motion engine".
  A component's own root element does NOT inherit the calling file's style
  scope, so a scoped rule can never target a class passed to `<Reveal>`
  (only Tailwind utilities work there). Put the reveal inside the element
  the layout depends on, not around it.
- Blog: posts are markdown in `src/content/blog/` (collection defined in
  `src/content.config.ts`), rendered by `src/pages/outreach/[id].astro`.

## Placeholder convention (important)

Blocks awaiting real content are wrapped in `components/Placeholder.astro`
with a unique kebab-case `name`; small inline unknowns (team number, email,
handles, TBD dates) use a `.stub` span instead. When adding real content,
remove the wrapper/span and keep the children. Find all remaining slots:
`grep -rn "data-placeholder\|<Placeholder\|stub" src/`

## Working with the user (important)

Interview the user (AskUserQuestion) before design or content changes.
Batch the questions, propose concrete options, and wait for answers
before editing.

## Writing copy (important)

Any prose that ships on the site (headlines, body, labels, captions, form
copy, alt text) goes through the `no-slop-writing` skill in
`.claude/skills/no-slop-writing/`. Run it every time you add or edit visible
copy: concrete over abstract, natural voice, no AI clichés, no em dashes
anywhere in visible text.

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
