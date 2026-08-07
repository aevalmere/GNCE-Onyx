# Research notes: /drivetrain calculator

Working notes behind the drivetrain page (`src/pages/drivetrain.astro`) and the post
"Calculating the ideal drivetrain" (Ethan Zhang's write-up of the review and
rebuild, published on his own site, darkelights.pages.dev; the tool itself
lives here). The physics core is *Drivetrain Minmax*
(Ethan Zhang, GNCE Onyx, July 2026); this document records what an eight-shard
research pass could and could not pin down when the tool was hardened for this
site after an external engineering review. Confidence language: **verified** =
manufacturer datasheet/product page or 2+ independent sources; **inferred** =
single secondary source or synthesis; **measured** = read off this team's own
equipment; **unpinned** = searched for, not found. The page says so rather than
inventing a number.

Method caveat that applies to everything below: the research environment blocks
full page fetches, so every claim was reconstructed from search-result snippets of
the cited pages. That is weaker sourcing than reading the page, and the tags
reflect it.

## The fuse (review flaw #2)

- The FTC main-line protection is a **one-shot 20 A ATM mini blade fuse**. REV's
  battery product page says so directly, and the game rules require the fuse
  (verified, revrobotics.com; rule paraphrase inferred). It is *not* a
  self-resetting PTC; blowing it ends your match, which is why the calculator
  keeps a hard-cap mode next to the thermal one.
- ATM/ATO blade trip curve, Littelfuse and Bussmann in agreement (verified,
  datasheets): 110% (22 A) holds at least 100 h; 135% (27 A) opens in 0.75–600 s;
  160% (32 A) in 0.25–50 s; 200% (40 A) in 0.15–5 s; 350% (70 A) in ~0.04–0.5 s.
- Calculator model: burst current allowed while an i²t budget above the sustained
  limit lasts, `budget = (I_burst² − I_sus²)·t_burst`, defaults 35 A / 1.5 s,
  which lands a 40 A draw at ~1 s to open, near the geometric middle of the
  0.15–5 s datasheet spread (derivation ours). The wide min–max tolerance is the
  argument for keeping both fuse modes.

## The battery

The FTC main battery is fixed by rule, so there is nothing to choose here and
the page says so instead of offering a decorative vendor dropdown.

- **Rule R601 (2025-2026)**: one and only one approved **12 V NiMH** main
  battery, with a COTS-equivalent **in-line 20 A ATM mini blade fuse**
  (verified, 2 independent sources: frctools.com/2026-ftc/rule/R601 and
  ftc-resources.firstinspires.org/ftc/game/manual-12).
- Vendor packs, all electrically the same 10-cell 3000 mAh NiMH:

  | Vendor | SKU | Connector | Notes |
  | --- | --- | --- | --- |
  | REV | REV-31-1302 "12V Slim Battery" | XT30 male | 567 g, 113.5 x 90.5 x 23 mm, 16 AWG / 150 mm leads (verified) |
  | goBILDA | 3100-0012-0020 "12V NiMH Nested" | XT30 (MH-FC) | 20 A ATM fuse inline (verified) |
  | MATRIX / TETRIX / Studica | various | XT30 or Tamiya | same 12 V 3000 mAh NiMH class (inferred) |

- REV publishes the cells as **10C, i.e. 30 A capable**, and states plainly
  that the in-line fuse is what limits you to 20 A (verified, REV product
  page). That is the justification for modelling burst current above the
  sustained limit rather than treating 20 A as a physical ceiling.
- Control Hub raises a battery fault below **7 V**; suggested input 8-15 V
  (verified, REV docs). REV advises against discharging below 9.0 V (inferred).

### State of charge (page presets 13.5 / 12.0 / 11.8 V)

- NiMH open-circuit voltage is **nearly flat across the middle of capacity**,
  so resting volts are a poor charge gauge (verified, 3+ framings incl. the
  Energizer handbook). Measured Eneloop data shows only ~0.02 V/cell between
  81% and 55% remaining. Any voltage-to-SOC mapping is inherently low
  confidence, and the page says sag is the real tell.
- **13.5 V fresh**: ten healthy cells rest near 1.35 V each after a long rest
  (inferred, FTC forum). Arithmetic ours.
- **12.0 V mid**: "around 12 V is a healthy and charged battery"; the
  practical working band is 12-13 V under load (verified, 2 sources:
  studica.com FTC power tips, projectrobotica.wiki).
- **11.8 V worn**: this is a **dead-cell detector**, not a discharge level.
  Nine good cells plus one shorted comes to about 12.1 V, so a pack that stays
  below 12 V after a full charge and a long rest has lost a cell (inferred,
  FTC forum; mechanistically self-consistent, which is why it is trusted over
  the many unsourced thresholds in circulation).
- **Chemistry trap, flagged loudly**: FRC guidance ("below 12 V means more
  than 75% discharged", "12.25 V is 50%") is for **sealed lead-acid**, whose
  OCV curve is usefully sloped. On NiMH, 12.25 V is roughly 10-15% remaining,
  not 50%. Search results mix the two freely.

### Pack and loop resistance (page: pack 80 / 100 / 130 mOhm, loop 0.12 / 0.14 / 0.17 ohm)

The page carries these as two separate fields. **Pack health** takes the tester
number exactly as the screen shows it, and the chips write 80 / 100 / 130 into
it. **Loop resistance** is the whole current path: the page sets it to the pack
value plus a 0.040 ohm wiring allowance, unless you type a loop value yourself,
which decouples the two fields until the pack field is touched again.

This was the biggest correction of the pass. An earlier note recorded "REV
docs say 11-20 mOhm" as an FTC pack figure. **That is wrong**: 11-20 mOhm is
the FRC 12 V sealed-lead-acid range (WPILib quotes under 15 mOhm; Chief Delphi
measures new MK ES17-12 packs at 16-17 mOhm). An FTC NiMH pack is an order of
magnitude stiffer.

- **Pack internal resistance, healthy: 80-170 mOhm.** Three converging lines
  (verified as a band):
  1. REV's own guidance, quoted in the FTC forum: a new slim battery under
     **170 mOhm** is healthy (inferred, attribution via forum).
  2. Community measurement: REV slim packs start life at 0.10-0.15 ohm and
     reach 1.57-1.67 ohm when dead (inferred, FTC forum).
  3. Arithmetic: high-drain sub-C NiMH cells run 5-16 mOhm each (Tenergy
     Propel spec <=5 mOhm), and 10 in series plus tabs, leads, the XT30 and
     the inline fuse lands at 50-160 mOhm.
- **The owner's measured packs (80 / 100 / 130 mOhm) sit inside that band and
  rank correctly.** They are milliohms; 80 *ohms* would pass 0.15 A from 12 V
  and could not turn a motor. The goBILDA 12V Battery Health Analyzer
  (3109-0010-0001) displays in mOhm, as do YR1035-class meters, while the
  Battery Beak reports the same quantity in whole ohms (0.015) - which is
  exactly how a unit-prefix misread happens.
- **Non-battery loop budget** (itemized, mOhm): 16 AWG main cable 7 best / 10
  typical / 29 worst round trip (verified AWG table, arithmetic ours); XT30
  and PowerPole pairs a few mOhm each; the main switch **5 / 15 / 50** and
  genuinely unpublished, the largest single unknown; the 20 A ATM fuse
  **3.2 mOhm cold, 4.8 mOhm hot at rated current** (verified, Littelfuse MINI
  and OptiFuse datasheets agree). Strictly-sourced total: **18-99 mOhm**,
  typical ~35.
- **Therefore the loop field is the pack field plus a ~35 mOhm wiring
  allowance, rounded to 0.040 ohm**: 0.12 / 0.14 / 0.17 ohm loop for 80 / 100 /
  130 mOhm packs, default pack 100 and loop 0.14. Modelling the pack alone
  under-predicts sag by about a quarter. Cross-check: 135 mOhm at 20 A gives
  2.7 V of sag, and FTC threads report exactly that class of behaviour (13 V
  dropping to 10 V and below).
- Two testers legitimately disagree on one pack: DC-load meters (Battery Beak,
  18 A) report resistance, 1 kHz AC meters report impedance, and neither is
  wrong (verified, Battery University BU-902).

## Traction (review flaws #1/#5 territory)

- The only manufacturer tile-specific grip figure found anywhere: AndyMark's
  SD mecanum at **μ = 0.51 forward/reverse** on FTC soft tile (verified,
  andymark.com). It ships on the page as the AndyMark wheel preset. A sideways
  0.67 figure appears in one shard but the traction shard states no sideways
  tile number is published; unresolved conflict, treat sideways as unpinned.
  goBILDA and REV publish no CoF for any FTC wheel (verified absence).
- The traction shard's own synthesis: mecanum default 0.50, honest range
  0.40–0.60 (anchored on the 0.51 spec, harder 70A-class rollers); traction
  0.85 (0.7–1.0+, cross-game proxy); omni 0.75 (0.6–0.85, proxy). **The page
  deliberately keeps v1's defaults (0.70 / 1.10 / 0.90)**, which sit at or
  above those bands, for three declared reasons: continuity with the reviewed
  artifact and its regression anchors, the folklore-but-plausible inference
  that soft 40A GripForce-class rollers out-grip AndyMark's harder compound,
  and the fact that the sensitivity band, not the point default, is the
  tool's real output. The page hint says this in as many words and pushes the
  luggage-scale measurement.
- The ~70–80% strafe-effectiveness figure is **unpinned**; no FTC source found.
  The mechanism (roller-spin friction loss, not the 45° geometry) is confirmed
  qualitatively (chiefdelphi). The page keeps factors 0.75 (force) / 0.85 (grip)
  as labeled community estimates and says strafe outputs read rougher.
- Rolling resistance on foam tile: no FTC measurement exists (searched, none).
  Generic solid-rubber range 0.01–0.05 makes the 0.045 mecanum default plausible
  but unverified (inferred). The coast-down procedure on the page is the fix.
- Watch-out recorded for posterity: simulator repos in the wild carry
  non-physical constants (μ = 10, CoF = 1.2 hacks). None leaked here.

## Braking (review flaw #3)

- `ZeroPowerBehavior.BRAKE` shorts the windings; braking torque scales with
  back-EMF, so passive BRAKE decay is speed-proportional, not constant
  (inferred from DC-motor theory + FTC forum explainer). No measured FTC
  stopping distance or decel exists in any searched source; unpinned, stated.
- What teams configure: legacy Road Runner used one symmetric 30 in/s²
  constraint; RR 1.0 quickstarts show asymmetric pairs like (−30, +50) and
  (−35, +70) in/s², decel set *gentler* than accel. Against a μ=0.51–0.70
  traction ceiling (~197–270 in/s²), configured decels run ~0.15–0.35 of the
  ceiling (synthesis).
- Calculator model: constant decel `a_brake = (k·μ + C_rr)·g` with k exposed as
  the braking-strength input, default 0.6, between slam-stop reality (~0.8+)
  and profiled-stop configs (~0.2–0.35). Constant-decel is an approximation and
  the page says braking costs are style-dependent.

## Buildable gearing (review flaw #4)

- goBILDA Yellow Jacket RPM ladder confirmed per product URLs: 6000 bare, 1620,
  1150, 435, 312, 223, 117, 84, 60, 43, 30 (verified). goBILDA publishes **no
  exact internal ratio fractions**; marketed ratios are rounded (6000/435 = 13.79
  vs "13.7"; "188:1" outputs 30 rpm = 200 flat). The calculator uses marketed
  ratios and treats the ~1% rounding as far inside the μ band (verified
  discrepancy, decision ours). The (1+46/17)² hypothesis for 13.7 is arithmetic
  coincidence, not a sourced tooth count; rejected.
- REV UltraPlanetary true ratios: 3:1 → 84:29 ≈ 2.897, 4:1 → 76:21 ≈ 3.619,
  5:1 → 68:13 ≈ 5.231, standardized 13T/M0.55 inter-stage interface (inferred,
  consistent across queries); these exact values are what the calculator uses.
- Verified-stocked external-stage parts (each a resolved product URL): MOD 0.8
  hub gears in 48/60/80/90/96/100/108T; 5 mm HTD pulleys in 16/24/48T. The
  small-pinion end of the gear catalog (12–44T) would **not confirm** from this
  environment, so the recipe engine refuses to invent pairs from it. Recipes
  draw only from the verified set, and the page says so. Sprocket ladders:
  servocity #25 counts partially confirmed; goBILDA's own sprocket ladder
  unpinned (a clean even-number list surfaced but looked pattern-completed,
  so it was excluded).
- Wheel presets on the page (goBILDA 96/104 mm mecanum, REV 75 mm mecanum,
  AndyMark 4 in mecanum, goBILDA 96 mm and REV 90 mm traction, 96 mm omni) are
  standard catalog sizes; the AndyMark preset carries the measured 0.51 μ, the
  rest carry the declared folklore defaults for their type.

## Platform and gearbox compatibility

The page used to carry a motor-brand select and a cartridge select side by side,
which let you specify a gearbox nobody makes. A fourth pass went looking for a
vendor sentence saying gearboxes do not cross brands and found none, from
goBILDA, REV or AndyMark (unpinned as a quote). The parts data forces it anyway:
goBILDA's Yellow Jacket family shares one interface across the 5202, 5203 and
5204 bodies; REV's UltraPlanetary cartridges key to the 13T/M0.55 interface on
the HD Hex; AndyMark's Classic, Orbital and Hex boxes key to AndyMark's own
motor pinions; and no vendor sells a cross-brand adapter (each interface
verified per brand, the incompatibility inferred from them). That is the basis
for one platform select feeding a gearbox list filtered to that platform, and it
is recorded here as inference rather than quotation.

### goBILDA Yellow Jacket

- Product URLs resolved this pass for 3.7:1 (1620 rpm), 5.2:1 (1150), 13.7:1
  (435), 19.2:1 (312), 26.9:1 (223), 71.2:1 (84), 99.5:1 (60) and 188:1 (30),
  plus the bare 1:1 at 6000 rpm (verified). 50.9:1 (117 rpm) carries forward
  from the earlier pass without a fresh URL (adapted).
- Stall torque confirmed for four rungs only: 18.7 kg·cm at 13.7:1, 24.3 at
  19.2:1, 38 at 26.9:1, 68.4 at 50.9:1, all four from snippet aggregation
  rather than a fetched page (adapted). The remaining ratios publish no torque
  figure this environment could reach (unpinned).
- **The 43 rpm rung is on the picker.** The ladder in "Buildable gearing" above
  lists 43, which implies a ratio near 139:1. Passes one and two surfaced no
  product URL for it and the platform list withheld it on that basis; a later
  pass found the page, so the rung ships and the picker carries all eleven.
  See "Correction: the 43 rpm rung is back" below for the source.

### REV

- UltraPlanetary cartridge actual ratios, confirmed twice against REV's own
  cartridge-details page: 2.89:1 (84:29) sold as 3:1, 3.61:1 (76:21) sold as
  4:1, 5.23:1 (68:13) sold as 5:1 (verified). Each entry on the page carries
  both numbers, so a stack reads as its nominal name and its real ratio.
- Cartridges stack, and the page builds combinations as products of the actual
  ratios up to three cartridges. REV's own instructions work a three-stage
  example at about 54:1, and the kit copy advertises "six different final gear
  reductions ranging from nominally 3:1 to 60:1" (adapted, a mirror of the
  instructions PDF plus a product-page snippet).
- REV publishes no per-cartridge output torque. The user manual instead carries
  a motor-by-ratio load table that flags damaging combinations in red (adapted,
  a secondary snippet of the PDF), which is the honest signal for the UI to
  carry, not a per-cartridge torque nobody publishes.
- Bare HD Hex (REV-41-1291): 0.105 N·m stall, 15 W maximum output power, 28
  counts per revolution at the motor (verified). Free speed, stall current and
  free current would not pin to REV's own page in either pass (unpinned), which
  is why the page's REV electrical numbers come from the existing gm0 dyno
  presets instead of invented vendor specs.
- Core Hex (REV-41-1300) is still sold and is a fixed unit rather than a
  cartridge platform: 72:1, 125 rpm free speed, 3.2 N·m stall torque, 4.4 A
  stall current, 5 mm female hex output, built-in magnetic quadrature encoder
  (verified, product page and datasheet). It ships as its own entry.

### AndyMark NeveRest

- Bare am-3104 takes Classic gearboxes, offers 12T and 17T pinions and is legal
  in both FRC and FTC (verified). Its free speed, stall torque and stall
  current are unpinned in both passes, so it also runs on the gm0 dyno numbers.
- Classic 40: 40:1, 160 rpm at the output, 6 mm D shaft, 7 ppr hall encoder.
  Classic 60: 60:1, same shaft and encoder, 420 ppr at the output shaft
  (verified, product pages).
- Orbital ratios 1:1, 3.7, 19.2, 50.9 and 263.7 (adapted, search synthesis).
  The "20:1" people say is really 19.2:1, the same rounding habit goBILDA has.
- AndyMark's own copy says NeveRest Hex "can be installed everywhere the
  previous NeveRest Orbital could be mounted", which reads as Orbital
  superseded rather than discontinued. Live stock status for any NeveRest SKU
  could not be confirmed from here, and AndyMark runs a separate discontinued
  collection whose contents went unread (unpinned).

## External stage types

Each external-reduction row now picks a type, with its own tooth ladder and its
own efficiency, because the honest catalog does not offer one unified list.

- **Belts are HTD 5 mm, and "GT5" does not exist.** goBILDA's belt and pulley
  line is 5 mm HTD pitch (verified, both catalog pages). Gates' real families
  are PowerGrip GT2 and PowerGrip HTD; the 5 mm sections are HTD-5M, the older
  profile FTC vendors actually stock, and 5MGT, the GT2-profile equivalent
  Gates renamed from 5MR. No Gates product is called GT5 (verified, Gates'
  product pages plus a belt-profile reference). GT2 carries roughly double the
  load of same-pitch HTD per Gates' own marketing, and HTD has the higher
  backlash. No FTC vendor drivetrain product in 2 mm or 3 mm GT2 turned up
  (unpinned as a catalog item), so the page offers no 2GT or 3GT preset and
  labels the real option by what it is. Confirmed pulleys: goBILDA pinion
  pulleys at 16T and 24T in an 8 mm REX bore and a 24T hub-mount in a 14 mm
  bore (verified); the 48T already on the page carries forward on the earlier
  tag (adapted).
- **Chain is two families that do not interchange.** goBILDA's chain line is a
  proprietary 8 mm pitch, sprockets confirmed at 10T (set screw, 8 mm REX bore)
  and 14T, 20T and 26T (hub mount, 14 mm bore), with its own catalog page. REV
  and AndyMark are #25, the 0.25 in ANSI pitch: REV 10T (REV-41-1716) and 26T
  (REV-41-1721) by SKU with 15/20/32/40T at lower confidence, AndyMark
  17/22/24/32/38/42/66T by SKU with the wider collection lists adapted. Putting
  a goBILDA sprocket on #25 chain is a pitch mismatch, so a chain stage picks
  one family and stays in it. This corrects the note above, which recorded
  goBILDA's sprocket ladder as unpinned and treated chain as one generic
  option.
- **The pinion gap is closed.** goBILDA MOD 0.8 pinions (2301 and 2304 brass,
  2303 steel) exist at 15, 20, 24, 30 and 36T, each in a 6 mm D bore and an
  8 mm REX bore (verified, a distinct product URL per size). "Buildable
  gearing" above records the unconfirmable small-pinion end of the catalog as
  the reason the recipe engine refuses to invent pairs. It no longer has to
  refuse. (Superseded by "Typed teeth, stocked recipes" below: a 40T pinion
  turned up on a later pass, so the shipped ladder is six sizes, not five.)
- **105T joins the hub gears.** Re-confirmed by product URL this pass: MOD 0.8
  hub gears at 60T, 90T (14 mm and 32 mm bore), 96T, 100T (14 mm and 32 mm
  bore) and 105T (verified). The 48T, 80T and 108T already on the page did not
  re-surface and carry forward on the earlier tag (adapted). Nothing was
  dropped; 105 was added. (A later pass added 50T and 68T as well; see "Typed
  teeth, stocked recipes" below for the shipped list.)
- REV and AndyMark gears are 32 DP, not MOD 0.8 (verified presence of both
  lines). 32 DP works out near MOD 0.79, close enough to look interchangeable
  and nominally not, so a MOD 0.8 stage on this page is a goBILDA stage. REV's
  5 mm HTD 15 mm-wide pulley tooth list did not pin this pass (unpinned).

### Why the efficiency defaults did not move

- gm0's gearbox-anatomy source, read as raw text rather than a snippet, says "A
  typical two-stage spur gearbox is about 85% efficient, whereas most two stage
  planetary gearboxes are 94% efficient" (verified). The square root of each
  implies roughly 92% per external spur mesh and 97% per planetary stage
  (arithmetic ours).
- ReCalc's tooltip, read out of its source rather than its UI, says efficiency
  is "Typically ~92-97% per stage" and splits by stage *count* only, never by
  stage type (verified, source read on GitHub).
- Belt-drive literature repeats 96–98% per stage, and Gates publishes no
  numeric efficiency for HTD or GT2 anywhere found, only relative capacity and
  backlash (unpinned as a number). Roller-chain references cluster at 95–98%,
  about 98% well lubricated (adapted, general engineering sources, nothing
  FTC-specific).
- The page keeps 0.96 per gear mesh and 0.97 per belt, and gives both chain
  families 0.95. The 0.96 sits inside ReCalc's band and above gm0's implied
  92%, so it assumes a well-aligned mesh rather than a worst case. The 0.97
  sits at the top of the belt band and above ReCalc's, plausible for a
  well-tensioned HTD belt and honestly on the optimistic side. Nothing found
  contradicts either.
- **The ranges ship as hint text and the numeric defaults stay put.** Every
  pinned setup, every share link and the page's own regression anchors compute
  from those constants, so moving them to gm0's implied figures would restate
  every stored configuration silently, in exchange for a change no source
  demands.
- Recorded so it is not re-found and believed: one search synthesis returned a
  gm0 line about "~5% loss per stage regardless of type" that a direct fetch of
  gm0 could not locate. Treat it as a paraphrase artifact, not a quote.

## Tipping

- Tip condition derived and matched to a physics-education source: front wheels
  lift when `a/g > x_rear/h` (x_rear = horizontal CG→rear-contact distance,
  h = CG height); braking mirrors with x_front. Weight transfer ΔN = m·a·h/L;
  for an all-wheel-drive robot the *total* traction ceiling μ·m·g is unchanged
  by transfer (per-wheel saturation is a mecanum-torque nuance, not modeled).
- Page inputs default to CG 5″ high, 5″ ahead of the rear axle → tips at 1.0 g,
  comfortably above the default launch; the tip-margin card warns from 85% of
  the threshold.

## Vendor spec vs dyno (review flaw #6)

- goBILDA bare-motor spec: 9.2 A stall confirmed from vendor page (verified);
  0.144 N·m consistent with the known 1.47 kg·cm figure (inferred this pass).
  gm0's dyno columns for the same motor class run consistently hotter across
  every vendor's version; gm0 itself attributes vendor-sheet differences to
  "different testing methods" (inferred). gm0's exact dyno methodology:
  unpinned this pass.
- Guidance now on the page: the vendor number is a conservative sustained-duty
  rating; the dyno number is a cold/peak read and the better ceiling for a
  one-second launch. The verdict board computes both and refuses to average
  them.

## Prior art (review flaw #8)

- ReCalc: reca.lc/drive (repo github.com/tervay/recalc), shareable-URL
  calculators; a Ratio Finder tool is the nearest incumbent to buildable-recipe
  output (verified URLs).
- ILITE Drivetrain Simulator: FRC 1885 spreadsheet, releases at
  github.com/flybotix/drivetrainsim, time-step sim with current limiting per its
  Chief Delphi papers (verified URLs). Whether it models brownout, and any
  published robot-validation: unpinned, so this page claims neither about it.
- Neither incumbent was confirmed to model braking phases, thermal fuse budgets,
  or uncertainty bands (unpinned in their favor: absence of evidence, stated as
  such).
- **One FTC-adapted incumbent exists**: a Chief Delphi paper, "FTC-BW: JVN's
  Mechanical Design Calculator revised for FTC". Its existence is verified,
  but what "revised for FTC" covers (NiMH? tile units? the fuse?) could not be
  examined from this environment. The blog's prior-art claim is hedged
  accordingly; examining FTC-BW is an open question below.
- The run animator mirrors the tuning-run view teams already trust from Pedro
  Pathing / Road Runner telemetry sessions; it plays the page's own integration
  and adds no new physics (decision ours).

## Mecanum render spec (the run animator)

The animator draws to one scale, pixels per field tile, so the robot and its
wheels are true size rather than fitted by eye. Every figure below is what the
code uses.

- **Robot 18 x 18 in** = 0.75 tile, straight off rule R101's starting cube
  (verified, FTC manual + gm0). MeepMeep's default bot and Road Runner's 9 in
  radius use the same convention.
- **Wheel top-down footprint: diameter along the travel direction, tread width
  across it.** A wheel is a cylinder whose axle lies across the direction of
  travel, so its ground projection is diameter x width. goBILDA's 96 mm
  mecanum is **96 x 38 mm**, about 2.5 : 1 (verified dimensions; the
  projection conclusion is forced geometry, not a citation). Drawing wheels
  long *across* travel is 90 degrees wrong and reads as fake immediately.
  Against an 18 in chassis a wheel is roughly one fifth of the chassis long
  and one twelfth wide, which is what the page renders.
- **Mecanum roller pattern from above**: rollers sit at 45 degrees, and a
  correctly built drivetrain shows front-left parallel to back-right, and
  front-right parallel to back-left, the two families perpendicular. That is
  the X pattern (inferred, geometric derivation). The animator hatches each
  wheel accordingly and drops the hatch for traction and omni wheels.
- **Strafing does not rotate the chassis** (verified). The animator therefore
  keeps the heading fixed and turns the whole robot, wheels included, ninety
  degrees relative to the direction of travel. Wheel tread scrolls by the
  distance driven, divided by the strafe factor, because strafing wheels spin
  faster than the robot moves.
- **Heading is drawn as a centre-to-front spoke**, the FTC Dashboard and
  MeepMeep convention (verified: Dashboard's field view draws in inches over a
  tile-seam grid), rather than a chevron, which reads as a play button.

## Pedro Pathing visualiser

The path sheet below the run animator draws real Pedro Pathing chains on a full
144 x 144 in field and drives them with this page's engine. Unlike every
section above, this pass **could** read whole files: `raw.githubusercontent.com`
and `github.com` HTML both fetch from this environment, so the claims here come
from reading source and docs directly rather than from search snippets.
`api.github.com` is blocked (403) and `pedropathing.com` itself is blocked
(403), so the docs were read from the repo that builds that site.

### Where the library actually lives (verified)

- Org **Pedro-Pathing**. Library: `Pedro-Pathing/PedroPathing`, default branch
  `main`. Current quickstart: `Pedro-Pathing/Quickstart`, default branch
  `master`. Docs source: `Pedro-Pathing/Docs`, branch `master`, whose `CNAME`
  is `pedropathing.com`. Legacy docs: `Pedro-Pathing/Documentation-1.0.9`,
  `CNAME` `v1.pedropathing.com`. Archived legacy quickstart:
  `Pedro-Pathing/Quickstart-1.0.9`. Official visualizer:
  `Pedro-Pathing/Visualizer` (Svelte, deployed at visualizer.pedropathing.com).
- Getting the branch wrong 404s every raw path, which is why the first probes
  here failed. Recorded so the next pass does not repeat it.

### The coordinate convention (verified)

- Docs page `content/docs/pathing/reference/coordinates.mdx`, verbatim: "Pedro
  Pathing uses a right-hand coordinate system, which is nonstandard to the FTC
  SDK Standard." As the robot moves right, x increases; as it moves up the
  field image, y increases. Heading 0 rad faces right, pi/2 faces up, and
  "counterclockwise rotation is positive rotation, similar to a unit circle."
- The origin is **not** on that page. It is stated on the example-auto page:
  Pedro "spans an interval of [0, 144] on both the x and y axes, with (0, 0)
  defined as the bottom-left corner of the field." The v1 docs add the Into the
  Deep reading: (0,0) is the Blue Observation Zone, (144,144) the Red.
- **Trap, flagged loudly.** `PedroCoordinates.java`'s own javadoc says "a 144x144
  coordinate system with the origin at (72, 72)", which reads as a centre
  origin and is wrong as written. It means the field *centre* sits at Pedro
  (72, 72). Three independent facts force that reading: the docs sentence
  above; the documented RoadRunner conversion, "add +72 to both x and y", and
  RoadRunner is centre-origin; and `FTCCoordinates.convertToPedro`, which
  rotates by +pi/2 and then adds (72, 72). The official visualizer clamps every
  coordinate to [0, FIELD_SIZE] and never emits a negative, which settles it.
- **Field size disagreement, unresolved and harmless here.** Docs say 0–144 in;
  the visualizer's `defaults.ts` sets `FIELD_SIZE = 141.5` and its v2.0.6 notes
  say "corrected field length to 141.5". 144 is the nominal 12 ft figure, 141.5
  the interior playing surface. The page draws 144 because every quickstart
  coordinate is written against the 0–144 statement (decision ours).
- The page canvas therefore renders x right, y up, origin bottom-left, labels
  in inches every 24 in, and passes the negated heading to the canvas because
  screen y runs downward. That last step is arithmetic, not a citation.

### The path API, and the version break (verified)

The API changed shape at **v2.0.0**, and both generations are in the wild, so
the page ships both and says which is which.

| Version | Bezier construction | Package |
| --- | --- | --- |
| 1.0.x (through 1.0.9) | `new BezierLine(new Point(poseA), new Point(poseB))` | `com.pedropathing.pathgen` |
| 2.0.0+ | `new BezierLine(poseA, poseB)` | `com.pedropathing.geometry` |

- The v2.0.0 release notes list "Removal of Point class" as a breaking change,
  and `geometry/Point.java` 404s on `main`. `BezierLine`'s live constructors are
  `(Pose, Pose)`, `(FuturePose, FuturePose)` and `(Pose, Pose, boolean)`.
  `BezierCurve` takes `List<Pose>` or varargs `FuturePose`, so a curve's middle
  arguments are its control points, passed as bare `Pose` with no heading.
- `Pose` is `(double x, double y, double heading)` with a `CoordinateSystem`
  overload; heading is radians, and the docs repeat "All headings are in
  radians, use `Math.toRadians(degrees)` if you're starting with degrees."
- `PathBuilder` confirmed from source: `addPath`, `setLinearHeadingInterpolation`
  in 2-, 3- and 4-arg forms, `setConstantHeadingInterpolation(double)`,
  `setTangentHeadingInterpolation()`, `setHeadingInterpolation`, `build()`.
  `Follower` has `pathBuilder()` and `followPath` in `(Path)`, `(Path, boolean)`,
  `(PathChain)`, `(PathChain, boolean)` and `(PathChain, double, boolean)`.
- Interpolation semantics, from `reference/interpolation.mdx`: linear turns from
  start to end heading while following; constant holds one heading and turns to
  it first if the robot starts off it; tangent keeps heading along the slope of
  the curve. The page implements exactly these three.

### The presets, verified vs adapted

Every coordinate on the page is attributable. What was adapted is said out loud
in the sheet, not only here.

| Preset | Source | Status |
| --- | --- | --- |
| DECODE auto, preload score | `Docs/content/docs/pathing/examples/auto.mdx` | **verified**, verbatim poses and heading call |
| DECODE auto, full chain | same page | **verified** coordinates and heading calls; the docs build the eight legs as separate PathChains and the page joins them into one, which the fold says |
| AprilTag motif auto, PPG branch | `Docs/.../examples/apriltagpatternauto.mdx` | **verified**, verbatim; the real opmode picks one of three branches by tag, so shipping one branch is a subset, not an edit |
| Into the Deep bucket auto | `Quickstart-1.0.9/.../examples/ExampleBucketAuto.java` | **verified**, verbatim, in the 1.0.x `Point` syntax |
| Circle, tangent heading | `Quickstart-1.0.9/.../examples/Circle.java` | control points **verified** verbatim; placement **adapted** |
| Straight lace, 3 tiles | none | **adapted**, written for this page |

- The bucket auto's `parkControlPose` and `parkPose` are both `(60, 98,
  Math.toRadians(90))` in the shipped file. Confirmed on two independent fetches
  with different prompts, because a control point sitting on its own endpoint
  looked like a transcription error. It is not: that leg genuinely degenerates
  to a straight line, and the page says so rather than nudging the number.
- Circle.java is written around the robot's own start at (0,0) with `RADIUS =
  10`, so on a corner-origin field it would run off the edge. The page anchors
  it at the field centre (72, 72), a real Pedro landmark, and labels the
  placement as adapted. Its 10 in radius is genuinely smaller than the 18 in
  robot; that is the example, not a drawing bug.
- Triangle.java was read and rejected as a preset: same local-origin problem as
  Circle with nothing Circle does not already show.

### FollowerConstants, displayed and not used (verified)

These are the authentic tuning constants and the page shows them as such. They
do **not** drive the animation: the motion is this page's own engine, and the
sheet states that split in one sentence.

- 1.0.x static-field style, from the 1.0.9 quickstart's `FConstants.java`:
  `mass = 13`, `xMovement = 57.8741`, `yMovement = 52.295`,
  `forwardZeroPowerAcceleration = -41.278`,
  `lateralZeroPowerAcceleration = -59.7819`,
  `zeroPowerAccelerationMultiplier = 4`, `centripetalScaling = 0.0005`.
  Those are that quickstart's tuned values, not library defaults.
- 2.x builder style, from `core/.../FollowerConstants.java` field initializers:
  `mass = 10.65` kg, `forwardZeroPowerAcceleration = -34.62719` in/s^2,
  `lateralZeroPowerAcceleration = -78.15554` in/s^2, `centripetalScaling =
  0.0005`, `automaticHoldEnd = true`.
- **Moved, not deleted, at 2.0.0**: `xMovement`/`yMovement` became `xVelocity =
  81.34056` and `yVelocity = 65.43028` on `MecanumConstants`, alongside
  `maxPower = 1`. `zeroPowerAccelerationMultiplier` became `brakingStrength` on
  `PathConstraints`, and its default fell from 4 to 1, which is a behaviour
  change and not just a rename.
- Two fetches of the same library file returned two different acceleration
  pairs, one of them the quickstart's tuned numbers. The quickstart file was
  fetched directly to settle it. Recorded because it is the exact failure mode
  a summarizing fetch tool produces, and the fix is to read the file that owns
  the number.

### What the page's motion actually is (decision ours)

Pedro's follower dynamics are not modelled and the sheet never claims they are.
The speed along a chain is built here:

1. Each bezier segment is sampled 220 times; arc length accumulates across the
   chain, and curvature comes off the real derivative control polygons rather
   than a chord approximation.
2. A centripetal ceiling `v = sqrt(mu_eff * g / kappa) * 0.9` per sample, with
   `mu_eff` the current config's effective grip, capped again at the engine's
   own top speed.
3. A forward pass integrating `forceAt()` from a standstill, then a backward
   pass from a dead stop at the end using `brakeDecel()`, then the minimum of
   the two against the ceilings, then `s(t)`.
4. The phase badge names which bound is binding: accelerating, turn-limited
   (the corner, not the motors), braking, stopped.

The whole profile rebuilds inside `recompute()`, so a flatter battery or a
different gear ratio moves the chain time. A 12 ft field and an 18 in robot are
the same rule-fixed scales the run animator uses, and both canvases now share
one `drawBot` painter, so the top-down wheel footprint law in "Mecanum render
spec" above is enforced in one place instead of two. The refactor was checked
by capturing the animator canvas at twelve states (forward and strafing,
mecanum and traction, four scrub positions each) before and after: all twelve
data URLs are byte-identical.

## The simulate rebuild

The three-tile sprint animator is gone. One simulate section now runs Pedro
Pathing chains across the full field, presets alongside an editor that takes a
chain you wrote yourself, and the straight sprint survives as one of those
presets. The geometry law in "Mecanum render spec" above still governs what gets
drawn, because both canvases already shared one painter.

This pass sourced the section by cloning rather than fetching. `pedropathing.com`,
`docs.pedropathing.com` and `visualizer.pedropathing.com` all return `403 CONNECT
tunnel failed` through both the fetch tool and direct curl, while the outbound
proxy reports healthy, so the block sits at the site's own edge. Shallow clones
of `Pedro-Pathing/Visualizer`, `Pedro-Pathing/Quickstart` and
`Pedro-Pathing/PedroPathing` over git were not blocked, and everything below was
read from source. Commit pins: PedroPathing `main` at `3903f3b` (2026-05-24),
whose `gradle.properties` reads `version=2.1.2`; Quickstart at `4d160da`
(2026-05-07), pinning `com.pedropathing:ftc:2.1.2`, so the two are
contemporaneous; Visualizer `main` at fetch time. Small correction to the section
above: this pass found Quickstart's current work on `main`, where pass three
recorded `master`.

### The licences, which are not one licence

- `Pedro-Pathing/Visualizer` is **Apache-2.0**, full text at the repo root, and
  its NOTICE file reads in full: "This repository has significant portions of a
  fork of this repository created by Matthew Allen, which is licensed under the
  Apache License 2.0" (verified, both files read).
- Apache-2.0 sections 2 and 4 grant the right to reproduce, prepare derivative
  works of, and redistribute the work, conditioned on carrying the licence,
  retaining notices and stating changes. Adapting visualizer source into this
  site is permitted with attribution (verified from the licence text).
- That attribution belongs in a third-party notices file kept beside these
  notes rather than in code comments, which is this repo's habit, and it has to
  carry the Matthew Allen fork provenance along with the licence text. What is
  actually adapted gets recorded with the change that adapts it, and the
  section's code fold points at the repo.
- **The core library is a different licence.** `Pedro-Pathing/PedroPathing` is
  BSD 3-Clause and `Pedro-Pathing/Quickstart` is FIRST's own BSD-style licence
  (verified). Both are permissive, neither is Apache-2.0, and the three repos
  cannot be treated as one grant. The library is Java against the FTC SDK in
  any case: a reference for behaviour here, not portable source.

### What is adapted and what is this page's own

The reusable inventory in the visualizer, all Apache-2.0: `utils/animation.ts`
and `utils/timeCalculator.ts` hold its trapezoidal and triangular motion
profile, `utils/codeExporter.ts` holds the Java `pathBuilder()` templates the
real tool emits, `utils/file.ts` and `types.ts` define the `.pp` save schema,
and `geometry.ts`, `math.ts` and `config/defaults.ts` hold supporting maths and
default numbers.

The motion profile is the one piece this page does not take. Speed along a chain
is still built the way "What the page's motion actually is" above describes:
curvature off the real derivative polygons, a centripetal ceiling from the
config's own grip, a forward pass on `forceAt()` and a backward pass on
`brakeDecel()`. Adopting the `.pp` schema verbatim is what buys
cross-compatibility with files saved out of the official tool, and the custom
editor reads it alongside pathBuilder source. Which of those files were adapted
in the end and which were only read for reference is recorded with the change
that rebuilt the section, so the notice file and this note cannot drift apart.

### What the real follower actually does

This is the part the page must not overstate, and it now comes from the
follower's own code rather than from the docs.

- The drive vector runs at **full commanded power along the path tangent**
  through the interior of a path. `VectorCalculator.getDriveVector()` returns
  maximum scaling until `ErrorCalculator.getDriveError()` stops returning -1,
  which happens only once the robot is inside a computed stopping distance of
  the end of the current path (verified, both files read).
- That stopping distance is `Kinematics.getStoppingDistance(velocity,
  forwardZeroPowerAcceleration)` scaled by a braking-start multiplier, so
  deceleration comes from the robot's own measured coast-down rate through
  `vf² = vi² + 2ad`, not from a configured maximum deceleration (verified).
  Default `DecelerationType` is `LAST_PATH`; a predictive braking controller
  exists and is off by default.
- Centripetal correction is an **additive orthogonal term**, roughly
  `centripetalScaling · mass · v² · curvature` clamped to the power limit and
  applied perpendicular to the tangent to fight predicted slip. It sums with
  the drive vector as an independent component and never reduces forward speed
  (verified).
- **So the real follower does not slow for curvature mid-path.** Nor does the
  official visualizer reproduce the follower: it runs its own independent
  trapezoidal profile off user-set `maxVelocity` 40 in/s and `maxAcceleration`
  and `maxDeceleration` 30 in/s², falls back to an eased interpolation when
  those are unset, and carries no curvature or centripetal term anywhere in its
  two motion files (verified, absence confirmed by reading both end to end).
- What this page draws is therefore the **physical grip envelope**, stricter on
  purpose than what the follower commands, and it is the same category of move
  the official tool already makes with its own kinematic profile. The page's
  one-liner says the geometry, the syntax and the Java export are real Pedro
  and the timing is this page's own estimate. It does not claim to reproduce a
  tuned follower, and it should not.

### FollowerConstants at 2.1.2, and a correction

- `FollowerConstants.defaults()` is what the no-arg constructor runs, and it
  sets `mass = 10.65`, `forwardZeroPowerAcceleration = -41.278`,
  `lateralZeroPowerAcceleration = -59.7819`, `centripetalScaling = 0.0005`,
  `holdPointTranslationalScaling = 0.45`, `holdPointHeadingScaling = 0.35`,
  `automaticHoldEnd = true`, `stuckVelocity = 1.0` and a 500 ms stuck timeout
  (verified).
- **Correction to "FollowerConstants, displayed and not used" above.** That
  section records the 2.x acceleration defaults as -34.62719 and -78.15554.
  Both numbers are in the file, but they are in the field-level Javadoc, and
  the Javadoc is stale against `defaults()`. The values that run are -41.278
  and -59.7819. Pass three read two different pairs out of the same file and
  settled it against the quickstart; the real explanation is a comment that
  disagrees with the method sitting under it.
- `xVelocity = 81.34056`, `yVelocity = 65.43028` and `maxPower = 1` live on
  `MecanumConstants`, which agrees with the earlier note. PIDF defaults are
  translational `(0.1, 0, 0, 0.01)`, heading `(1, 0, 0, 0.01)` and a filtered
  drive `(0.025, 0, 0.00001, 0.6, 0.01)`, with more aggressive secondary
  variants for large error (verified).
- What a real team ships: the quickstart's `Constants.java` is
  `new FollowerConstants()` with nothing tuned, plus
  `new PathConstraints(0.99, 100, 1, 1)` (verified).
- **The honest limit of a browser profile.** The library's own Javadoc
  describes `forwardZeroPowerAcceleration` and its lateral twin as values found
  with the named tuner opmodes, which makes them mandatory per-robot
  measurements and the shipped defaults generic placeholders. Any browser-side
  timing estimate that never asks for a team's tuned constants is an
  approximation by the project's own design, and that is equally true of the
  official visualizer, whose settings are not derived from `FollowerConstants`
  at all. Closing the gap would take a team's own mass, zero-power
  accelerations and PIDF gains, and then the control loop around them, not just
  the numbers (verified as a synthesis of the source; no docs sentence could be
  quoted for it, because the docs site is blocked).

### API surface and file format at 2.1.2

- `Pose` exists and `Point` does not: a repo-wide search for a `Point` class
  returns nothing at 2.1.2 (verified), which confirms the version break
  recorded above and dates it. Presets written in 1.0.x `Point` syntax stay
  only where the page labels them legacy.
- Construction: `BezierLine(Pose, Pose)`, `BezierCurve` from a `List<Pose>` or
  from bare `Pose` varargs (because `Pose` implements `FuturePose`), a
  `BezierCurve.through(Pose...)` factory, and `BezierPoint(Pose)` for a
  stationary hold whose curvature and derivative are zero (verified).
- `PathBuilder` carries `addPath` and `addPaths`,
  `setLinearHeadingInterpolation` in two-, three- and four-argument forms,
  `setConstantHeadingInterpolation`, `setTangentHeadingInterpolation` (also the
  default when nothing is set), `setReversed`, `setHeadingInterpolation`,
  per-path braking and constraint setters, `addParametricCallback` with
  temporal and pose-triggered cousins, `build()`, and a global variant of each
  heading call. `curveThrough`, a Catmull-Rom to Bezier convenience, is real
  and was missing from the earlier note (verified).
- The official save format is JSON under a `.pp` extension: a `startPoint`, a
  list of `lines` each carrying an end point, control points, colour and
  optional waits, plus optional `shapes`, `settings`, an ordered `sequence` of
  path and wait steps, and named `pathChains`. Headings are stored in degrees
  and converted with `Math.toRadians` on export, since the real API takes
  radians (verified, schema and exporter both read). The custom editor accepts
  this alongside pathBuilder source, so a file saved out of the official tool
  opens here.
- **Field span, settled.** The visualizer sets `FIELD_SIZE = 141.5` in its
  defaults; the docs' example autos and every quickstart coordinate are written
  against 0 to 144. The page keeps 144, because that is the frame its preset
  coordinates live in, and notes 141.5 as the interior playing surface. Same
  conclusion as the field-size note above, now from the source constant instead
  of release notes.
- Still unpinned: the docs' own prose warnings and tuning cautions in their own
  words; whether `visualizer.pedropathing.com` serves the same commit as
  `main`; and any single documented statement of how accurate a path estimate
  can be without tuned gains. All three need the blocked domain to load.

## Exact cartridge ratios (the 435 vs 438 fix)

The page computed wheel speed from the marketing name on the cartridge, so the
default goBILDA option, labelled "13.7:1 cartridge (435 rpm)", produced
6000/13.7 = 438 rpm of free speed at 1:1 external. A reader flagged it. The card
was printing two speeds three rpm apart and the vendor's own label was the
honest one.

**Correction to "Buildable gearing" above.** That section records the rounding
and then waves it through: "the calculator uses marketed ratios and treats the
~1% rounding as far inside the μ band". The arithmetic there is fine and the
conclusion was wrong. A tolerance argument justifies living with an error you
cannot remove. It does not justify printing a number the label beside it
contradicts, and removing this one costs nothing.

Rule now: a cartridge's ratio in the engine is whatever reproduces the free
speed its vendor publishes. Across the Yellow Jacket line that means
back-solving against goBILDA's 6000 rpm bare-motor figure, `ratio = 6000 /
published rpm`, on every rung without exception. No option on the picker
displays a speed that disagrees with the speed in its own label.

| Option | Ratio the engine uses | Published rpm | Basis |
| --- | --- | --- | --- |
| Bare motor | 1 | 6000 | goBILDA 1:1 product page (verified, snippet) |
| 3.7:1 | 6000/1620 = 3.7037 | 1620 | back-solved (rpm verified, snippet) |
| 5.2:1 | 6000/1150 = 5.2174 | 1150 | back-solved (rpm verified, snippet) |
| 13.7:1 | 6000/435 = 13.7931 | 435 | back-solved (rpm verified, snippet) |
| 19.2:1 | 6000/312 = 19.2308 | 312 | back-solved (rpm verified, snippet) |
| 26.9:1 | 6000/223 = 26.9058 | 223 | back-solved (rpm verified, snippet) |
| 50.9:1 | 6000/117 = 51.2821 | 117 | back-solved (rpm verified, snippet; see "The one sourced fraction") |
| 71.2:1 | 6000/84 = 71.4286 | 84 | back-solved (rpm verified, snippet) |
| 99.5:1 | 6000/60 = 100 | 60 | back-solved (rpm verified, snippet) |
| 139:1 | 6000/43 = 139.5349 | 43 | back-solved (rpm verified, snippet) |
| 188:1 | 6000/30 = 200 | 30 | back-solved (rpm verified, snippet) |

**What the back-solve is, and what it is not.** It guarantees exactly one thing:
the readout agrees with the label. It is not a tooth count. It trusts two
published figures, the per-cartridge rpm and the 6000 rpm bare motor, and no
source found says either is exact rather than rounded. The 6000 in particular is
a marketing round number, which the next section proves from goBILDA's own code,
so every ratio in the table inherits that error, silently and equally, at about
0.8 percent. The limitation is recorded rather than hidden, because the
alternative on offer was a reconstruction rather than a citation.

Two rows show the back-solve's own weak spot. The 99.5:1 cartridge lands on
exactly 100 and the 188:1 on exactly 200, because their published speeds, 60 and
30 rpm, carry one or two significant figures between them: at the slow end of
the line a 1 rpm rounding is a 3 percent ratio error. Label and readout still
agree, which is all the fix promised, but on those rungs the agreement is
coarse. 188:1 is also the worst-fitting name in the line, missing its own
published speed by better than six percent, which is a reason to stop quoting
marketing ratios in design reviews.

**The one sourced fraction.** goBILDA's own competition code, repo
`goBILDA-Official/Ri3D_24-25`, file `GoBildaRi3D2425.java`, fetched from
`raw.githubusercontent.com` and read in full (verified): "The motor we use for
this arm is a 117RPM Yellow Jacket. Which has an internal gear reduction of
~50.9:1. (more precisely it is 250047/4913:1)". That works out to 50.89497, and
250047 = 63³ with 4913 = 17³, so the cartridge is three identical 63/17 stages,
which is (1 + 46/17)³. This is the only exact cartridge fraction anybody in the
FTC supply chain publishes, and it is real.

**The page does not use it.** Feed the sourced fraction a nominal 6000 rpm motor
and it returns 117.9 rpm, against the 117 goBILDA prints on the same cartridge.
Two published goBILDA figures disagree, so at most one of them is exact, and the
arithmetic says which: 117 × 250047/4913 = 5954.7, so a motor that genuinely
turns 117 rpm behind that gearbox is a **5955 rpm** motor, not a 6000 rpm one.
The 6000 is the round number. Which means the back-solve is not innocent either.
`ratio = 6000 / published rpm` bakes that same rounding into every single rung
in the table, uniformly and invisibly: each ratio is high by roughly the same
0.8 percent, and every wheel speed the page prints inherits it.

Given that both options are wrong by the same small amount, the page picks the
one a team can check. Back-solving everywhere means the number under "13.7:1
cartridge (435 rpm)" reads 435, the number under "50.9:1 cartridge (117 rpm)"
reads 117, and a reader comparing the page against the vendor listing finds
agreement on every row. Shipping the sourced fraction on one rung bought a
slightly better physical model of that one gearbox and paid for it with a
picker where a single option printed 118 against its own label, which is the
exact failure the exact-ratio work existed to remove. Accuracy the reader cannot
verify lost to consistency the reader can.

- **Partial correction to "Buildable gearing" above**, which rejected the
  (1+46/17)² hypothesis for 13.7:1 as "arithmetic coincidence, not a sourced
  tooth count". The stage itself is real and now has a primary source. What
  stays rejected is generalising it: (63/17)² = 13.73356 implies 436.9 rpm
  against a published 435, and covering the rest of the ladder needs a second
  stage type nobody publishes. A reconstruction using a 57/11 second stage does
  reproduce every marketing name in the line, but misses published rpm by 2 to 8
  on several rungs, so it stays a hypothesis in the fact sheet and ships nowhere.
  Per-stage tooth counts for every other rung are unpinned.
- The fraction still earns its place in the record: it is the one hard datum
  about what is physically inside any of these cartridges, and it is what proves
  the 6000 rpm bare-motor spec is itself rounded. It informs the notes. It does
  not set a number on the page.

**Correction: the 43 rpm rung is back.** The note above under "goBILDA Yellow
Jacket" keeps 139:1 off the picker because no pass had surfaced a product URL
for it. This pass did, as a gobilda.com product-page title mirrored on
servocity.com and optii.com.au (verified, snippet), which retires the reason for
withholding it. The full sold ladder is eleven rungs: 1, 3.7, 5.2, 13.7, 19.2,
26.9, 50.9, 71.2, 99.5, 139 and 188. Its stall torque is still unpinned for the
Yellow Jacket; goBILDA's Saturn line publishes 281 kg·cm at the same ratio name
on a different and faster motor, which is evidence that the ratio names are a
shared gearbox platform and is not a torque figure for this motor.

**REV and AndyMark.** REV's UltraPlanetary cartridges already ran on actual
ratios (2.89, 3.61, 5.23) and needed no change. AndyMark cannot clear the same
bar: its Orbital speeds found this pass (about 6600 rpm bare, about 1784 at
3.7:1, 340 at 19.2:1) rest on a free speed published as an approximation, and
nothing found says the Classic 40:1 and 60:1 names are rounded at all. The
rounding habit is visible there anyway, since AndyMark's own product name for
the 19.2:1 box is "NeveRest Orbital 20" (verified, snippet), but a rounded
product name is not a ratio correction. Back-solving approximate rpm against an
approximate bare speed would be arithmetic dressed as sourcing, so the AndyMark
gap is recorded here instead.

## The recommendation objective: overall movement

The old objective was whatever the run bar happened to be showing, a sprint of
the distance on the slider or a cycle assembled from leg lengths typed into a
box. Moving a slider that describes the display therefore moved the recommended
gearing, and so did loading a different path. That is the complaint that started
this pass, and it is a real defect: a tool that changes its advice when you
change the question you are looking at has no advice.

The objective is now one fixed composite, computed the same way whatever the
page is displaying.

1. **Distance ladder.** Straight sprints at 1, 2, 3, 4 and 6 tiles, each one
   charged for the stop at the end. Braking is not optional inside the
   objective, which is the review's flaw #3 made structural rather than
   toggleable.
2. **Two battery states, weighted equally.** The whole ladder runs once on the
   pack as configured and once on a match-drained pack. The drained state
   reduces rest voltage by a fixed amount with a floor under it, taken off the
   NiMH figures in "State of charge" above, and leaves pack and loop resistance
   as set. Rest voltage is the only term the drain moves, because it is the only
   one the flat NiMH curve still supports directionally: a pack that has been
   run down does sit lower at rest, even though the volts say little about how
   much is left. The floor keeps the drained state above the dead-cell line that
   11.8 V marks. The exact reduction is stated in the board's own fold, so the
   page and this note cannot drift.
3. **Score.** The mean of those ten times. The recommendation is the buildable
   recipe with the lowest score, and the sweep curve, the plateau window and the
   sensitivity band recompute on the same composite, so the chart and the
   verdict cannot disagree about what they are ranking.

Why a ladder and not one distance: a one-tile hop is decided almost entirely by
launch acceleration and a six-tile run almost entirely by top speed, and every
match contains both. Scoring one distance picks a side of that tradeoff and
calls it optimal. Averaging the ladder is a declaration that the question being
answered is "what should this robot be geared for overall", not "what is fastest
at exactly the distance currently on the slider".

Why a drained pack: a lower supply voltage lowers free speed and deepens the sag
under launch current, and both push the best ratio shorter, so an answer tuned
on a fresh pack sits taller than the one the last match of the day wants.
Averaging the two is a compromise rather than a discovery, and it is the
compromise a team already lives with, since the same robot plays both matches.

Honest limit, stated the same way as everything else here: the composite is a
proxy. No real match is five fixed-length sprints on two battery states. It is
defensible because it is fixed, because it straddles the accel and top-speed
ends of the tradeoff instead of sitting at one end, and because it is written
down. It is not measured, and the encoder-log condition in "Open questions"
below is still the only thing that would change that.

## Board content budget

The board carries one decision, so it gets a content budget and the rest goes
behind a fold.

- Lead with the buildable recommendation: the rpm and the recipe name, because
  that is the thing a team can order.
- One status line under it, either "you are inside the window" or "swap to this,
  save this much".
- The continuous ideal sits below the recommendation as information and is never
  the recommendation. Nobody sells the ideal rpm, so leading with it invites a
  build nobody can do, which was the original review's flaw #4 in a new costume.
- Window explanation, best-time spread, runner-up, scoring basis and the drain
  state move into one fold titled for what it answers, "how this is scored".
- No sentence on the board proper runs much past eight words.

Basis: the board had grown into paragraphs, and a paragraph on a verdict card is
read as decoration and skipped. Everything cut from it is still on the page, one
click down. The spec-versus-dyno line stays on the board proper because it
changes which number you are reading, not merely why.

## Times from the actual path

The headline time is now the drive time of the chain the simulate section is
actually showing, preset or pasted, and a cycle is that chain plus a typed
overhead for the part of a cycle that is not driving. The old cycle-legs input
is retired: it described a second geometry, invented in a text box, while a real
chain sat on the canvas underneath it. Straight sprint survives as a mode for
quick checks and keeps the distance slider and the stop toggle.

Does timing a curved chain widen the error bar against timing a straight sprint?
No, and the reason is that there is only one engine. The chain profile calls the
same `forceAt()` and `brakeDecel()` the sprint calls, over the same sag model,
the same fuse budget, the same μ, the same rolling resistance and the same
efficiency constants, inside the same `recompute()`. What the chain adds is
geometry: arc length off the sampled beziers, and a centripetal ceiling built
from the same effective μ with the 0.9 margin recorded in "What the page's
motion actually is" above. It introduces no constant that the sprint did not
already carry, so it inherits the sprint's accuracy envelope exactly, and the
envelope is wide for the reasons this whole file exists.

What the chain time is still not is a prediction of a tuned follower. "What the
real follower actually does" above settles that from the follower's own source:
it drives full power down the tangent, brakes only inside stopping distance, and
adds centripetal correction as an orthogonal term that never slows the robot.
The page draws the grip envelope instead, which is stricter on purpose. One
consequence worth stating: because the board and the animation now read the same
profile, a wrong number and a wrong picture fail together and visibly, which is
the same-data honesty rule the run animator row already records.

## Why the pack-state chips came off

"State of charge" above is the whole argument. NiMH open-circuit voltage is
nearly flat across the middle of capacity, about 0.02 V per cell between 81% and
55% remaining, so resting volts are a poor charge gauge. A three-button picker
labelled full, mid-day and worn presented that same flat curve as three readable
states, which is a resolution claim the chemistry does not support. The numbers
were never wrong. The chrome around them promised something they cannot deliver.

Rest voltage stays as a typed field, and the 13.5 / 12.0 / 11.8 V readings stay
as prose in the battery fold, including the part that actually earns its keep:
11.8 V is a dead-cell detector, not a discharge level.

The pack-health chips stay, and the difference is the point. 80, 100 and 130 mΩ
are readings off this team's own tester, and the field takes the number the
screen shows. That is a measurement with an instrument behind it, not an
inference from a flat curve.

## Typed teeth, stocked recipes

Catalog extremes confirmed this pass, each from a distinct product URL (verified,
snippet): MOD 0.8 pinions at 15, 20, 24, 30, 36 and 40 teeth, and MOD 0.8
hub-mount gears at 48, 50, 60, 68, 80, 90, 96, 100, 105 and 108. Against
"External stage types" above that adds a 40T pinion and 50T and 68T hub gears.
Two targeted searches in each direction found nothing below 15 or above 108, so
the range is best evidence rather than a certified catalog boundary.

Those sixteen counts are the gear family's shipped list. One table in the page
feeds both the per-family suggestion lists on the tooth inputs and the pool the
recipe engine shops from, so a size confirmed in research cannot end up
suggested but unbuyable, or buildable but unsuggested.

That is the argument for typing rather than picking. A fixed select is a claim
that the list is complete, this list demonstrably was not, and the sizes that
kept turning up outside it were real products. Teeth are numeric inputs now,
with the stocked sizes attached as suggestions per family and a clamp wide
enough to hold anything buildable, including the sprocket and pulley ladders.

The boundary that does not move: the recipe engine still names only stocked
parts. Typing 37 teeth is a legal what-if and the tool will time it honestly; it
will never appear in a recommendation, because a recommendation is a shopping
list. That is the same rule "Buildable gearing" above already states, and
widening the input does not widen it.

## Decisions → basis

| Decision on the page | Basis |
| --- | --- |
| Thermal i²t fuse mode, hard cap kept | ATM blade trip curves (verified) + one-shot consequence |
| Braking charged, strength user-set (default 0.6) | RR configs vs traction ceiling; no measurement exists |
| Verdict = buildable recipe from verified parts only | Product-URL-confirmed tooth counts; pinions unpinned |
| Optimum reported as 1%-plateau window across μ±0.10, R±0.05 | Only tile μ spec (0.51) sits below folklore; loop-R spread is real |
| SOC presets 13.5 / 12.0 / 11.8 V | 10 x 1.35 V rested; 12-13 V working band; 11.8 V is the one-dead-cell line |
| Pack-health chips 0.12 / 0.14 / 0.17 Ω | Measured pack ladder (80/100/130 mΩ) plus a ~35 mΩ wiring allowance |
| COTS presets first, custom everywhere | Pit-onboarding request; folklore constants keep their labels |
| Spec/dyno both computed, never blended | gm0's own "testing methods" note; cold-vs-sustained physics |
| Encoder-log overlay + Crr back-solve | The review's closing condition; validation still owed |
| Run animator plays the scoring integration | Same-data honesty; a robot sliding past its brake marker is visible |
| Animator drawn to one true scale | 18 in cube and 96 x 38 mm wheels are rule- and vendor-fixed, so nothing needs fudging |
| Path visualiser kept separate from the run animator | They answer different questions: one is a straight-line sprint, the other a real chain on a whole field |
| Pedro syntax and coordinates shipped verbatim, motion from this engine | The coordinates are attributable and the follower dynamics are not modelled; the sheet says both |
| Preset list leads with the 2.x DECODE auto, keeps one 1.0.x example | The `Point` to `Pose` break at v2.0.0 is live in the wild, so both generations need to be readable |
| Circle example re-anchored on (72, 72) and labeled adapted | It is written around the robot's own (0,0) and would leave a corner-origin field |
| One shared `drawBot` for both canvases | The wheel footprint law was already written down once; it should be coded once |
| One platform select replaces the brand and cartridge pair | No vendor states that gearboxes cannot cross brands, but each brand's own interface data forces it and nobody sells an adapter |
| External stages typed, named for what they are | goBILDA belts are HTD 5 mm and no Gates product is called GT5; the 8 mm and #25 chain pitches cannot share a sprocket |
| Sweep chart windowed to its own markers | The plateau window is the output, so the axis should resolve it rather than spend its width on ratios nobody would build; padding keeps every marker off the edge |
| One full-field simulate section with a custom path editor | The sprint strip and the path sheet ran the same physics on different geometry; real chains, pasted pathBuilder code and the `.pp` format replace both, which supersedes the row above about keeping them separate |
| Pins save the robot, never the path | A pinned setup is something you can build and hand to a teammate; path state belongs to the simulate section and would make one robot pin as two |
| Cartridge ratios exact, back-solved from published rpm | The 13.7:1 label said 435 rpm while the page computed 438; `6000 / published rpm` makes label and readout agree, and only 50.9:1 has a fraction anyone publishes |
| Recommendation scored on the overall-movement composite | A control that changes the display should not change the advice; a stop-charged ladder averaged over a drained pack is the match-long question, not the slider's question |
| Board leads with the buildable, ideal printed below it | Nobody sells the ideal rpm, so the orderable recipe is the decision and the continuous optimum is context |
| Headline and cycle times taken from the selected chain | Same engine and same constants as the sprint, so the accuracy envelope does not move, and the board now times the route the animation draws |
| Apply-recommended changes gear ratio and nothing else | The verdict is about gearing; touching weight, wheels or battery would rewrite the robot the user described in order to win its own argument |
| Reset restores the fresh-visit defaults exactly | One canonical defaults object feeds both first load and reset, so they cannot drift, and every restored value clamps to its field bounds so a corrupt payload cannot inject a weird one |
| Stage teeth typed, stocked sizes as suggestions | The confirmed MOD 0.8 ladder runs 15–40 pinion and 48–108 hub, wider than any select shipped, while recipes still name stocked parts only |
| Pack-state chips removed, pack-health chips kept | Rest volts are flat across the NiMH middle, so three labelled states oversold a reading; the tester's mΩ number is an instrument reading and stays |
| Three-up charts drawn as equal blocks | They are three views of one run, so unequal frames make the eye compare the frames instead of the curves |

## Open questions the next pass should close

1. REV pack internal resistance: 11–20 mΩ (docs snippet) vs <170 mΩ (forum).
   Read the live REV page and settle the units; the team's measured 80–130 mΩ
   ladder already brackets the practical answer.
2. A real strafe-effectiveness measurement (force and speed, same robot).
2b. The main power switch (REV-31-1387) contact resistance, 4-wire measured:
   0-50 mOhm of unresolved spread is the largest single unknown in the loop.
3. The goBILDA small-pinion gear ladder, from product pages.
4. gm0's dyno methodology and exact table values.
5. FTC-BW (the FTC-revised JVN calculator): fetch it and see how much of this
   page's differentiation it already covered.
6. goBILDA's 18.7 kg·cm output-shaft figure: re-fetch the 435 rpm product page
   to re-confirm v1's recorded check.
7. The only fix that matters: one encoder log over the sprint-profile chart.
8. goBILDA's real per-stage tooth counts. All eleven rungs currently run on
   decimals back-solved from published rpm. Exactly one true fraction is known,
   250047/4913 for the 50.9:1, and the page deliberately does not use it because
   it contradicts that cartridge's own published speed. A full set of true
   fractions, from another `goBILDA-Official` repo or a spec sheet that will
   actually fetch, would settle the question and let the picker be both exact
   and self-consistent. Expect the swap to move each ratio by well under a
   percent and to change no conclusion, which is exactly why it is worth doing
   cheaply rather than guessing.

## Provenance

Two research passes, both WebSearch-only (the environment blocks full page
fetches), harvested 2026-07-26. Pass one: eight parallel shards covering motors,
traction, braking, buildable gearing, tipping, spec-vs-dyno and prior art. An
earlier orchestrated attempt died to a sandbox tooling fault before any searches
ran and was re-dispatched. Pass two: six shards plus three adversarial checks,
covering the FTC battery in depth (REV and goBILDA specs, pack internal
resistance, the non-battery loop budget, the NiMH voltage curve) and mecanum
render geometry. Pass two corrected pass one on pack resistance, which is the
single largest factual change in this document. Battery voltage and pack
resistance readings come from the team's own packs, supplied by the owner on
2026-07-26; the research established their units and their loop-total mapping.
Constants in the page code carry comments pointing back here.

Pass three, 2026-07-27, added the Pedro Pathing visualiser. It is the first
pass on this document whose sources were read in full rather than reconstructed
from snippets: `raw.githubusercontent.com` and `github.com` HTML both fetch from
this environment, so the library source, the quickstart files and the docs MDX
were read directly. `api.github.com` and `pedropathing.com` are both blocked at
403, which is why the docs come from the `Pedro-Pathing/Docs` repo that builds
that site. Every path coordinate on the page is quoted from one of those files,
and the one preset with no source says so in the sheet.

Pass four, 2026-07-27, covered the restructure: motor platforms and gearbox
compatibility, external stage types and their efficiencies, and a second read of
Pedro Pathing from source. The vendor domains still refuse direct fetches, so
the platform and stage rows are snippet sourcing of specific product URLs and
are tagged for it. Pedro is the exception again, and more so than in pass three:
the three repos were shallow-cloned over git and read in full at the commits
pinned in "The simulate rebuild" above, which is a stronger basis than the
rendered docs would have been and is why that section corrects pass three on the
follower's acceleration defaults.

Pass five, 2026-07-27, covered exact cartridge ratios and the objective rebuild
that followed from the owner's own reading of the page. The vendor domains still
answer direct fetches with 403, including their spec-sheet PDFs, so the Yellow
Jacket rpm ladder and the MOD 0.8 catalog extremes are snippet sourcing of
specific product URLs and are tagged for it. One source is stronger than
anything else in this document, and it is the reason the ratio section exists:
goBILDA's own competition code on GitHub fetches without trouble, and it states
one cartridge's exact fraction in a comment. Every other ratio on the page is
back-solved from a published speed, which is a decision recorded above with its
limitation attached.
