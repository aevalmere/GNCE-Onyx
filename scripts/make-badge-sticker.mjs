/**
 * Builds the hero's die-cut sticker from the raw badge artwork.
 *
 * A sticker is a physical object: the artwork is printed on vinyl and a blade
 * runs round it a couple of millimetres out. CSS cannot cut that shape (the
 * only tool it has is a blurred drop-shadow, and blur is out per DESIGN.md),
 * so the cut is baked into the file here and the site just prints it.
 *
 * The cut is a real path, not a picture of one: a closed loop of straight
 * segments and circular arcs, and the image is rendered from the exact
 * distance to that path. That is the whole reason the edge is smooth. An edge
 * derived by thresholding a pixel mask's distance field cannot be smooth
 * however carefully it is done, because the distance to a pixelated edge is
 * not a linear ramp. The nearest pixel centre jumps as you slide along it, and
 * that half-pixel ripple prints as the scalloped, dotted edge you get on a
 * long shallow curve. A path has no pixels in it, so its distance field is
 * exact and the edge is as clean as the encoder will carry.
 *
 * The shape it cuts is the convex hull of the paint with a couple of dips
 * pressed into it. The hull is what gives the cut its straight runs and keeps
 * the border thin, since a hull has no inward curves to round and a curve of
 * radius R cannot pass within R of a spike. But a hull alone bridges over
 * every hollow, including the two that are wide enough to read as a mistake,
 * so the widest hull edges get one dip each: the script measures the clearance
 * from every hull edge down to the paint and presses in only the DIPS deepest,
 * which is why they land where the drawing actually asks for them rather than
 * wherever a threshold happened to fall. Tracing the paint's own outline
 * instead gives fifteen dips and a blob; do not go back to it.
 *
 * Pipeline: paint -> hull, simplified (pixels, cheap, sets the shape) -> press
 * in the deepest dips -> fillet every corner, inward and outward alike (where
 * the straight lines and arcs come from) -> exact signed distance to the path
 * (analytic, sets the quality) -> paint clipped at the path, vinyl cut CUT
 * outside it.
 *
 * The drawing is cropped tight (the orbit ring's lowest point is tangent to
 * the bottom edge, and the nebula's faint outer paint runs off all four), so
 * the mask lives on a grid padded past every offset. Run the morphology on the
 * artwork's own grid and the border comes out flat along the bottom and the
 * left, which is the one seam it exists to hide.
 *
 * Run:  node scripts/make-badge-sticker.mjs
 * In:   src/assets/onyx-badge.webp        (the drawing, keyed to alpha)
 * Out:  src/assets/onyx-badge-sticker.webp
 */

import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(here, '..', 'src', 'assets', 'onyx-badge.webp');
const num = (k, d) => (process.env[k] ? Number(process.env[k]) : d);
const DST = process.env.OUT || path.join(here, '..', 'src', 'assets', 'onyx-badge-sticker.webp');

/** Where the paint counts as paint. The nebula fades from opaque to nothing
 *  over roughly 200px, so this is the line between cloud and haze. */
const INK = num('INK', 44);
/** Most dips the cut may have. This is the "no constant waves" number: the
 *  contour follows the drawing where a hollow is worth following and runs
 *  straight everywhere else, and this is the ceiling on how many times it is
 *  allowed to change its mind. */
const DIPS = num('DIPS', 4);
/** A hull edge has to clear the paint by at least this much before it is worth
 *  dipping, and no dip goes deeper than the second number. Dips, not bites.
 *  This drawing's hull edges clear the paint by 151, 81, 57, 40, 40 and 28, so
 *  50 takes the ones that read as hollows and leaves the noise alone. */
const DIP_MIN = num('DIP_MIN', 50);
const DIP_MAX = num('DIP_MAX', 120);
/** Paper left between the bottom of a dip and the paint it dips toward. */
const DIP_CLEAR = num('DIP_CLEAR', 22);
/** Corner radius. Every corner is filleted to this, inward and outward alike,
 *  so it is what "smooth" means here. Clamped per corner to what the adjacent
 *  edges can carry, which is what keeps the dips gentle.
 *
 *  It also sets how close the cut runs to the drawing, which is not obvious:
 *  a fillet cuts its corner back, the paint's clip has to sit outside the
 *  deepest of those cut-backs so no ink is lost, and that offset then applies
 *  to the whole contour. So a fatter fillet is paid for in paper everywhere.
 *  150 put the median paper at 63px; 105 puts it at 54px and still leaves the
 *  tightest turn near 100px once the blade line is offset. Below about 90 the
 *  return dries up and the corners start to read hard. */
const FILLET = num('FILLET', 105);
/** How far the polygon may stray from the raw hull. The hull of a drawing this
 *  size comes out with 40-odd nearly collinear vertices; this is what turns
 *  them into a handful of real edges. */
const SIMPLIFY = num('SIMPLIFY', 9);
/** Border width: how far the blade runs outside the paint. A contour cut holds
 *  about 2-3% of the artwork. */
const CUT = num('CUT', 24);
/** Paper, the sticker's own material: --color-paper from global.css. */
const PAPER = [201, 207, 221];

/* ---- pixel stage: the shape ------------------------------------------- */

/**
 * Exact Euclidean distance from every pixel to the nearest set pixel, by
 * Felzenszwalb and Huttenlocher's lower-envelope method: one pass down the
 * columns, one along the rows. Linear, and exact.
 */
function distanceTo(mask, W, H, want) {
  const INF = 1e20;
  const d = new Float64Array(W * H);
  for (let i = 0; i < d.length; i++) d[i] = mask[i] === want ? 0 : INF;

  const n = Math.max(W, H);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  const g = new Float64Array(n);
  const out = new Float64Array(n);

  const pass = (len, get, set) => {
    for (let i = 0; i < len; i++) g[i] = get(i);
    let k = 0;
    v[0] = 0;
    z[0] = -INF;
    z[1] = INF;
    for (let q = 1; q < len; q++) {
      let s;
      for (;;) {
        const p = v[k];
        s = (g[q] + q * q - (g[p] + p * p)) / (2 * q - 2 * p);
        if (s <= z[k]) k--;
        else break;
      }
      k++;
      v[k] = q;
      z[k] = s;
      z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < len; q++) {
      while (z[k + 1] < q) k++;
      const p = v[k];
      out[q] = (q - p) * (q - p) + g[p];
    }
    for (let i = 0; i < len; i++) set(i, out[i]);
  };

  for (let x = 0; x < W; x++) pass(H, (y) => d[y * W + x], (y, val) => { d[y * W + x] = val; });
  for (let y = 0; y < H; y++) pass(W, (x) => d[y * W + x], (x, val) => { d[y * W + x] = val; });
  for (let i = 0; i < d.length; i++) d[i] = Math.sqrt(d[i]);
  return d;
}

/** Monotone chain hull of the points. */
function hullOf(pts) {
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list) => {
    const h = [];
    for (const p of list) {
      while (h.length >= 2 && cross(h[h.length - 2], h[h.length - 1], p) <= 0) h.pop();
      h.push(p);
    }
    return h;
  };
  return half(pts).slice(0, -1).concat(half(pts.slice().reverse()).slice(0, -1));
}

/** Signed area, for reading a ring's winding. */
function ringArea(p) {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const q = p[(i + 1) % p.length];
    a += p[i][0] * q[1] - q[0] * p[i][1];
  }
  return a / 2;
}

/** Douglas-Peucker on a closed ring: split at the two farthest-apart points,
 *  simplify each chain, rejoin. */
function simplifyRing(pts, tol) {
  const dist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
  let i0 = 0, i1 = 0, far = -1;
  for (let i = 1; i < pts.length; i++) {
    const d = dist2(pts[0], pts[i]);
    if (d > far) { far = d; i1 = i; }
  }
  far = -1;
  for (let i = 0; i < pts.length; i++) {
    const d = dist2(pts[i1], pts[i]);
    if (d > far) { far = d; i0 = i; }
  }
  const lo = Math.min(i0, i1), hi = Math.max(i0, i1);
  const dp = (chain) => {
    if (chain.length < 3) return chain.slice();
    const a = chain[0], b = chain[chain.length - 1];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    let worst = -1, wi = -1;
    for (let i = 1; i < chain.length - 1; i++) {
      const p = chain[i];
      const d = Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / len;
      if (d > worst) { worst = d; wi = i; }
    }
    if (worst <= tol) return [a, b];
    return dp(chain.slice(0, wi + 1)).slice(0, -1).concat(dp(chain.slice(wi)));
  };
  const first = dp(pts.slice(lo, hi + 1));
  const second = dp(pts.slice(hi).concat(pts.slice(0, lo + 1)));
  return first.slice(0, -1).concat(second.slice(0, -1));
}

/* ---- path stage: the quality ------------------------------------------ */

const TAU = Math.PI * 2;
const wrapAngle = (a) => ((a % TAU) + TAU) % TAU;

/**
 * Fillets every corner of the polygon to radius r, clamped per corner to half
 * of each adjacent edge so neighbouring fillets cannot overlap. Returns the
 * path as segments and arcs.
 *
 * One construction serves convex and concave corners alike: the arc is tangent
 * to both edges with its centre on the bisector, r/sin(half-angle) from the
 * corner. At a corner that turns outward this takes material off; at one that
 * turns inward it puts material back and fills the notch. Which is what each
 * of them needs.
 */
function filletPolygon(poly, r) {
  const n = poly.length;
  const corners = [];
  for (let i = 0; i < n; i++) {
    const V = poly[i], A = poly[(i - 1 + n) % n], B = poly[(i + 1) % n];
    const la = Math.hypot(A[0] - V[0], A[1] - V[1]);
    const lb = Math.hypot(B[0] - V[0], B[1] - V[1]);
    if (la < 1e-6 || lb < 1e-6) { corners.push(null); continue; }
    const u = [(A[0] - V[0]) / la, (A[1] - V[1]) / la];
    const w = [(B[0] - V[0]) / lb, (B[1] - V[1]) / lb];
    const cosT = Math.max(-1, Math.min(1, u[0] * w[0] + u[1] * w[1]));
    const half = Math.acos(cosT) / 2;
    if (half < 1e-4) { corners.push(null); continue; }
    const t = Math.min(r / Math.tan(half), la / 2, lb / 2);
    const rEff = t * Math.tan(half);
    if (rEff < 0.5) { corners.push(null); continue; }
    const bis = [u[0] + w[0], u[1] + w[1]];
    const bl = Math.hypot(bis[0], bis[1]);
    if (bl < 1e-6) { corners.push(null); continue; }
    const off = rEff / Math.sin(half);
    const Cc = [V[0] + (bis[0] / bl) * off, V[1] + (bis[1] / bl) * off];
    const P1 = [V[0] + u[0] * t, V[1] + u[1] * t];
    const P2 = [V[0] + w[0] * t, V[1] + w[1] * t];
    const a0 = Math.atan2(P1[1] - Cc[1], P1[0] - Cc[0]);
    const a1 = Math.atan2(P2[1] - Cc[1], P2[0] - Cc[0]);
    // A fillet arc is always less than half a turn, so the short way is right.
    let sweep = a1 - a0;
    while (sweep > Math.PI) sweep -= TAU;
    while (sweep < -Math.PI) sweep += TAU;
    corners.push({ C: Cc, r: rEff, a0, sweep, P1, P2 });
  }

  const els = [];
  for (let i = 0; i < n; i++) {
    const c = corners[i];
    const cn = corners[(i + 1) % n];
    const from = c ? c.P2 : poly[i];
    const to = cn ? cn.P1 : poly[(i + 1) % n];
    if (c) els.push({ kind: 'arc', C: c.C, r: c.r, a0: c.a0, sweep: c.sweep });
    if (Math.hypot(to[0] - from[0], to[1] - from[1]) > 1e-6) els.push({ kind: 'seg', a: from, b: to });
  }
  return els;
}

/** The path as a dense point ring, for the inside test. */
function densify(els, step = 1) {
  const pts = [];
  for (const e of els) {
    if (e.kind === 'seg') {
      const len = Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]);
      const k = Math.max(1, Math.ceil(len / step));
      for (let i = 0; i < k; i++) {
        pts.push([e.a[0] + ((e.b[0] - e.a[0]) * i) / k, e.a[1] + ((e.b[1] - e.a[1]) * i) / k]);
      }
    } else {
      const k = Math.max(1, Math.ceil((Math.abs(e.sweep) * e.r) / step));
      for (let i = 0; i < k; i++) {
        const a = e.a0 + (e.sweep * i) / k;
        pts.push([e.C[0] + e.r * Math.cos(a), e.C[1] + e.r * Math.sin(a)]);
      }
    }
  }
  return pts;
}

/** Even-odd scanline fill of a point ring. Used only for the SIGN of the
 *  distance: both rendered thresholds sit well outside the path, so this
 *  fill's own one-pixel edge never reaches the printed contour. */
function fillRing(pts, W, H) {
  const inside = new Uint8Array(W * H);
  const xs = [];
  for (let y = 0; y < H; y++) {
    xs.length = 0;
    const py = y + 0.5;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      if ((a[1] <= py && b[1] > py) || (b[1] <= py && a[1] > py)) {
        xs.push(a[0] + ((py - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
      }
    }
    if (xs.length < 2) continue;
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const x0 = Math.max(0, Math.ceil(xs[k] - 0.5));
      const x1 = Math.min(W - 1, Math.floor(xs[k + 1] - 0.5));
      for (let x = x0; x <= x1; x++) inside[y * W + x] = 1;
    }
  }
  return inside;
}

/** Exact unsigned distance from a point to the path. */
function distToPath(els, px, py) {
  let best = Infinity;
  for (let k = 0; k < els.length; k++) {
    const e = els[k];
    let d;
    if (e.kind === 'seg') {
      const vx = e.b[0] - e.a[0], vy = e.b[1] - e.a[1];
      const wx = px - e.a[0], wy = py - e.a[1];
      const L2 = vx * vx + vy * vy;
      let t = L2 > 0 ? (wx * vx + wy * vy) / L2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      d = Math.hypot(wx - vx * t, wy - vy * t);
    } else {
      const dx = px - e.C[0], dy = py - e.C[1];
      const rho = Math.hypot(dx, dy);
      const t = wrapAngle(Math.atan2(dy, dx) - e.a0);
      const on = e.sweep >= 0 ? t <= e.sweep : t >= TAU + e.sweep;
      if (on) d = Math.abs(rho - e.r);
      else {
        const q1x = e.C[0] + e.r * Math.cos(e.a0), q1y = e.C[1] + e.r * Math.sin(e.a0);
        const a2 = e.a0 + e.sweep;
        const q2x = e.C[0] + e.r * Math.cos(a2), q2y = e.C[1] + e.r * Math.sin(a2);
        d = Math.min(Math.hypot(px - q1x, py - q1y), Math.hypot(px - q2x, py - q2y));
      }
    }
    if (d < best) best = d;
  }
  return best;
}

/* ---- run -------------------------------------------------------------- */

const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: AW, height: AH, channels: C } = info;

const PAD = FILLET + CUT + 140;
const W = AW + PAD * 2;
const H = AH + PAD * 2;

const ink = new Uint8Array(W * H);
for (let y = 0; y < AH; y++) {
  for (let x = 0; x < AW; x++) {
    if (data[(y * AW + x) * C + 3] >= INK) ink[(y + PAD) * W + (x + PAD)] = 1;
  }
}

// The hull of the paint's extreme points, per column and per row.
const extremes = [];
for (let x = 0; x < AW; x++) {
  let lo = -1, hi = -1;
  for (let y = 0; y < AH; y++) if (data[(y * AW + x) * C + 3] >= INK) { if (lo < 0) lo = y; hi = y; }
  if (lo >= 0) extremes.push([x + PAD, lo + PAD], [x + PAD, hi + PAD]);
}
for (let y = 0; y < AH; y++) {
  let lo = -1, hi = -1;
  for (let x = 0; x < AW; x++) if (data[(y * AW + x) * C + 3] >= INK) { if (lo < 0) lo = x; hi = x; }
  if (lo >= 0) extremes.push([lo + PAD, y + PAD], [hi + PAD, y + PAD]);
}
let poly = simplifyRing(hullOf(extremes), SIMPLIFY);

// Press the dips in. The clearance at a point on a hull edge is just its
// distance to the nearest paint, so the deepest point of each edge is one
// distance-field lookup per sample, and ranking the edges by it finds the
// hollows the hull bridged over without being told where to look.
const clear = distanceTo(ink, W, H, 1);
const clearAt = (x, y) => {
  const xi = Math.round(x), yi = Math.round(y);
  return xi >= 0 && yi >= 0 && xi < W && yi < H ? clear[yi * W + xi] : 0;
};
const inward = ringArea(poly) > 0 ? 1 : -1;
const candidates = [];
for (let i = 0; i < poly.length; i++) {
  const a = poly[i], b = poly[(i + 1) % poly.length];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (len < 40) continue;
  // Inward normal of this edge, from the ring's own winding.
  const nx = ((b[1] - a[1]) / len) * -inward;
  const ny = ((b[0] - a[0]) / len) * inward;
  let best = -1, bt = 0;
  for (let t = 0.15; t <= 0.85; t += 0.02) {
    const c = clearAt(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t);
    if (c > best) { best = c; bt = t; }
  }
  candidates.push({ i, t: bt, clearance: best, nx, ny, at: [a[0] + (b[0] - a[0]) * bt, a[1] + (b[1] - a[1]) * bt] });
}
candidates.sort((p, q) => q.clearance - p.clearance);
const chosen = [];
for (const c of candidates) {
  if (chosen.length >= DIPS) break;
  if (c.clearance < DIP_MIN) break;
  // Keep them apart, so two dips cannot land on one hollow.
  if (chosen.some((k) => Math.hypot(k.at[0] - c.at[0], k.at[1] - c.at[1]) < 200)) continue;
  chosen.push(c);
}
const dipped = [];
for (let i = 0; i < poly.length; i++) {
  dipped.push(poly[i]);
  const c = chosen.find((k) => k.i === i);
  if (!c) continue;
  const depth = Math.min(c.clearance - DIP_CLEAR, DIP_MAX);
  if (depth > 8) dipped.push([c.at[0] + c.nx * depth, c.at[1] + c.ny * depth]);
}
poly = dipped;

const els = filletPolygon(poly, FILLET);
const inside = fillRing(densify(els), W, H);

// The exact signed distance to the path, which is the only geometry the
// rendered edges come from. Exact only in the band the contour prints in,
// though: outside it every threshold saturates to nothing or to everything, so
// there the rasterised fill's own cheap distance stands in. That band is a few
// percent of the grid and it takes the run from most of a minute to seconds.
const rough = (() => {
  const dOut = distanceTo(inside, W, H, 1);
  const dIn = distanceTo(inside, W, H, 0);
  const r = new Float64Array(W * H);
  for (let i = 0; i < r.length; i++) r[i] = inside[i] ? -dIn[i] : dOut[i];
  return r;
})();
const BAND_LO = -14;
const BAND_HI = CUT + 110;
const sd = new Float64Array(W * H);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = y * W + x;
    sd[i] = rough[i] > BAND_LO && rough[i] < BAND_HI
      ? (inside[i] ? -1 : 1) * distToPath(els, x + 0.5, y + 0.5)
      : rough[i];
  }
}

// Hold the paint's clip far enough out that no corner's arc can cut into the
// drawing. Measured rather than assumed: it depends entirely on how sharp this
// drawing's sharpest corner turns out to be.
let INSET = 0;
for (let step = 0; step < 60; step++) {
  let lost = 0;
  for (let y = 0; y < AH && !lost; y++) {
    for (let x = 0; x < AW; x++) {
      if (data[(y * AW + x) * C + 3] >= INK && sd[(y + PAD) * W + (x + PAD)] > INSET) { lost++; break; }
    }
  }
  if (!lost) break;
  INSET += 2;
}

const cov = (i, t) => Math.min(1, Math.max(0, 0.5 + (t - sd[i])));

let bl = W, br = -1, bt = H, bb = -1;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    if (cov(y * W + x, INSET + CUT) > 0) {
      if (x < bl) bl = x;
      if (x > br) br = x;
      if (y < bt) bt = y;
      if (y > bb) bb = y;
    }
  }
}
bl -= 1; bt -= 1; br += 1; bb += 1;
const CW = br - bl + 1;
const CH = bb - bt + 1;

const out = Buffer.alloc(CW * CH * 4);
for (let y = 0; y < CH; y++) {
  for (let x = 0; x < CW; x++) {
    const i = (y + bt) * W + (x + bl);
    const vinyl = cov(i, INSET + CUT);
    if (vinyl <= 0) continue;

    const ax = x + bl - PAD;
    const ay = y + bt - PAD;
    let pr = 0, pg = 0, pb = 0, pa = 0;
    if (ax >= 0 && ay >= 0 && ax < AW && ay < AH) {
      const s = (ay * AW + ax) * C;
      pa = (data[s + 3] / 255) * cov(i, INSET);
      pr = data[s]; pg = data[s + 1]; pb = data[s + 2];
    }

    const o = (y * CW + x) * 4;
    out[o] = Math.round(pr * pa + PAPER[0] * (1 - pa));
    out[o + 1] = Math.round(pg * pa + PAPER[1] * (1 - pa));
    out[o + 2] = Math.round(pb * pa + PAPER[2] * (1 - pa));
    out[o + 3] = Math.round(vinyl * 255);
  }
}

const raw = sharp(out, { raw: { width: CW, height: CH, channels: 4 } });
// alphaQuality 100 keeps the alpha channel lossless, which is where the cut
// lives. Measured, it does not move the edge (the geometry was already exact
// and the encoder was tracking it fine), but it guarantees nothing gets
// quantised out from under the path later, and it costs no bytes. Colour stays
// lossy, where it costs plenty.
//
// Ask for a .png out and you get one, uncompressed: that is the way to tell
// whether an edge you do not like came from this script or from the encoder.
const buf = await (DST.endsWith('.png') ? raw.png() : raw.webp({ quality: 92, alphaQuality: 100, effort: 6 })).toBuffer();
await sharp(buf).toFile(DST);

const arcs = els.filter((e) => e.kind === 'arc').map((e) => e.r);
// How close the blade runs to the paint, sampled along the whole cut. The
// median is the honest measure of whether this traces the drawing or bridges
// over it; the widest is wherever it decided to bridge.
const inkDist = distanceTo(ink, W, H, 1);
const gaps = [];
for (const e of els) {
  const n = e.kind === 'seg'
    ? Math.max(2, Math.ceil(Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]) / 6))
    : Math.max(2, Math.ceil((Math.abs(e.sweep) * e.r) / 6));
  for (let i = 0; i < n; i++) {
    let qx, qy, ox, oy;
    if (e.kind === 'seg') {
      const t = i / n;
      qx = e.a[0] + (e.b[0] - e.a[0]) * t;
      qy = e.a[1] + (e.b[1] - e.a[1]) * t;
      const L = Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]) || 1;
      ox = (e.b[1] - e.a[1]) / L;
      oy = -(e.b[0] - e.a[0]) / L;
    } else {
      const a = e.a0 + (e.sweep * i) / n;
      qx = e.C[0] + e.r * Math.cos(a);
      qy = e.C[1] + e.r * Math.sin(a);
      ox = Math.cos(a);
      oy = Math.sin(a);
    }
    // Step to the blade line, whichever way that is from here.
    for (const sgn of [1, -1]) {
      const bx = Math.round(qx + ox * sgn * (INSET + CUT));
      const by = Math.round(qy + oy * sgn * (INSET + CUT));
      if (bx < 0 || by < 0 || bx >= W || by >= H) continue;
      if (sd[by * W + bx] > INSET + CUT - 1.5 && sd[by * W + bx] < INSET + CUT + 1.5) {
        gaps.push(inkDist[by * W + bx]);
      }
    }
  }
}
gaps.sort((a, b) => a - b);
const q = (f) => Math.round(gaps[Math.floor((gaps.length - 1) * f)]);
const artFrac = AW / CW;
console.log(
  `${path.basename(DST)}  ${CW}x${CH}  ${(buf.length / 1024).toFixed(1)} KB\n` +
  `  ink>=${INK}, simplify ${SIMPLIFY}, fillet ${FILLET}, cut ${CUT}, inset ${INSET}\n` +
  `  corner arcs ${arcs.length ? Math.round(Math.min(...arcs)) + '-' + Math.round(Math.max(...arcs)) : 0}px` +
  ` (asked for ${FILLET}; short edges clamp it)
` +
  `  hull ${poly.length - chosen.length} edges + ${chosen.length} dips` +
  ` (clearance ${chosen.map((c) => Math.round(c.clearance)).join(', ') || 'none'})` +
  ` -> ${els.length} path elements\n` +
  `  blade runs ${CUT}px outside the paint's clip, which sits ${INSET}px off` +
  ` the polygon\n` +
  `  paper from the ink, along the whole cut: ${q(0)}px thinnest,` +
  ` ${q(0.5)}px median, ${q(0.9)}px at the 90th, ${q(1)}px widest` +
  ` (of ${AW}px artwork)\n` +
  `  artwork is ${(artFrac * 100).toFixed(1)}% of the file width` +
  ` -> O-matched size is min(${((0.8194 / artFrac) * 30).toFixed(1)}vw, ${((0.8194 / artFrac) * 28).toFixed(1)}rem, ...)`
);
