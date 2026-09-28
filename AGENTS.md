# Agent guide

Astro 7 + Tailwind CSS 4 website for FTC team 37122, GNCE Onyx. The whole
site is one scrollable page
(`src/pages/index.astro` composing `src/components/home/`); blog posts and
the `/drivetrain/` calculator are the only separate routes. Copy and
identity facts are real (team 37122, gnceonyx@gmail.com, @gnceonyx on
Instagram, @GNCEOnyx on YouTube). Five of the ten roster portraits are
real photos; the season highlights and galleries are the only placeholder
slots left.

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
  `src/scripts/motion.ts` (GSAP + ScrollTrigger + Lenis): `[data-cursor-card]`
  plus named scenes (`[data-cover-wipe]`, `[data-drift]`, `[data-ladder]`,
  `[data-progress]`). The engine carries nothing it does not use: a scene
  whose markup is gone gets deleted, not parked. **Text never animates into
  place.** Headings, body copy, labels and buttons are printed and finished
  on the first frame; there is no entrance primitive and no `Reveal.astro`.
  Do not reintroduce one. The cover wipe and the finale
  gesture lock run on fine pointers only; touch scrolls the page straight
  through, with just the finale's sticky curtain reveal. Nothing follows
  the cursor on buttons and display type never answers the pointer. All reduced-motion
  safe. No opacity cross-fades.
- The page cannot be scrolled while the intro cover is down: `html.loading`
  locks the document's overflow (`global.css`) and `motion.ts` stops Lenis
  in the same breath, since Lenis scrolls by script and would otherwise
  spend its stored wheel momentum the instant the lock came off. The head
  script drops `loading` after 4.5s no matter what, so the lock cannot
  stick.
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
  Crop with `-auto-orient` first: a phone photo carries its rotation in EXIF
  and cropping without applying it cuts the wrong region and lands the face
  sideways. Aim for the head at 45-50% of the square, which is what makes a
  face read at 200px; the roster's problem has always been faces that are
  small in frame, not files that are short of pixels.
  The grid takes its column count from the roster length (see `Team.astro`),
  so adding a member reshapes the grid rather than orphaning a last row.
  It stays two rows: the section is pinned under the cover wipe by
  `index.astro`'s `-260svh` geometry and must stay one viewport tall.
  Six columns across the 88rem frame put the plate at about 200px, and the
  rendition widths are 260 and 520 to cover that at 1x and 2x, so a source
  under 520px is soft on a 2x screen. Vera's original was only 272px and is upscaled to 544; if a
  higher-resolution file ever turns up, prefer it over the upscale. The
  pass was `magick in.jpg -filter Lanczos -resize 544x544 -unsharp 0x1
  -strip -quality 92 out.webp` (the project's own `sharp` gives the same
  result with `lanczos3` + `sharpen({sigma:1})`). That master sharpen is
  deliberate and separate from the output sharpen below: an upscale needs
  correcting at its own size, and dropping it leaves her visibly soft.
  No contrast or colour correction: portraits stay as shot, per `DESIGN.md`.
- The hero's badge is a die-cut sticker, generated:
  `src/assets/onyx-badge.webp` is the drawing as the team exported it, and
  `node scripts/make-badge-sticker.mjs` cuts `onyx-badge-sticker.webp` from
  it, which is the file the hero prints. The cut is baked in because CSS can
  only outline an alpha silhouette with a blurred drop-shadow, and blur is out
  (`DESIGN.md` rule 2). Re-run it if the drawing is re-exported, and carry the
  two ratios it prints across to `Hero.astro`, which sizes the sticker off the
  wordmark's O and so has to know the artwork's share of the file.
  The cut is a real path: a closed loop of straight segments and circular arcs,
  and the image is rendered from the exact distance to it. That is where the
  edge quality comes from and it is not negotiable. Thresholding a pixel mask's
  distance field cannot be smooth, because the distance to a pixelated edge is
  not a linear ramp; the nearest pixel centre jumps as you slide along and the
  half-pixel ripple prints as a scalloped, dotted edge on any long shallow
  curve. Supersampling does not fix it either: a binary mask sampled at its own
  resolution is still a binary mask. What is left with the path is 0.05px rms,
  which is the coverage model, not the encoder (`OUT=x.png` to check that
  yourself).
  The shape the path cuts is the convex hull of the paint with a few dips
  pressed in. The hull gives it straight runs and lets the border stay thin,
  since a hull has no inward curves to round and a curve of radius R cannot
  pass within R of a spike. The dips are what make it follow the drawing
  instead of bridging over it, and they are found, not placed: the script
  measures every hull edge's clearance down to the paint and presses in the
  deepest, up to `DIPS`. This drawing ranks 151, 81, 57, 40, 40, 28, so
  `DIP_MIN` at 50 takes the three that read as hollows. `DIPS` is the "no
  constant waves" ceiling; raising it does not help, since the shallow ones are
  noise.
  `FILLET` is the other lever on how closely it traces, which is not obvious: a
  fillet cuts its corner back, the paint's clip has to clear the deepest
  cut-back so no ink is lost, and that offset then applies to the whole
  contour. A fatter fillet is paid for in paper everywhere. 150 put the median
  paper at 63px, 105 puts it at 54px and still leaves the tightest turn near
  100px at the blade line. The run prints that whole distribution.
  Two approaches that do not work, both tried: tracing the paint's own outline
  gives fifteen dips and a blob, and band-limiting the outline as a Fourier
  series (which does cap the wave count by construction) cannot follow the
  orbit ring's tips, so it needs a 60-120px radial shift and comes out looser
  than the hull, not tighter.
  One more trap, already paid for: the drawing is cropped tight (the orbit ring
  is tangent to the bottom edge), so the mask lives on a padded grid. Run the
  morphology on the artwork's own grid and the border comes out flat along the
  bottom and the left, which is the one seam it exists to hide.
  The sticker carries the site's only blur, which is the narrow exception
  written into `DESIGN.md` rule 2: one small, light drop shadow, because a
  sticker is a physical thing lying on paper and nothing else says so. Keep it
  small and keep it still. On the cover wipe it carries `[data-cover-ride]`, which is not a plane
  of its own: `motion.ts` hands every rider the deep plane's own travel, so the
  sticker and the wordmark shear off together as one object.

- The Qualifier 1 robot viewer (`src/pages/biobuzz/q1.astro`, module
  `src/scripts/q1-viewer.ts`) sits behind a password and is reached only
  from the grape bar on Qualifier 1's poster in `Season.astro`; it is in no
  nav and carries `noindex`. A static host cannot check a password, so the
  model is encrypted instead: `public/biobuzz/q1.bin` is the Onshape GLB
  packed (meshopt, 137 MB to 3.7 MB) and sealed with AES-GCM under a PBKDF2
  key, and `src/data/q1-seal.json` holds the salt and a check token. Rebuild
  both with `SEAL_PASSWORD=... node scripts/seal-q1-cad.mjs <export.glb>`
  (the header lists the `--no-save` installs it needs). Never commit the
  password. Nothing loads before the password opens the check token; then
  the bin downloads and three.js is imported, so no other page carries any
  of it. Explode follows the assembly tree (top assemblies, then parts and
  sub-assemblies, then their parts, each on its own overlapping window).

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
- Grape (`--color-accent`) is the highlight, and it is carried by TYPE, not
  by frames: a hovered roster portrait turns its name grape (the plate wears
  no border at all, in either state), a hovered event row turns its name, its
  plus and its rule together, and a back link turns its arrow and its word
  together. Hover is the only thing that colours a season title: an open row
  keeps its name in the ink and lets its plus and rule carry the state. Nothing moves on hover except the roster's own scale.
- Privacy lives at `src/pages/privacy.astro`: the same paper page as a blog
  post, so `.post-col`, `.post-rule` and the `.back*` set are declared once
  in `global.css` rather than in either file. Do not re-scope them into a
  page. It is the last link in `GearNav`'s `links` array, set exactly like
  the section anchors, and it closes the blog `Footer.astro` print line
  (the no-JS way in). It states that the site has no form, no analytics, no
  cookie and no third-party font, so adding any of those means editing that
  page in the same commit.
- Blog: posts are markdown in `src/content/blog/` (collection defined in
  `src/content.config.ts`), rendered by `src/pages/outreach/[id].astro`.
  Photos live in `src/assets/blog/` and go in with markdown image syntax
  (relative path, so Astro optimises them) wrapped in a `<figure
  class="post-figures">`, which breaks the 44rem reading column out to
  56rem; `.post-figures-pair` around two `<figure>`s sets them side by side.
  Both classes are in `global.css`; see `DESIGN.md` "Conventions". Leave a
  blank line between the HTML tags and the markdown or the image never
  parses.
- Pictures with the soft dissolved edge use `.soft-edge` (`global.css`),
  which is the same rule `.post-figures img` lands on. Put the class on any
  image element anywhere on the site to get it; the whole effect is one
  masked SVG in that rule, so tuning it there changes every picture wearing
  it.

## Placeholder convention (important)

Blocks awaiting real content are wrapped in `components/Placeholder.astro`
with a unique kebab-case `name`; small inline unknowns (a TBD date, a handle
that does not exist yet) use a `.stub` span instead. When adding real
content, remove the wrapper/span and keep the children. No `.stub` is in use
right now; the season highlights and galleries are the open blocks. Find all
remaining slots:
`grep -rn "data-placeholder\|<Placeholder\|class=\"stub\"" src/`

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
