# Design System — GNCE Onyx

A dark, medieval-modern identity built for a scroll-driven experience.
Black fields, indigo bands and panels, one grape accent, and a distinctive
uncial + script + old-style-serif type system. Typography carries the
identity; motion is the life. Read this (and the skills in `.claude/skills/`)
before touching UI.

## Principles

1. **Six colors.** `#000000` black (fields), `#10254F` space indigo
   (full-bleed section bands), `#303D6A` twilight indigo (glass, raised
   surfaces), `#2B2C33` shadow grey (`--color-steel`: media slots, code
   frames), `#823A80` grape soda (accent), `#C9CFDD` pale slate (ink),
   plus pale slate alphas for rules and muted text. Grape reads as text on
   black (intentional low-key contrast).
2. **No idle glows. No gradient fills.** Life comes from motion and solid
   color. Texture is film grain and *non-gradient* frosted glass (uniform
   tint + blur + hairline), used sparingly. No ambient/looping glow.
3. **Type is the imagery.** Uncial Antiqua (display), Grey Qo (one script
   flourish per page), Cardo (body). Push display scale hard; keep body
   readable (Cardo is a scholar's old-style serif, tuned for length).
4. **Machined edges.** Radius 0 except the gear button. Hairline rules and
   negative space over cards; glass panels where a surface is warranted.
5. **Every animation is scroll-driven and motivated.** It communicates
   hierarchy, story, or feedback, never decoration. Reveals are clip-path
   wipes and masked character rises, never opacity cross-fades. Everything
   respects `prefers-reduced-motion` and degrades without JS.
6. **Placeholders are loud.** `<Placeholder name="...">` for blocks; `.stub`
   for inline unknowns (team number, handle, TBD dates).
7. **No em-dashes in visible copy. Lean copy only** (no-slop-writing): every
   visible sentence earns its place; anything that restates gets cut.

## Tokens (`src/styles/global.css` `@theme`)

| Token | Value | Use |
| --- | --- | --- |
| `--font-display` | Uncial Antiqua | Headlines, the ONYX wordmark |
| `--font-script` | Grey Qo | One script flourish per page |
| `--font-text` | Cardo | Body, labels (`.type-label` = spaced small caps) |
| `--color-bg` | `#000000` | Black background |
| `--color-surface` | `#10254F` | Space indigo: full-bleed alternate section bands |
| `--color-panel` | `#303D6A` | Twilight indigo: glass panels, raised surfaces, footer |
| `--color-steel` | `#2B2C33` | Shadow grey: media slots, code frames, quiet surfaces |
| `--color-accent` | `#823A80` | Grape soda: fills, accent text, markers |
| `--color-ink` / `--color-muted` | `#C9CFDD` / pale slate 60% | Text / secondary text |
| `--ease-out-strong` etc. | cubic-beziers | Entrances, on-screen movement, spring |

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
  pointers / reduced motion). Used by the roster, the season rows, and the
  gear menu descriptors.

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
`src/components/home/` over alternating black / Space Indigo bands. GearNav
doubles as the scroll nav (anchor ids in parentheses); `Finale` carries the
footer, so BaseLayout gets `hideFooter` on home. Blog posts keep their own
pages; `/lab/onyx/` stays parked and unlinked. One trick per section:

- **Hero**: split intro headline · script accent · magnetic CTA.
- **Lineage** (`#lineage`): count-up team numbers · staggered award ledger.
- **Team** (`#team`): rows wiping in from alternating sides · cursor cards
  with each member's previous teams (static fallback on touch).
- **Build** (`#build`): one short blurb, a connective beat.
- **Season** (`#season`): collapsible event rows (Qualifier 1 / Qualifier 2
  / States / More to come); the hover poster flies from the cursor card
  into the highlight frame on open; per-event awards strip and cross-drift
  gallery. Accordion logic lives in the component's own script.
- **Outreach** (`#outreach`): velocity ticker · post rows · invite-us CTA.
- **Sponsors** (`#sponsors`): scrubbed recognition ladder, no amounts.
- **Finale** (`#contact`): two staggered reveal waves; contact channels
  plus the footer matter (nav anchors, identity, small print).
- **Blog post**: reading-progress bar · masked title.

Old page URLs (`/season/`, `/contact/`, `/outreach/`) redirect to their
section anchors via `astro.config.mjs` redirects.

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
| `components/GearNav.astro` | Gear button + full-screen scroll-nav menu (cursor-card descriptors, Lenis smooth anchors). |
| `components/Placeholder.astro` / `SectionLabel.astro` / `Footer.astro` | Content slots / label / footer (blog + lab pages only). |
| `components/ViewCounter.astro` / `Comments.astro` | Blog views / comments, stub until configured. |

## Conventions

- Content column: `mx-auto max-w-5xl px-5 sm:px-8` (blog body `max-w-3xl`).
- Section rhythm varies on purpose; don't metronome identical sections.
- No eyebrows: sections open with a display headline, plus the `.mark`
  grape bar on black bands. `.type-label` is for metadata only.
