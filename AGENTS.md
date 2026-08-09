# Agent guide

Astro 7 + Tailwind CSS 4 website for FTC team 37122, GNCE Onyx. The whole
site is one scrollable page
(`src/pages/index.astro` composing `src/components/home/`); blog posts and
the `/drivetrain/` calculator are the only separate routes. Copy and
identity facts are real (team 37122, gnceonyx@gmail.com, @gnceonyx). Four of
the nine roster portraits are real photos; the rest of the media and the
sponsor form link are still placeholder slots.

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

- Fonts: LEMON MILK Medium (display, self-hosted in `src/assets/fonts/`),
  Grey Qo (script accent), Ubuntu (body).
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
- The FTC drivetrain calculator (`src/pages/drivetrain.astro`, ported whole
  from Ethan Zhang's personal site and re-skinned to this site's tokens) is
  a self-contained tool page: every style is `.dt-` prefixed or declared in
  the page, and it runs no motion-engine scenes. Its share links keep state
  in the URL hash, so it passes `keepHash` to BaseLayout (which otherwise
  strips fragments on reload). The announcement post
  `src/content/blog/drivetrain-calculator.md` links to it; it is not in the
  nav. Research notes + third-party notices moved with it into `docs/`.
- The calculator was deliberately stripped to bare inputs: every field is a
  plain `<label>` plus one control, with no hint text, no disclosure drawers,
  no preset chips and no live unit echoes. Keep it that way when adding to
  it. The pit-protocol section (measured grip, coast-down, sag) and its CSV
  encoder-log overlay were removed in that pass; `readMeasured()` remains as
  an all-null stub so the model runs on published constants and the branches
  downstream still compile. Chart summaries (`.dt-srsum`) are visually hidden
  on purpose: they exist for screen readers, since a canvas cannot be read.
- Roster portraits are matched by filename, not by a list: save a square
  photo as `src/assets/team/<slug>.<ext>` (slug of the member's name in
  `Team.astro`'s `roster`) and it replaces that member's silhouette and
  drops its `data-placeholder`. Crop to square before saving, and keep one
  file per member: two extensions for the same slug and the lookup picks
  whichever the glob lists first. Members without a file stay on the
  silhouette, so faces can land one at a time.
  The plate is a 260px column, so a source under 520px is soft on a 2x
  screen. Vera's original was only 272px and is upscaled to 544; if a
  higher-resolution file ever turns up, prefer it over the upscale. The
  pass was `magick in.jpg -filter Lanczos -resize 544x544 -unsharp 0x1
  -strip -quality 92 out.webp` (the project's own `sharp` gives the same
  result with `lanczos3` + `sharpen({sigma:1})`). That master sharpen is
  deliberate and separate from the output sharpen below: an upscale needs
  correcting at its own size, and dropping it leaves her visibly soft.
  No contrast or colour correction: portraits stay as shot, per `DESIGN.md`.
- Images are built by a custom image service,
  `src/lib/sharpen-image-service.mjs`, wired up in `astro.config.mjs`.
  Astro's stock sharp service resizes straight into the encoder with no
  sharpening, so every rendition ships softer than its source; this is that
  service with one unsharp pass added after the resize, and it applies to
  every image on the site, not just portraits. It changes sharpness only.
  Tune or disable it with `image.service.config.sharpen` (`false` gives
  stock Astro back). Renditions run 20-40% larger, which is the sharpened
  detail refusing to compress away.
- Navigation is `src/components/GearNav.astro` (corner toggle opening a
  right-side paper drawer; old filename, no gear), a scroll nav over the
  one-page home: section anchor changes go in its `links` array AND
  `Footer.astro` (blog pages).
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
