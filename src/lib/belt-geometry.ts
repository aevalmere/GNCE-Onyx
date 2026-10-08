// Open-belt geometry for two timing pulleys. Pure functions, no DOM, so the
// /belt page and scripts/check-belt-geometry.mjs run the same arithmetic.
//
// Everything is on the PITCH LINE, which is where a timing belt's length is
// specified (the cord line runs at the pitch diameter, not at the tooth
// tips), and in millimetres:
//
//   D        = N · p / π                       pitch diameter, N grooves at pitch p
//   φ        = asin((D_L − D_S) / 2C)          half the angle the two spans make
//   L        = 2C·cos φ + (π/2)(D_L + D_S) + φ(D_L − D_S)
//   wrap_S   = π − 2φ                          on the small pulley
//   wrap_L   = π + 2φ                          on the large one
//
// The length is exact: two tangent spans of length C·cos φ each, plus the arc
// on each pulley at its own wrap angle. Nothing here uses the familiar
// 2C + 1.57(D + d) + (D − d)²/4C, which is that formula's series expansion
// and drifts as the ratio grows. dL/dC works out to exactly 2·cos φ, which
// is what makes Newton's method on C clean: the slope is known in closed
// form and positive everywhere the geometry exists.

export const pitchDia = (teeth: number, pitch: number) => (teeth * pitch) / Math.PI;

/** Pitch length of the belt that wraps both pulleys at centre distance C. */
export function beltLength(c: number, d1: number, d2: number): number {
  const dl = Math.max(d1, d2), ds = Math.min(d1, d2);
  const e = (dl - ds) / 2;
  if (!(c > e) || !isFinite(c)) return NaN;
  const phi = Math.asin(e / c);
  return 2 * c * Math.cos(phi) + (Math.PI / 2) * (dl + ds) + phi * (dl - ds);
}

/** The shortest belt the geometry admits: the large pulley alone, wrapped
 *  all the way round as C closes down to the radius difference. Nothing at or
 *  under it has a centre distance. */
export const minLength = (d1: number, d2: number) => Math.PI * Math.max(d1, d2);

/**
 * Centre distance for a belt of pitch length L. Safeguarded Newton: a Newton
 * step that would leave the bracket is replaced by bisection, so it cannot
 * diverge, and it stops when the length it reproduces is within 1e-9 mm of
 * the target, which puts C within about 1e-9 mm too (the slope is 2·cos φ,
 * near 2 for any real drive). Returns NaN when no C exists.
 */
export function centreDistance(len: number, d1: number, d2: number): number {
  if (!isFinite(len) || !(len > minLength(d1, d2))) return NaN;
  const dl = Math.max(d1, d2), ds = Math.min(d1, d2);
  const e = (dl - ds) / 2;
  const f = (c: number) => beltLength(c, dl, ds) - len;

  // Bracket. L(C) > 2C·cos φ and cos φ → 1, so C = L/2 is past the root for
  // any belt long enough to matter; the loop guards the rest.
  let lo = e, hi = Math.max(len / 2, e * 2 + 1);
  for (let i = 0; i < 60 && f(hi) < 0; i++) hi *= 2;

  // Start from the textbook approximation, which is already within a few
  // hundredths of a millimetre on an ordinary drive.
  const b = len - (Math.PI / 2) * (dl + ds);
  const disc = b * b - 2 * (dl - ds) * (dl - ds);
  let c = disc > 0 ? (b + Math.sqrt(disc)) / 4 : (lo + hi) / 2;
  if (!(c > lo && c < hi)) c = (lo + hi) / 2;

  for (let i = 0; i < 100; i++) {
    const fc = f(c);
    if (Math.abs(fc) < 1e-9) return c;
    if (fc > 0) hi = c; else lo = c;
    const slope = 2 * Math.cos(Math.asin(e / c));
    let next = c - fc / slope;
    if (!(next > lo && next < hi)) next = (lo + hi) / 2;
    if (Math.abs(next - c) < 1e-13) return next;
    c = next;
  }
  return c;
}

export interface Wrap {
  /** Wrap on the small pulley, radians. */
  small: number;
  /** Wrap on the large pulley, radians. */
  large: number;
  /** Teeth engaged on the small pulley: its tooth count times its share of a turn. */
  teethInMesh: number;
}

export function wrap(c: number, n1: number, n2: number, pitch: number): Wrap {
  const d1 = pitchDia(n1, pitch), d2 = pitchDia(n2, pitch);
  const e = Math.abs(d1 - d2) / 2;
  if (!(c > e)) return { small: NaN, large: NaN, teethInMesh: NaN };
  const phi = Math.asin(e / c);
  const small = Math.PI - 2 * phi;
  return { small, large: Math.PI + 2 * phi, teethInMesh: (Math.min(n1, n2) * small) / (2 * Math.PI) };
}
