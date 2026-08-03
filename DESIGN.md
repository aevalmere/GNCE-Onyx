# Design System — GNCE Onyx

A dark, medieval-modern identity built for a scroll-driven experience.
Black fields alternating with pale slate paper bands, indigo as type and
small fills, one grape accent, and a distinctive uncial + script +
old-style-serif type system. Typography carries the identity; motion is the
life. Read this (and the skills in `.claude/skills/`) before touching UI.

## Principles

1. **Six colors.** `#000000` black (fields), `#10254F` space indigo (text on
   the light bands, plus small solid fills where text sits on it, like the
   nav toggle; never a section background), `#303D6A` twilight indigo
   (glass, raised surfaces), `#2B2C33` shadow grey (`--color-steel`: media
   slots, code frames), `#823A80` grape soda (accent), `#C9CFDD` pale slate
   (ink on black, paper under the light bands), plus alphas of whichever of
   indigo and pale slate is carrying the text on a given band, for rules and
   muted copy. Grape reads as text on black (intentional low-key contrast).
2. **No idle glows. No gradient fills.** Life comes from motion and solid
   color. Texture is film grain and *non-gradient* frosted glass (uniform
   tint + blur + hairline), used sparingly. No ambient/looping glow.
3. **Type is the imagery.** Uncial Antiqua (display), Grey Qo (one script
   flourish per page), Cardo (body). Push display scale hard; keep body
   readable (Cardo is a scholar's old-style serif, tuned for length).
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
   a flat steel field with no outline and no label inside, and it reads as a
   plate waiting for a picture. `.stub` (a dashed grape underline) still
   marks inline unknowns: team number, handle, the pending form link.
7. **No em-dashes in visible copy. Lean copy only** (no-slop-writing): every
   visible sentence earns its place; anything that restates gets cut.

## Tokens (`src/styles/global.css` `@theme`)

| Token | Value | Use |
| --- | --- | --- |
| `--font-display` | Uncial Antiqua | Headlines, the ONYX wordmark |
| `--font-script` | Grey Qo | One script flourish per page |
| `--font-text` | Cardo | Body, labels (`.type-label` = spaced small caps) |
| `--color-bg` | `#000000` | Black background |
| `--color-surface` | `#10254F` | Space indigo: text on the light bands, small solid fills (nav toggle). Not a background |
| `--color-panel` | `#303D6A` | Twilight indigo: glass panels, raised surfaces, footer |
| `--color-steel` | `#2B2C33` | Shadow grey: media slots, code frames, quiet surfaces |
| `--color-paper` | `#C9CFDD` | Pale slate as a surface: light bands, cursor cards |
| `--color-accent` | `#823A80` | Grape soda: fills, accent text, markers |
| `--color-ink` / `--color-muted` / `--color-faint` / `--color-line` | pale slate at 100 / 60 / 38 / 14% | The ink ramp: text, secondary text, quiet text, hairlines |
| `--ease-out-strong` etc. | cubic-beziers | Entrances, on-screen movement, spring |

**Bands.** Sections alternate black and paper. Black: Hero, Team, Season,
Sponsors. Light: Lineage, Build, Outreach, Finale. A light one opts in with
`band-light`, which paints `--color-paper` and re-declares the ink ramp in
indigo for everything inside it (full / 62 / 40 / 18%), so token-driven
rules and Tailwind utilities follow with no second stylesheet. Grape,
shadow grey and the buttons do not move. `.cursor-card` carries the same
flip wherever it floats, so a hover card is a paper tag on either band.

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
- `[data-parallax="±px"]`, `[data-count]` (number counter),
  `[data-magnetic]` (cursor pull, pointer-fine), `[data-hover-preview]`
  (image beside cursor, needs `[data-preview-root]` + `[data-preview-img]`).
- `[data-cursor-card="id"]` — hover detail that rides the pointer: the
  trigger floats the element `#id.cursor-card` beside the cursor
  (viewport-clamped, edge-flipping, pointer-fine only). Triggers must carry
  the same info accessibly (sr-only text plus a static line on coarse
  pointers / reduced motion). Every card is a paper tag (see Bands). Used by
  the roster, the season rows, and the nav drawer's link descriptors.
- Hover on display type (automatic, no attribute): a `[data-split]` heading
  answers the pointer by dipping the character it crosses back under the
  split mask and rippling the dip outward, once per visit, only after its
  entrance has finished; headings inside links/buttons are skipped. The
  `.type-script` flourish lifts and leans in CSS. Both transform-only,
  pointer-fine, off under reduced motion.

**Scenes** (named, run only when their element exists):
- The WebGL ONYX journey (`src/scripts/onyx3d.ts` + `src/data/onyx-glyphs.ts`)
  is parked, fully working, on the unlinked page `/lab/onyx/`
  (`src/pages/lab/onyx.astro`). Home no longer uses it; keep it building,
  don't link it.
- `[data-cover-wipe]` — the hero cover: the whole opening viewport slides
  off to the left over one viewport of scroll (geometry in index.astro),
  with `[data-cover-deep]` inside it travelling a fraction of the distance
  on the same timeline so the sheet's trailing edge crops it.
- `[data-stack]` / `[data-stack-card]` — pinned card stack (lineage).
- `[data-hscroll]` / `[data-hscroll-track]` — diagonal scroll-hijack
  (season build log): the track pans sideways while climbing, panels
  counter-drift past each other, and the track skews with scroll velocity.
- `[data-screen]` — cinema screen-on: letterbox bars part from the centre,
  scrubbed (season highlight match).
- `[data-drift="±px"]` — sibling columns scrub opposite directions so a
  grid shears and crosses as it passes (season gallery).
- `[data-marquee]` / `[data-marquee-track]` — looping ticker geared to
  scroll velocity; scrolling back up rolls it backwards (outreach).
- `[data-tilt]` — glass panels lean toward the cursor, pointer-fine only
  (contact channels).
- `[data-coverflow]` — Swiper coverflow (roster), Swiper dynamically
  imported only where used.
- `[data-flip]` (awards), `[data-ladder]`/`[data-rung]` (sponsor tiers),
  `[data-progress]` (blog reading bar).

One trick per section: no two sections on a page share an entrance or
scroll behaviour.

## The one-page structure

The whole site is `src/pages/index.astro`, composing eight sections from
`src/components/home/` over alternating black and paper bands. The drawer
nav doubles as the scroll nav (anchor ids in parentheses); `Finale` carries
the footer, so BaseLayout gets `hideFooter` on home. The seven sections
above the finale ride in an opaque `.curtain`; the finale sits under it and
is revealed by the page's last scroll (mechanics in `index.astro`). Blog
posts keep their own pages; `/lab/onyx/` stays parked and unlinked. One
trick per section:

- **Hero**: masthead plate (script name left, three particulars right, one
  hairline) · the split intro headline on an oversized steel ONYX the frame
  crops · magnetic CTAs on the bottom edge. The wordmark is the cover
  wipe's far plane (`[data-cover-deep]`): it lags the sheet on the same
  scrub, so the exit has depth.
- **Lineage** (`#lineage`): count-up team numbers · staggered award ledger.
  Hovering a ledger line inks the entry grape and sweeps a rule under the
  name (pointer-fine; colour only under reduced motion).
- **Team** (`#team`): ten rows wiping in from alternating sides, in the
  team's own order · cursor cards with each member's previous team numbers
  (static fallback on touch).
- **Build** (`#build`): one short blurb, a connective beat.
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
- **Outreach** (`#outreach`): velocity ticker · post rows · invite-us CTA.
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
  touch" headline with the two machined keys (values standing open) and
  the form button beside it. No footer on the home page; that line is the
  sign-off. The REACH strip is only that line, so the whole Sponsors
  section shares the screen above it, one composed frame.
- **Blog post**: reading-progress bar · masked title.

Old page URLs (`/season/`, `/contact/`, `/outreach/`) redirect to their
section anchors via `astro.config.mjs` redirects.

**Navigation** (`components/GearNav.astro`, the site's only persistent
chrome). A small indigo square sits in the bottom-right corner with two
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
lists posts as line-hover rows and opens each one as a paper popup in
place (real dialog, Lenis-aware scroll lock, focus returned to the row);
`outreach/[id].astro` stays as the deep-link and no-JS page with the same
header. Post pages run the paper scheme (`light` on BaseLayout): back
button, date, title, body, small-print footer. No comments, no view
counts. The intro cover runs only on the home page (`intro` on
BaseLayout).

## Component inventory

| Component | Purpose |
| --- | --- |
| `scripts/motion.ts` | Motion engine: primitives + scenes. Reduced-motion safe. |
| `layouts/BaseLayout.astro` | Shell: fonts, intro cover, heat rail, view transitions, GearNav, footer (`hideFooter` on home), imports motion. |
| `components/home/*.astro` | The eight one-page sections, composed by `pages/index.astro`. |
| `components/Reveal.astro` | `[data-reveal]` wrapper. |
| `components/GearNav.astro` | Corner toggle (two rules that cross) + right-side drawer: paper panel, bare display-type links that zoom in, cursor-card descriptors, Lenis smooth anchors. Old filename, no gear. |
| `components/Placeholder.astro` / `SectionLabel.astro` / `Footer.astro` | Invisible slot markers / label / the shared small print (blog + lab pages only; home ends on the finale's contact line). |

## Conventions

- Content column: `mx-auto max-w-[88rem] px-5 sm:px-8` on the one-page
  sections; body copy caps its own measure (`ch`-based) inside the wide
  column. Blog body stays `max-w-3xl`; the shared Footer defaults to 64rem
  and takes the finale's measure via `--foot-measure`.
- Section rhythm varies on purpose; don't metronome identical sections.
- No eyebrows: sections open with a display headline, plus the `.mark`
  grape bar on black bands. `.type-label` is for metadata only.
