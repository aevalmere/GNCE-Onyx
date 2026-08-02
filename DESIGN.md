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

**Scenes** (named, run only when their element exists):
- The WebGL ONYX journey (`src/scripts/onyx3d.ts` + `src/data/onyx-glyphs.ts`)
  is parked, fully working, on the unlinked page `/lab/onyx/`
  (`src/pages/lab/onyx.astro`). Home no longer uses it; keep it building,
  don't link it.
- `[data-hero]` — hero wordmark assembles, then tips into depth.
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

- **Hero**: split intro headline · script accent · magnetic CTA.
- **Lineage** (`#lineage`): count-up team numbers · staggered award ledger.
- **Team** (`#team`): rows wiping in from alternating sides · cursor cards
  with each member's previous teams (static fallback on touch).
- **Build** (`#build`): one short blurb, a connective beat.
- **Season** (`#season`): collapsible event rows (Qualifier 1 / Qualifier 2
  / States / More to come); the hover poster flies from the cursor card
  into the highlight frame on open, then a cross-drift gallery. Accordion
  logic lives in the component's own script. The flight is being refined to
  a seamless single-object scale: poster and destination share one aspect
  ratio, one tween, and no visible hand-off, so it reads as the same object
  growing rather than a clone swapping in.
- **Outreach** (`#outreach`): velocity ticker · post rows · invite-us CTA.
- **Sponsors** (`#sponsors`): scrubbed recognition ladder, no amounts.
- **Finale** (`#contact`): the curtain reveal. Everything above it scrolls
  up like a sheet being lifted off a static first viewport, so the section
  arrives already assembled: no stagger, no reveal wrappers, no split type.
  Its remainder scrolls normally once the curtain clears. Content is only
  what a visitor needs to reach the team: the big "Get in touch" headline,
  the email and Instagram rows, the form button, and one line of small
  print.
- **Blog post**: reading-progress bar · masked title.

Old page URLs (`/season/`, `/contact/`, `/outreach/`) redirect to their
section anchors via `astro.config.mjs` redirects.

**Navigation** (`components/GearNav.astro`, the site's only persistent
chrome). A small indigo square sits in the bottom-right corner with two
rules stacked inside it; pressing it crosses them into a close mark and
slides a paper drawer in from the right edge over a black scrim, roughly
24rem wide and full height. The links are hairline boxes, one per section,
stacked and sharing their edges; they zoom the last few percent into place
with a short stagger as the panel lands. Hover moves nothing: a grape rule
runs up the inside edge and the word follows it, because a box that grew
would shove its neighbours and make the cursor card flicker. Each box keeps
its cursor-card descriptor and its sr-only line. Section changes go in the
`links` array here and in `Footer.astro`, which carries the plain-text
fallback on blog and lab pages. Under reduced motion the panel and its
boxes just appear.

## The blog (Outreach)

Markdown collection in `src/content/blog/`. The home Outreach section lists
posts as line-hover rows; `outreach/[id].astro` renders a post in
`.post-body` with a `ViewCounter` (GoatCounter) and `Comments` (giscus),
both stubbed until IDs are set in `src/lib/services.ts` (see README).

## Component inventory

| Component | Purpose |
| --- | --- |
| `scripts/motion.ts` | Motion engine: primitives + scenes. Reduced-motion safe. |
| `layouts/BaseLayout.astro` | Shell: fonts, intro cover, heat rail, view transitions, GearNav, footer (`hideFooter` on home), imports motion. |
| `components/home/*.astro` | The eight one-page sections, composed by `pages/index.astro`. |
| `components/Reveal.astro` | `[data-reveal]` wrapper. |
| `components/GearNav.astro` | Corner toggle (two rules that cross) + right-side drawer: paper panel, boxed links that zoom in, cursor-card descriptors, Lenis smooth anchors. Old filename, no gear. |
| `components/Placeholder.astro` / `SectionLabel.astro` / `Footer.astro` | Invisible slot markers / label / footer (blog + lab pages only). |
| `components/ViewCounter.astro` / `Comments.astro` | Blog views / comments, stub until configured. |

## Conventions

- Content column: `mx-auto max-w-5xl px-5 sm:px-8` (blog body `max-w-3xl`).
- Section rhythm varies on purpose; don't metronome identical sections.
- No eyebrows: sections open with a display headline, plus the `.mark`
  grape bar on black bands. `.type-label` is for metadata only.
