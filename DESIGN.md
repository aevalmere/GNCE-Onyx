# Design System — GNCE Onyx

A light, medieval-modern identity built for a scroll-driven experience.
Pale slate paper everywhere, space indigo as the main color (ink, fills,
controls), sections alternating between paper and a deeper blue-tinted
band, grape reserved for true highlights, and a distinctive uncial +
script + clean-sans type system. Typography carries the identity;
motion is the life. Read this (and the skills in `.claude/skills/`) before
touching UI.

## Principles

1. **Six colors.** `#C9CFDD` pale slate is the paper the whole site sits
   on; `#10254F` space indigo is the main color (all text, solid button
   fills, the nav toggle, the intro cover) plus its alphas for rules and
   muted copy, and a 9% wash of it into the paper makes `--color-deep`,
   the alternate band. `#000000` black keeps only the veils (scrims, popup
   backdrops). `#303D6A` twilight indigo (glass, raised surfaces) and
   `#2B2C33` shadow grey (`--color-steel`: media slots, code frames) hold
   their jobs. `#823A80` grape soda appears ONLY as a true highlight:
   selection, the heat rail, hover states, the section marks, the stub
   dashes.
2. **No idle glows. No gradient fills.** Life comes from motion and solid
   color. Texture is film grain and *non-gradient* frosted glass (uniform
   tint + blur + hairline), used sparingly. No ambient/looping glow.
3. **Type is the imagery.** Uncial Antiqua (display), Grey Qo (one script
   flourish per page), Ubuntu (body). Push display scale hard; keep body
   readable (Ubuntu is a plain modern sans; the fancy faces stay on the
   titles alone).
4. **Machined edges.** Radius 0, no exceptions. Hairline rules and negative
   space over cards; glass panels where a surface is warranted.
5. **Every animation is scroll-driven and motivated.** It communicates
   hierarchy, story, or feedback, never decoration. Reveals are clip-path
   wipes and masked character rises, never opacity cross-fades. Everything
   respects `prefers-reduced-motion` and degrades without JS.
6. **Placeholders are markers, not chrome.** The page never advertises what
   it is missing. `<Placeholder name="...">` renders nothing visible: it
   only stamps `data-placeholder` so every open slot is one grep away
   (`grep -rn "data-placeholder" src/`). An empty media block is a `.slot`,
   an indigo wash inside the band's own hairline, with no label in it, and
   it reads as a plate waiting for a picture. `.stub` (a dashed grape underline) still
   marks inline unknowns: team number, handle, the pending form link.
7. **No em-dashes in visible copy. Lean copy only** (no-slop-writing): every
   visible sentence earns its place; anything that restates gets cut.

## Tokens (`src/styles/global.css` `@theme`)

| Token | Value | Use |
| --- | --- | --- |
| `--font-display` | Uncial Antiqua | Headlines, the ONYX wordmark |
| `--font-script` | Grey Qo | One script flourish per page |
| `--font-text` | Ubuntu | Body, labels (`.type-label` = spaced caps) |
| `--color-bg` | `#000000` | Black, veils only: scrims, popup backdrops |
| `--color-surface` | `#10254F` | Space indigo: text on the light bands, small solid fills (nav toggle). Not a background |
| `--color-panel` | `#303D6A` | Twilight indigo: glass panels, raised surfaces, footer |
| `--color-steel` | `#2B2C33` | Shadow grey: code frames and quiet dark surfaces |
| `--color-slot` | indigo 20% on paper | Media plates waiting on a picture (`.slot`, the roster portraits) |
| `--color-paper` | `#C9CFDD` | Pale slate as a surface: light bands, cursor cards |
| `--color-accent` | `#823A80` | Grape soda: fills, accent text, markers |
| `--color-ink` / `--color-muted` / `--color-faint` / `--color-line` | space indigo at 100 / 70 / 52 / 18% | The ink ramp: text, secondary text, quiet text, hairlines |
| `--ease-out-strong` etc. | cubic-beziers | Entrances, on-screen movement, spring |

**Bands.** The whole site runs the paper + indigo ramp; sections alternate
paper and `.band-deep` (a 9% indigo wash) down the page: Hero deep, Team
paper, Season paper, Outreach deep, Sponsors paper, Finale deep. Six
sections cannot alternate perfectly with both ends deep and Sponsors paper,
so the one repeat sits in the middle (Team into Season) where nothing
depends on it. What the alternation is for is the two curtain seams (the
hero wipe over Team, the page curtain over the Finale), and both of those
still land on a change of band.
`band-light` restates the default and stays only on blog page bodies;
`.cursor-card` shares its declaration so a hover card is a paper tag over
either band.

## Motion engine — `src/scripts/motion.ts`

One GSAP + ScrollTrigger layer wired to Lenis. The head sets
`html.will-animate` synchronously (no first-paint flash); the module clears
it on boot, and failsafes clear it (and reveal everything) if it never does.
Under reduced motion the module bows out and static CSS stands in.

**Primitives** (data attributes, work on any page):
- `[data-split]` — headings split into masked lines of characters that rise
  from behind the line, scroll-locked; re-split on resize.
- `[data-reveal]` (up/left/right/scale/diag) — crisp clip-path wipe on
  enter, opacity held at 1 (no fade); `diag` is a corner wipe. Lists
  alternate variants instead of repeating one. `[data-reveal-scrub]` is the
  same, locked to scroll. `data-reveal-group` staggers children.
- `[data-parallax="±px"]`, `[data-hover-preview]`
  (image beside cursor, needs `[data-preview-root]` + `[data-preview-img]`).
  Nothing follows the cursor on buttons: hover on a control is a 1px rise
  and the fill turning grape, and display type never answers the pointer.
- `[data-cursor-card="id"]` — hover detail that rides the pointer: the
  trigger floats the element `#id.cursor-card` beside the cursor
  (viewport-clamped, edge-flipping, pointer-fine only). Triggers must carry
  the same info accessibly (sr-only text plus a static line on coarse
  pointers / reduced motion). Every card is a paper tag (see Bands). Used by
  the roster, the season rows, and the nav drawer's link descriptors.
- Display type never answers the pointer: no ripple on headings, no lean
  on the script flourish. Titles and subtitles hold still.

**Scenes** (named, run only when their element exists):
- The WebGL ONYX journey (`src/scripts/onyx3d.ts` + `src/data/onyx-glyphs.ts`)
  is parked, fully working, on the unlinked page `/lab/onyx/`
  (`src/pages/lab/onyx.astro`). Home no longer uses it; keep it building,
  don't link it.
- `[data-cover-wipe]` — the hero cover: the whole opening viewport slides
  off to the left over 1.6 viewports of scroll (geometry in index.astro;
  the same 1.6 lives in motion.ts and GearNav's #team trip), uncovering
  the Team roster pinned beneath. `[data-cover-deep]` inside it travels a
  fraction of the distance on the same timeline so the sheet's trailing
  edge crops it.
- `[data-hscroll]` / `[data-hscroll-track]` — diagonal scroll-hijack
  (season build log): the track pans sideways while climbing, panels
  counter-drift past each other, and the track skews with scroll velocity.
- `[data-screen]` — cinema screen-on: letterbox bars part from the centre,
  scrubbed (season highlight match).
- `[data-drift="±px"]` — sibling columns scrub opposite directions so a
  grid shears and crosses as it passes (season gallery).
- `[data-tilt]` — glass panels lean toward the cursor, pointer-fine only
  (contact channels).
- `[data-ladder]`/`[data-rung]` (sponsor tiers), `[data-progress]` (blog
  reading bar).

One trick per section: no two sections on a page share an entrance or
scroll behaviour.

## The one-page structure

The whole site is `src/pages/index.astro`, composing six sections from
`src/components/home/` over alternating paper and deep bands. Every one of
them stands one viewport tall (`min-height: 100svh`) with its content
centred in that frame, and grows past it only when something opens. The
drawer nav doubles as the scroll nav (anchor ids in parentheses); `Finale`
carries the contact line, so BaseLayout gets `hideFooter` on home. The five
sections above the finale ride in an opaque `.curtain`; the finale sits under it and
is revealed by the page's last scroll (mechanics in `index.astro`). Blog
posts keep their own pages; `/lab/onyx/` stays parked and unlinked. One
trick per section:

- **Hero**: nothing along the top · the split intro headline sitting above
  centre on an oversized indigo-watermark ONYX the frame crops · one line
  along the bottom edge, team mark at the left and the two CTAs at the
  right, bottoms level and clear of the corner nav toggle. The wordmark is
  the cover wipe's far plane (`[data-cover-deep]`): it lags the sheet on the
  same scrub, so the exit has depth.
- **Team** (`#team`): the section the hero uncovers, pinned under the cover
  wipe. No headline and no rule: a grid of portrait plates with the name and
  that member's previous team numbers under each, three across on a phone
  and five (two full rows) above 40rem · plate height set in `svh` so the
  grid always stands inside the one viewport the wipe hands over · hover
  turns the name grape and moves nothing.
- **Season** (`#season`): collapsible event rows (Qualifier 1 / Qualifier 2
  / States / More to come), exclusive: opening one sweeps the other shut.
  The hover poster flies from the cursor card into its seat on bare
  background (no waiting plate; keyboard and touch wipe the poster itself
  in), then a cross-drift gallery. Poster and seat share one aspect ratio
  and one tween, so it reads as the same object growing; an open row raises
  no hover poster until it closes. The clicked row holds its place on
  screen: when a row above sweeps shut, the scroll pays the leaving height
  back frame by frame, so the header the reader clicked never rides up.
  Accordion logic lives in the component's own script.
- **Outreach** (`#outreach`): the posts as a ruled index (date, title, the
  line about it, columns repeating exactly down the list) · invite-us CTA.
- **Sponsors** (`#sponsors`): scrubbed recognition ladder, no amounts.
- **Finale** (`#contact`): the curtain reveal, with exactly two resting
  levels. Everything above it scrolls up like a sheet lifted off a static
  first viewport; arriving momentum is set down on REACH (curtain parked
  just above "Get in touch"; published as `--finale-reach`, every anchor
  lands there). From REACH the first push is answered with a short tug; a
  second push, or the first one simply kept up (accumulated swallowed
  travel counts as insistence, so a firm trackpad push opens through the
  tug), runs one input-locked lift to FULL (sponsors on screen). Touch
  pays once: a single swipe opens. A deliberate pull back from FULL runs
  the move in reverse; trackpad wobble never does. Gesture segmentation is
  envelope-based (a decaying memory of delta sizes, kept warm by an
  always-on passive tracker) so momentum tails, wheel notches, and noise
  reversals are told apart, and a page caught raw-scrolling between the
  levels under a live gesture is finished toward the level it was headed
  for. Leaving upward is plain scrolling; keyboards are never trapped;
  reduced motion gets no lock. Content: the shirt-back "Sponsored by"
  lockup (lead name across the top, the rest sharing a tightened centered
  line beneath, no boxes or rules, placeholder names until real sponsors
  land) and, on the bottom edge, one centered contact line: the "Get in
  touch" headline with the two machined keys and the form button standing
  offset to their right. On fine pointers the keys rest collapsed to
  their glyphs; hover or focus explodes the value outward on a sprung
  curve, physically shoving everything to its right further right (the
  one layout-property animation on the site). Touch keeps the values
  standing open. No footer on the home page; that line is the sign-off.
  The REACH strip is only that line, and the Sponsors frame above
  overfills the remaining viewport (min-height with svh-aware rhythm,
  content centered), so the resting frame is the whole pitch over the
  contact line and nothing else.
- **Blog post**: reading-progress bar · masked title.

Old page URLs (`/season/`, `/contact/`, `/outreach/`) redirect to their
section anchors via `astro.config.mjs` redirects.

**Navigation** (`components/GearNav.astro`, the site's only persistent
chrome). A small indigo square sits flush in the bottom-right corner (no
inset; machined into the page edge) with two
rules stacked inside it; pressing it crosses them into a close mark and
slides a paper drawer in from the right edge over a black scrim, roughly
24rem wide and full height. The links are bare display type, one per
section, stacked on one left margin; they zoom the last few percent into
place with a short stagger as the panel lands. Hover moves nothing: the
word goes grape, because a link that grew would shove its neighbours and
make the cursor card flicker. Each link keeps its cursor-card descriptor
and its sr-only line. Section changes go in the
`links` array here and in `Footer.astro`, which carries the plain-text
fallback on blog and lab pages. Under reduced motion the panel and its
boxes just appear.

## The blog (Outreach)

Markdown collection in `src/content/blog/`. The home Outreach section
lists posts as a ruled index and opens each one as a paper popup in
place (real dialog, Lenis-aware scroll lock, focus returned to the row);
`outreach/[id].astro` stays as the deep-link and no-JS page with the same
header. Both are measured: the sheet and the page each hold the body near
seventy characters a line rather than running the full width of the paper. Post pages run the paper scheme (`light` on BaseLayout): back
button, date, title, body, small-print footer. No comments, no view
counts. The intro cover runs only on the home page (`intro` on
BaseLayout).

## Component inventory

| Component | Purpose |
| --- | --- |
| `scripts/motion.ts` | Motion engine: primitives + scenes. Reduced-motion safe. |
| `layouts/BaseLayout.astro` | Shell: fonts, intro cover, heat rail, view transitions, GearNav, footer (`hideFooter` on home), imports motion. |
| `components/home/*.astro` | The six one-page sections, composed by `pages/index.astro`. |
| `components/Reveal.astro` | `[data-reveal]` wrapper. |
| `components/GearNav.astro` | Corner toggle (two rules that cross) + right-side drawer: paper panel, bare display-type links that zoom in, cursor-card descriptors, Lenis smooth anchors. Old filename, no gear. |
| `components/Placeholder.astro` / `SectionLabel.astro` / `Footer.astro` | Invisible slot markers / label / the shared small print (blog + lab pages only; home ends on the finale's contact line). |

## Conventions

- Content column: `mx-auto max-w-[88rem] px-5 sm:px-8` on the one-page
  sections; body copy caps its own measure (`ch`-based) inside the wide
  column. The blog is measured, not full-width: the post page runs a 44rem
  column for header and body both, and the popup sheet is sized (58rem) so
  its own margins hold the body near 72 characters. The shared Footer
  defaults to 64rem and takes the finale's measure via `--foot-measure`.
- Section rhythm varies on purpose; don't metronome identical sections.
- No eyebrows: sections open with a display headline, plus the `.mark`
  grape bar on black bands. `.type-label` is for metadata only.
