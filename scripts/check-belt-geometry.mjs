// Holds the /belt solver (src/lib/belt-geometry.ts) to published numbers and
// to an independent construction. Exits non-zero on any miss.
//
//   node scripts/check-belt-geometry.mjs
//
// Needs a Node that strips TypeScript types on import (22.18+ or 23.6+),
// since it imports the page's own .ts module rather than a copy of it.
//
// 1. Gates PowerGrip GT2 Belt Drive Design Manual, Belt Drive Selection
//    Procedure, Step 3 example: "the center distance of 30.02 inches uses a
//    2400mm (94.49-inch), 8mm pitch belt" for 72 to 144 grooves, and "the belt
//    length used for the 30.42-inch center distance is a 2310mm (90.94-inch),
//    14mm pitch belt" for 36 to 72. Gates works in the inch lengths it prints,
//    so the check does too. The textbook approximation (Gates' Formula 83)
//    rounds to 30.03 and 30.43 on these and is printed beside the solver for
//    contrast.
// 2. The closed-form length against a belt built from explicit tangent points
//    and arc angles, across ratios from 1:1 to 7.5:1 and spacings from tight
//    to long.
// 3. Round trip: C -> L -> C to well under 0.01 mm.
// 4. Teeth in mesh against Gates' approximate formula, Ngg(0.5 - (D - d)/6C).

import { beltLength, centreDistance, minLength, pitchDia, wrap } from '../src/lib/belt-geometry.ts';

let fails = 0;
const ok = (cond, msg) => {
  if (!cond) fails++;
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`);
};

// 1. Published drives
const IN = 25.4;
for (const { n1, n2, pitch, lenIn, publishedIn } of [
  { n1: 72, n2: 144, pitch: 8, lenIn: 94.49, publishedIn: 30.02 },
  { n1: 36, n2: 72, pitch: 14, lenIn: 90.94, publishedIn: 30.42 },
]) {
  const d = pitchDia(n1, pitch), D = pitchDia(n2, pitch);
  const c = centreDistance(lenIn * IN, d, D) / IN;
  const K = 4 * lenIn - 6.28 * (D + d) / IN;
  const approx = (K + Math.sqrt(K * K - 32 * ((D - d) / IN) ** 2)) / 16;
  ok(Math.round(c * 100) / 100 === publishedIn,
    `Gates ${n1}/${n2} grooves, ${pitch} mm pitch, ${lenIn} in belt: solver ${c.toFixed(4)} in, published ${publishedIn} in (Formula 83 gives ${approx.toFixed(4)})`);
}

// 2 and 3. Independent construction and round trip
const tangentBelt = (c, r1, r2) => {
  // Circle 1 at the origin, circle 2 at (c, 0). The upper external tangent
  // touches both circles where their radius points along n = (cos a, sin a),
  // with c·cos a = r1 - r2. The belt runs the far side of circle 1 (2π - 2a)
  // and the near side of circle 2 (2a).
  const a = Math.acos((r1 - r2) / c);
  const n = [Math.cos(a), Math.sin(a)];
  const span = Math.hypot(c + r2 * n[0] - r1 * n[0], r2 * n[1] - r1 * n[1]);
  return 2 * span + r1 * (2 * Math.PI - 2 * a) + r2 * 2 * a;
};
let worstL = 0, worstC = 0, cases = 0;
for (const [n1, n2, p] of [[16, 48, 5], [24, 24, 5], [16, 24, 5], [48, 16, 5], [20, 60, 2], [20, 150, 2], [12, 90, 2], [40, 20, 2]]) {
  const d1 = pitchDia(n1, p), d2 = pitchDia(n2, p);
  for (let c = (d1 + d2) / 2 + 1; c < 1500; c *= 1.37) {
    const L = beltLength(c, d1, d2);
    const big = Math.max(d1, d2) / 2, small = Math.min(d1, d2) / 2;
    worstL = Math.max(worstL, Math.abs(L - tangentBelt(c, big, small)));
    worstC = Math.max(worstC, Math.abs(centreDistance(L, d1, d2) - c));
    cases++;
  }
}
ok(worstL < 1e-9, `closed form vs tangent construction, ${cases} drives: worst ${worstL.toExponential(2)} mm`);
ok(worstC < 1e-6, `C -> L -> C round trip, ${cases} drives: worst ${worstC.toExponential(2)} mm`);

// Equal pulleys reduce to two spans and one full turn.
const d24 = pitchDia(24, 5);
ok(Math.abs(beltLength(100, d24, d24) - (200 + Math.PI * d24)) < 1e-12, 'equal pulleys: L = 2C + πD');

// No center distance for a belt that cannot wrap the large pulley once.
ok(Number.isNaN(centreDistance(minLength(pitchDia(16, 5), pitchDia(48, 5)), pitchDia(16, 5), pitchDia(48, 5))),
  'belt of one turn around the large pulley: no center distance');

// 4. Teeth in mesh
let worstT = 0;
for (const [n1, n2, p, c] of [[16, 48, 5, 120], [20, 60, 2, 80], [12, 90, 2, 150], [24, 24, 5, 90]]) {
  const d = pitchDia(Math.min(n1, n2), p) / IN, D = pitchDia(Math.max(n1, n2), p) / IN;
  const gates = Math.min(n1, n2) * (0.5 - (D - d) / (6 * c / IN));
  worstT = Math.max(worstT, Math.abs(wrap(c, n1, n2, p).teethInMesh - gates) / gates);
}
ok(worstT < 0.02, `teeth in mesh vs Gates' approximation: worst ${(worstT * 100).toFixed(2)}%`);

console.log(fails ? `${fails} failed` : 'all checks pass');
process.exit(fails ? 1 : 0);
