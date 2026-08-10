# Design System — GNCE Onyx

A light, machined identity built for a scroll-driven experience.
Pale slate paper everywhere, space indigo as the main color (ink, fills,
controls), sections alternating between paper and a deeper blue-tinted
band, grape reserved for true highlights, and a geometric-caps + script +
clean-sans type system. Typography carries the identity;
motion is the life. Read this (and the skills in `.claude/skills/`) before
touching UI.

## Principles

1. **Five colors.** `#C9CFDD` pale slate is the paper the whole site sits
   on; `#10254F` space indigo is the main color (all text, solid button
   fills, the nav toggle, the intro cover) plus its alphas for rules and
   muted copy, a 9% wash of it into the paper makes `--color-deep` (the
   alternate band), and 20/34% washes make the media plate and its edge.
   `#000000` black keeps only the nav drawer's scrim.
   `#2B2C33` shadow grey (`--color-steel`) is code frames and nothing
   else. `#823A80` grape soda appears ONLY as a true highlight:
   selection, the heat rail, hover states, the section marks, the stub
   dashes.
   The `/drivetrain/` calculator is the one exception on the site: a
   self-contained tool page with its own token set (a three-level ink
   ramp, a deeper grape that clears AA as small text, and one burnt-orange
   warning hue for limits). It is declared and justified inside that page.
2. **No idle glows. No gradient fills. No blur.** Life comes from motion
   and solid color; content is sharp from its first painted frame (reveals
   are clip wipes and drift, never a blur-in), and nothing frosted sits
   over anything. Texture is film grain alone, used sparingly.
3. **Type is the imagery.** LEMON MILK Medium (display; the italic exists
   for rare emphasis), Grey Qo (one script flourish per page), Ubuntu
   (body). Push display scale hard; keep body readable (Ubuntu is a plain
   modern sans; the display face stays on the titles alone).
3b. **The mark.** The team logo is the "circle of hands": one unbroken
   indigo line looping five times around a shared centre and closing where
   it began (`public/logo.svg`, viewBox 64). It sits in the hero's foot,
   draws itself on the intro cover in step with the load count
   (stroke-dashoffset in BaseLayout's meter script), and lives in the
   favicon on its own paper tile (`favicon.svg` + PNG fallbacks). One
   artwork, three homes; edit the path in all of them together.
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
   it reads as a plate waiting for a picture. `.stub` (a dashed grape
   underline) marks inline unknowns. Nothing wears one right now: the team
   number, the email and both handles are real. The convention stands for
   the next unknown.
7. **No em-dashes in visible copy. Lean copy only** (no-slop-writing): every
   visible sentence earns its place; anything that restates gets cut.

## Tokens (`src/styles/global.css` `@theme`)

| Token | Value | Use |
| --- | --- | --- |
| `--font-display` | LEMON MILK Medium | Headlines, the ONYX wordmark |
| `--font-script` | Grey Qo | One script flourish per page |
| `--font-text` | Ubuntu | Body, labels (`.type-label` = spaced caps) |
| `--color-bg` | `#000000` | Black, veils only: the nav drawer's scrim |
| `--color-surface` | `#10254F` | Space indigo: text on the light bands, small solid fills (nav toggle, the contact keys). Not a background |
| `--color-steel` | `#2B2C33` | Shadow grey: code frames in post bodies |
| `--color-paper` | `#C9CFDD` | Pale slate as a surface: light bands, cursor cards |
| `--color-deep` | indigo 9% on paper | The alternate band (`.band-deep`) |
| `--color-slot` | indigo 20% on paper | Media plates waiting on a picture (`.slot`, the roster portraits) |
| `--color-slot-edge` | indigo 34% on paper | That plate's own edge, solid rather than alpha so it reads on either band |
| `--color-accent` | `#823A80` | Grape soda: fills, accent text, markers |
| `--color-ink` / `--color-muted` / `--color-faint` / `--color-line` | space indigo at 100 / 70 / 52 / 18% | The ink ramp: text, secondary text, quiet text, hairlines |
| `--ease-out-strong` etc. | cubic-beziers | Entrances, on-screen movement, spring |

Everything above is declared once, in the `@theme` block. Nothing is
redeclared on `:root`. Components that float over any band (`.band-light`,
`.cursor-card`, the nav drawer, the season poster) restate the ink ramp
against `--color-surface` locally, which is the only place a token value is
ever written twice.

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
  alternate variants instead of repeating one. `data-reveal-group` staggers
  children off the group's own line, and a `delay` is only read on a reveal
  that stands alone. Watched with IntersectionObserver, with a timer-and-
  rect backstop under it that opens anything left clipped.
  Nothing follows the cursor on buttons: hover on a control is a 1px rise
  and the fill turning grape, and display type never answers the pointer.
- `[data-cursor-card="id"]` — hover detail that rides the pointer: the
  trigger floats the element `#id.cursor-card` beside the cursor
  (viewport-clamped, edge-flipping, pointer-fine only). Triggers must carry
  the same info accessibly (sr-only text plus a static line on coarse
  pointers / reduced motion). Every card is a paper tag (see Bands), except
  the season poster, which opts out so the artwork can fly into the panel
  unchanged. The season rows are the only user left.
  `[data-cursor-lane="sel"]` on the trigger names the parts the card may
  never cover; `[data-cursor-lane-root]` on their common ancestor is what
  the lane is measured across. ONE line for the whole group, set by the
  longest name in it, never a different edge under each row: a per-row edge
  makes the card step sideways every time the hand moves down one. Inside
  the lane the card hangs off the pointer's left, rides level with it rather
  than below, and never flips sides. Neighbouring triggers own separate card
  elements, so the outgoing card's position is handed to the incoming one
  (260ms window) and the swap glides instead of blinking.
- Display type never answers the pointer: no ripple on headings, no lean
  on the script flourish. Titles and subtitles hold still.

**Scenes** (named, run only when their element exists):
- `[data-cover-wipe]` — the hero cover: the whole opening viewport slides
  off to the left over 1.6 viewports of scroll (geometry in index.astro;
  the same 1.6 lives in motion.ts and GearNav's #team trip), uncovering
  the Team roster pinned beneath. Fine pointers only; touch scrolls
  straight through. `[data-cover-deep]` inside it gives up almost half the
  distance on the same timeline, so the sheet's trailing edge crops it,
  and `[data-cover-fast]` (the team number, top right) spends most of a
  viewport of extra travel, first thing fully off: the exit shears into
  three planes at three speeds.
- `[data-drift="±px"]` — sibling columns scrub opposite directions so a
  grid shears and crosses as it passes (season gallery).
- `[data-ladder]`/`[data-rung]` (sponsor tiers), `[data-progress]` (blog
  reading bar; a page carrying one loses the heat rail, since two grape
  progress signals read as a fault).

One trick per section: no two sections on a page share an entrance or
scroll behaviour. The engine holds nothing it does not use: a scene with no
markup left gets deleted rather than kept as a library, so this list and
`motion.ts` are the same list.

Two scenes live in their own components rather than in the engine, because
each knows something the engine cannot: the season accordion (`Season.astro`,
which owns the flying poster and the scroll correction that holds a clicked
row still) and the finale gesture lock (`Finale.astro`).

## The one-page structure

The whole site is `src/pages/index.astro`, composing six sections from
`src/components/home/` over alternating paper and deep bands. Every one of
them stands one viewport tall (`min-height: 100svh`) with its content
centred in that frame, and grows past it only when something opens. The
drawer nav doubles as the scroll nav (anchor ids in parentheses); `Finale`
carries the contact line, so BaseLayout gets `hideFooter` on home. The five
sections above the finale ride in an opaque `.curtain`; the finale sits under it and
is revealed by the page's last scroll (mechanics in `index.astro`). Blog
posts keep their own pages.
Touch gets none of the scroll choreography: the cover wipe and the finale
gesture lock are gated to `(hover: hover) and (pointer: fine)` (the same
media query in index.astro's geometry, motion.ts and Finale's script, so
they can never disagree), and a phone simply scrolls straight down the
page with only the finale's sticky curtain reveal intact. One trick per
section:

- **Hero**: nothing along the top · the split intro headline sitting above
  centre on an oversized indigo-watermark ONYX running edge to edge, only
  its outer serifs shaved by the frame · one line along the bottom edge, team mark at the left and the two
  CTAs at the right, bottoms level and clear of the corner nav toggle. The
  wordmark is the cover wipe's far plane (`[data-cover-deep]`): it gives up
  almost half the sheet's travel on the same scrub, so the exit reads as
  two planes at two speeds. On a phone the composition centres instead:
  headline over the word, then the mark and the stacked CTAs on one axis.
- **Team** (`#team`): the section the hero uncovers, pinned under the
  cover wipe on fine pointers, plain flow on touch. A small "Team members"
  display title over a grid of portrait plates with the name and that
  member's previous team numbers under each, two across on a phone
  (everything centred) and above 40rem a column count derived from the
  roster: the fewest rows that hold everyone, then the members spread evenly
  across them, capped at six columns. Nine ran 5 + 4, eleven runs 6 + 5.
  The rag stays, the orphan row never happens · plate height
  set in `svh` so the grid never overruns the screens it has · the names
  never answer the pointer; the portraits do: the hovered face zooms in a
  touch (1.045) and its grid neighbours (either side plus the vertical one)
  follow at half the step, attention falling off with distance. Transform
  only; the grid never moves. Portraits run in full colour as shot, each
  cropped square to fill its plate: no duotone, no grade, no unifying
  filter. They are photos of people, and the frame is what makes the row a
  set. Plates without a photo yet keep the slot wash and its silhouette.
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
  tug), runs one input-locked lift to FULL (sponsors on screen). A
  deliberate pull back from FULL runs the move in reverse; trackpad wobble
  never does. Fine pointers only: on touch the lock stands down entirely
  and the curtain reveal is plain scrolling. Gesture segmentation is
  envelope-based (a decaying memory of delta sizes, kept warm by an
  always-on passive tracker) so momentum tails, wheel notches, and noise
  reversals are told apart, and a page caught raw-scrolling between the
  levels under a live gesture is finished toward the level it was headed
  for. Leaving upward is plain scrolling; keyboards are never trapped;
  reduced motion gets no lock. Content: the shirt-back "Sponsored by"
  lockup (every backer at one size, one name per line on a single centred
  axis with the leading pulled tight, no boxes and no rules; there was a
  lead tier here and it was a ranking nobody asked us to publish, so equal
  billing is what the back of the shirt actually looks like) and, on the
  bottom edge, one centred contact line: the "Get in
  touch" headline with three machined keys beside it, one type: email,
  Instagram and YouTube. The keys
  take the buttons' grape on hover. The drawers exist only when the script
  has PROVED the geometry (fine pointer, everything on one line, room for
  the widest drawer to open fully): then the line is pinned by its left
  edge exactly where centring had put it, wrapping is forbidden, and a
  hover or focus explodes the value rightward on a sprung curve, shoving
  only what sits to its right (the one layout-property animation on the
  site; the no-wrap proof is what keeps it from ever flickering). Anywhere
  the proof fails, the values simply stand open in a centred line. No footer on the home page; that line is the sign-off.
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
word goes grape, because a link that grew would shove its neighbours.
Each link carries its one-line descriptor as sr-only text; the cursor cards
that used to float those descriptors beside the pointer are gone.
Section changes go in the
`links` array here and in `Footer.astro`, which carries the plain-text
fallback on blog pages. Under reduced motion the panel and its
boxes just appear.

## The blog (Outreach)

Markdown collection in `src/content/blog/`. The home Outreach section
lists posts as a ruled index whose rows are plain links to
`outreach/[id].astro`; the shared view transition carries the reader over
and back. There is no popup: the post's own page IS the reading
experience, one 44rem measured column (about seventy characters a line)
for header and body both. Post pages run the paper scheme (`light` on
BaseLayout): back button, date, title, rule, body, small-print footer. No comments, no view
counts. The intro cover runs only on the home page (`intro` on
BaseLayout).

## Component inventory

| Component | Purpose |
| --- | --- |
| `scripts/motion.ts` | Motion engine: primitives + scenes. Reduced-motion safe. |
| `layouts/BaseLayout.astro` | Shell: fonts, intro cover (the mark drawing itself over the count), heat rail, view transitions, GearNav, footer (`hideFooter` on home), imports motion. |
| `components/home/*.astro` | The six one-page sections, composed by `pages/index.astro`. |
| `components/Reveal.astro` | `[data-reveal]` wrapper. Variants and timing live in `motion.ts`, not here. |
| `components/GearNav.astro` | Corner toggle (two rules that cross) + right-side drawer: paper panel, bare display-type links that zoom in (hover turns them grape, nothing floats), Lenis smooth anchors. Old filename, no gear. |
| `components/Placeholder.astro` / `Footer.astro` | Invisible slot markers / the shared small print (blog pages only; home ends on the finale's contact line). |

## Conventions

- Content column: `mx-auto max-w-[88rem] px-5 sm:px-8` on the one-page
  sections; body copy caps its own measure (`ch`-based) inside the wide
  column. The blog is measured, not full-width: the post page runs a 44rem
  column for header and body both, near 72 characters a line. The shared
  Footer runs a 64rem column, and only blog pages carry it.
- The browser scrollbar is hidden site-wide (`scrollbar-width: none` +
  the webkit twin): the grape heat rail is the page's progress, except on a
  blog post, where the reading bar takes that job and the rail stands down.
  Wheel,
  keyboard and touch scrolling are untouched.
- Section rhythm varies on purpose; don't metronome identical sections.
- No eyebrows: sections open with a display headline, optionally over the
  `.mark` grape bar (declared once in `global.css`; a section sets only the
  air under it). Season and Sponsors take one; the rest open on the
  headline alone. `.type-label` is for metadata only.
- Every section is a landmark with a name: `aria-labelledby` pointing at its
  own headline, or `aria-label` where the headline is a wordmark (Hero).
