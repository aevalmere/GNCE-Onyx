# Third-party notices

Attribution for third-party work adapted into this site. Kept as a file rather
than as source comments, because the repo's code style carries no attribution
banners and the legal weight belongs here where it can be read whole.

---

## Pedro-Pathing/Visualizer

- Repository: https://github.com/Pedro-Pathing/Visualizer
- Licence: Apache License, Version 2.0
- Upstream `NOTICE`, verbatim: "This repository has significant portions of a
  fork of this repository created by Matthew Allen, which is licensed under the
  Apache License 2.0."
- Attribution in the repository's own README: built by FTC team #16166 Watt's Up.

Apache-2.0 grants "a perpetual, worldwide, non-exclusive, no-charge,
royalty-free, irrevocable copyright license to reproduce, prepare Derivative
Works of, publicly display, publicly perform, sublicense, and distribute the
Work and such Derivative Works in Source or Object form", on condition that
attribution, the licence notice, and a statement of changes travel with the
work. This file is that statement. The full licence text is at
https://www.apache.org/licenses/LICENSE-2.0 and in the upstream repository's
`LICENSE`.

### What was adapted, in `src/pages/drivetrain.astro`

1. **The `.pp` save-file schema.** The custom path editor reads the JSON body of
   a `.pp` file using the `SaveData` shape from the Visualizer's
   `src/utils/file.ts` and the `Point` / `Line` / `SequenceItem` types from
   `src/types.ts`: a `startPoint`, a list of `lines` whose `controlPoints` count
   decides `BezierLine` versus `BezierCurve`, an `endPoint` carrying one of the
   three heading modes (`linear` with `startDeg`/`endDeg`, `constant` with
   `degrees`, `tangential` with `reverse`), and an optional `sequence` that
   reorders the lines and interleaves waits. Adopting this schema verbatim is
   deliberate: it makes files saved by the official tool load here unchanged.
   The Visualizer has since moved the heading onto the path itself
   (`heading: { type: linear | constant | tangential | piecewise }`), added
   `compound` paths with `segments` and an optional group heading, and added
   `throughPoints` for `Paths.through`. The reader follows that newer shape from
   `src/types.ts` and the legacy fallbacks in `src/utils/normalize.ts`
   (`normalizePaths`, `normalizeHeading`, `headingFromLegacy`), read at
   Visualizer `main` commit `f0b063a` (2026-10-04), so old and new files both
   load.

2. **The Java export template.** The shape emitted by the code fold follows
   `buildPathSegmentCode` and `generateJavaCode` in the Visualizer's
   `src/utils/codeExporter.ts`: a `follower.pathBuilder()` chain of
   `.addPath(new BezierLine(...))` / `.addPath(new BezierCurve(...))` calls, each
   followed by its `setLinearHeadingInterpolation` /
   `setConstantHeadingInterpolation` / `setTangentHeadingInterpolation` call and
   an optional `.setReversed()`, closed with `.build()`, poses printed to three
   decimals and headings wrapped in `Math.toRadians(...)`.

3. **The Pedro 3.0.1 `Paths` export shape.** The editor emits version 3.0.1,
   and the shape follows the Visualizer's current code generator
   (`src/lib/codegen/`, at the commit above): the import block from
   `languages/java.ts`, a `PoseFactory.degrees()`, every pose through
   `of(x, y, heading)` with control points at heading 0 (as its model builder
   writes them, and because 3.0.1 has no two-argument `of`), numbers rounded to
   four decimals as in `numbers.ts`, and the heading calls and
   `.heading(Interpolator.piecewise().until(...))` form from `pedroApi.ts`. The
   page writes statements with a `p` factory and one `follower.follow(...)`
   rather than the generator's class with path-returning methods and an Ivy
   routine; the reader takes both. Reading the 2.1.2 builder surface is kept,
   so a chain a team wrote last season still loads.

4. **BIOBUZZ element positions.** The Visualizer's field list includes a
   "BIOBUZZ Field (2026-2027)" entry, and its field image `biobuzz.webp` was
   measured at 7.5 px/in to place the loading zones, the garden strips and the
   four flowers the Simulate section draws, where the game manual gives a size
   but no coordinate. **No part of that image is copied into this repository**,
   and none of it is served: the positions were read off it and written down as
   numbers, with their confidence, in `docs/drivetrain-research-notes.md`,
   section "BIOBUZZ auto geometry". Everything the manual does state (the field,
   the hive frame, the cell openings, the 18 in starting cube) comes from the
   manual and is marked as such there.

### Changes made

Both were reimplemented in TypeScript inside a single Astro page rather than
copied as files: the Visualizer is Svelte 4 with `d3` and
`prettier-plugin-java`, and this page has no build-time dependencies beyond
Astro. The `.pp` reader is a hand-written validator that tolerates missing and
malformed fields and reports the failure to the reader instead of throwing; it
skips `shapes`, `settings`, `pathChains` and wait steps, none of which this page
uses. The exporter emits one chain rather than the Visualizer's `Paths` inner
class or full `OpMode` variants, and does no Java pretty-printing.

### What was NOT adapted

The speed and timing model is not the Visualizer's. Its
`src/utils/animation.ts` and `src/utils/timeCalculator.ts` run a generic
kinematic trapezoid over user-set `maxVelocity` / `maxAcceleration` /
`maxDeceleration` settings, with no curvature term anywhere. This page instead
drives the chain with its own drivetrain physics: a motor curve with battery sag
and a current cap, a centripetal cap from the configured coefficient of
friction, a friction-circle limit on forward acceleration through a corner, and
its own braking model. That code is original to this repository. The
`FIELD_SIZE = 141.5` figure from `src/config/defaults.ts` is cited as a fact in
the page's own text; the page draws the full 144 inch frame and says so.

---

## Pedro-Pathing/PedroPathing (reference only, no code taken)

- Repository: https://github.com/Pedro-Pathing/PedroPathing
- Licence: **BSD 3-Clause**, copyright (c) 2026 Pedro Pathing, which is a
  different licence from the Visualizer's Apache-2.0. The two are not
  interchangeable and must not be conflated.

Nothing from this repository is reproduced here. It was read, at tag `v3.0.1`
(2026-09-18) and `main` commit `69094ad` (2026-10-02), as a behavioural
reference, and the page reimplements these behaviours in its own TypeScript:

- the `Paths` and `PoseFactory` method surface the editor reads, including
  3.0.1's corrected mirrors (`mirrorX(a)` sends a heading h to pi - h,
  `mirrorY(a)` to -h) and `rotateAround` / `mirrorAroundPoint`;
- the `Interpolator` semantics: linear and longLinear on path completion (arc
  length), tangent and facingPoint read at the robot's point, piecewise
  stretches by completion, and a compound path's own interpolator overriding
  its legs across their combined length;
- `BezierCurve.through`, the one bezier of degree n - 1 that passes through n
  poses at evenly spaced t, which the page solves as the same Bernstein system;
- `Mecanum.interpolateVelocity`, `1 / (|cos t| / vx + |sin t| / vy)`, used as
  the shape of the page's direction penalty;
- Foresight's driving and braking: full power down the tangent, no centripetal
  term (the normal feedforward it passes is zero), momentum carried from path
  to path while `pathSkip` is on, and a stop planned on the robot's own fitted
  braking curve with `maxBrakingPower` (0.2) as a correction only.

Those are stated as facts about Pedro's behaviour, with file and line pointers
in `docs/drivetrain-research-notes.md`, "Pedro Pathing 3.0.1". Earlier passes
read the 2.1.2 constants (`forwardZeroPowerAcceleration`, `brakingStrength`,
the `ErrorCalculator` factor of 4) the same way; the page no longer uses them.

---

## Pedro-Pathing/Quickstart (reference only, no code taken)

- Repository: https://github.com/Pedro-Pathing/Quickstart
- Licence: FIRST's standard BSD-style licence, copyright FIRST 2014-2022.

The preset chains on the page use pose coordinates and heading calls read from
the example autos in this repository. Per-preset provenance, including which
presets are 1.0.x-era syntax and what was changed to reach it, is recorded in
each preset's own source note in the page and shown in the code fold.
