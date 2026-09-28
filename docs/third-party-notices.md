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

2. **The Java export template.** The shape emitted by the code fold follows
   `buildPathSegmentCode` and `generateJavaCode` in the Visualizer's
   `src/utils/codeExporter.ts`: a `follower.pathBuilder()` chain of
   `.addPath(new BezierLine(...))` / `.addPath(new BezierCurve(...))` calls, each
   followed by its `setLinearHeadingInterpolation` /
   `setConstantHeadingInterpolation` / `setTangentHeadingInterpolation` call and
   an optional `.setReversed()`, closed with `.build()`, poses printed to three
   decimals and headings wrapped in `Math.toRadians(...)`.

3. **The Pedro 3 `Paths` export shape.** The editor now emits version 3 instead,
   and the shape of what it emits was checked against the same exporter at the
   Visualizer's 3.x output: a `static` import of `com.pedropathing.api.Paths`, a
   `PoseFactory.degrees()`, one named `Pose` per pose printed to three decimals
   with its heading in degrees, one `Path` per leg built from `line(...)` or
   `curve(...)` with a `.linear` / `.constant` / `.tangent` /
   `.reverseTangent` heading call, a `path(...)` composing them, and a
   `follower.follow(...)`. Reading the 2.1.2 builder surface is kept, so a chain
   a team wrote last season still loads.

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
- Licence: **BSD 3-Clause**, which is a different licence from the Visualizer's
  Apache-2.0. The two are not interchangeable and must not be conflated.

Nothing from this repository is reproduced here. It was read as a behavioural
reference for the 2.1.2 `PathBuilder` method surface that the custom editor
accepts, and for the constants the page names in prose. Three of them set the
deceleration rate of the page's follower-style profile, and the page uses their
product: `FollowerConstants.defaults()` sets `forwardZeroPowerAcceleration =
-41.278` in/s²; `PathConstraints.brakingStrength` defaults to `1`, which is also
what `Pedro-Pathing/Quickstart` ships; and `ErrorCalculator` multiplies that
strength by a literal `4` before it reaches the deceleration, which is why the
project's own deceleration docs say a brakingStrength of 1 corresponds to the
retired ZPAM of 4. The page also relies on `usePredictiveBraking` being `false`
by default on `FollowerConstants`, so the real follower commands full power
along the path tangent until it is inside a stopping distance of the end. Those
are stated as facts about Pedro's behaviour, not ported as source. All four were
re-read at `main` commit `b025bad` (2026-08-31), whose `gradle.properties` still
reads `version=2.1.2`.

---

## Pedro-Pathing/Quickstart (reference only, no code taken)

- Repository: https://github.com/Pedro-Pathing/Quickstart
- Licence: FIRST's standard BSD-style licence, copyright FIRST 2014-2022.

The preset chains on the page use pose coordinates and heading calls read from
the example autos in this repository. Per-preset provenance, including which
presets are 1.0.x-era syntax and what was changed to reach it, is recorded in
each preset's own source note in the page and shown in the code fold.
