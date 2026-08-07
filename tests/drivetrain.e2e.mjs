// E2E regression for /drivetrain. Ports the original tool's qa.py checks to
// the site build and covers every v2 feature (thermal fuse, braking, recipes,
// windows, pins/share, CSV overlay, tip check, strafe, the full-field Simulate
// section and its custom path editor, chart sizing, hostile share-payload
// hardening).
//
// Run:  npm run build
//       mkdir -p /tmp/dt-serve && ln -sfn "$PWD/dist" /tmp/dt-serve/GNCE-Onyx
//       (cd /tmp/dt-serve && python3 -m http.server 4173 &)
//       node tests/drivetrain.e2e.mjs
// The symlink matters: the site deploys under /GNCE-Onyx (GitHub Pages
// project site, see astro.config.mjs), and every built URL carries that base.
// Needs playwright (or playwright-core + CHROMIUM_PATH=/path/to/chromium).
import { chromium } from 'playwright-core';

const BASE = process.env.BASE_URL || 'http://localhost:4173/GNCE-Onyx';
const OUT = process.env.SHOT_DIR || '.';
const fails = [];
const check = (name, ok, detail = '') => {
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (detail ? `   (${detail})` : ''));
  if (!ok) fails.push(name);
};
const near = (got, want, tol = 0.03) => Math.abs(got - want) <= Math.max(tol * Math.abs(want), 0.02);
// Cartridges carry the ratio back-solved from their own published rpm, so the
// stock Yellow Jacket rung is 6000/435 quantised to four places, not "13.7".
const STOCK_GB = '13.7931';

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1366, height: 950 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

await page.goto(BASE + '/drivetrain/', { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1100);

// Stat cards are grouped (launch / top end / stopping / margins) and the
// objective leads, so every value is read by its key, never by DOM order.
const statByKey = async (frag) => page.evaluate((f) => {
  const el = [...document.querySelectorAll('#stats .dt-stat')].find((s) => s.querySelector('.k').textContent.toLowerCase().includes(f));
  return el ? { v: parseFloat(el.querySelector('.v').textContent), u: el.querySelector('.u').textContent, warn: el.classList.contains('is-warn') } : null;
}, frag);
const openTune = (id) => page.evaluate((i) => { document.querySelector('#' + i).open = true; }, id);
// The page persists its own snapshot on every recompute, so that IS config():
// every field, both toggles, the objective, the basis and the stage list.
const cfgSnap = () => page.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('dt-cfg') || '{}');
  delete d.pins;
  return d;
});
const cfgDiff = (a, b) => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const out = [];
  for (const k of keys) {
    if (k === 'fields') {
      const fk = new Set([...Object.keys(a.fields || {}), ...Object.keys(b.fields || {})]);
      for (const f of fk) if ((a.fields || {})[f] !== (b.fields || {})[f]) out.push(f);
    } else if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) out.push(k);
  }
  return out;
};
// The fresh-visit config, captured before anything on this page is touched.
// Reset has to reproduce it exactly, later, without a reload.
const FRESH = await cfgSnap();
check('a fresh visit persists a full config snapshot',
  !!FRESH.fields && Object.keys(FRESH.fields).length >= 25 && FRESH.mode === 'path',
  JSON.stringify({ n: Object.keys(FRESH.fields || {}).length, mode: FRESH.mode }));

// 0. every explanation on the page ships folded away, so a fresh load is
// controls and numbers, not prose.
const FOLD_IDS = ['cgTune', 'gripWhy', 'packWhy', 'batteryTune', 'motorTune', 'gearTune', 'wheelTune'];
const openFolds = await page.evaluate((ids) => ids.filter((i) => {
  const el = document.querySelector('#' + i);
  return !el || el.open;
}), FOLD_IDS);
check('setup explanation folds ship closed', openFolds.length === 0, openFolds.join(','));
check('the long-form sections ship folded too', await page.evaluate(() =>
  [...document.querySelectorAll('.dt-results details.dt-fold, .dt-method details.dt-fold')].every((d) => !d.open)));
check('the method section folds its prose', await page.evaluate(() => !!document.querySelector('.dt-method details.dt-fold')));
check('the assumptions paragraph is inside a fold', await page.evaluate(() =>
  !!document.querySelector('.dt-assumptions')?.closest('details.dt-fold')));

// 0b. the objective ships on the simulator path, and the sprint controls are
// out of the way until somebody asks for a straight-line check.
check('the run bar defaults to the simulator path', await page.evaluate(() =>
  document.querySelector('#modePath').classList.contains('is-active')
  && !document.querySelector('#modeSprint').classList.contains('is-active')));
check('cycle-legs mode is retired', await page.evaluate(() => !document.querySelector('#modeCycle') && !document.querySelector('#legs')));
check('path mode hides the sprint slider, the stop toggle and strafe', await page.evaluate(() => {
  const h = (i) => document.querySelector('#' + i).hidden;
  return h('sprintFields') && h('stopWrap') && h('strafeWrap') && !h('pathFields');
}));

// 1. v1 legacy anchors: v1 battery + hard cap + fly-through reproduce qa.py.
// Gearing is the exact 13.7931 cartridge now (6000/435), so every figure that
// scales with reduction has moved by that 0.68%, and only by that.
await page.click('#modeSprint');
await page.waitForTimeout(500);
await page.fill('#voc', '13.0');
await page.fill('#rint', '0.20');
await page.click('#fuseHard');
await page.uncheck('#stopEnd');
await page.waitForTimeout(900);
for (const [id, want] of [['roG', '13.79 : 1'], ['roRPM', '435 rpm'], ['roTau', '18.8 kg·cm'], ['roEta', '93%']]) {
  const got = await page.textContent('#' + id);
  check(`legacy #${id} == ${want}`, got === want, got);
}
const LEGACY = [
  ['top speed', 3.59], ['free speed', 3.59], ['launch accel', 9.5], ['90%', 0.72],
  ['accel tax', 0.38], ['sprint time', 1.14], ['launch draw', 20.0], ['push force', 82],
];
for (const [key, want] of LEGACY) {
  const card = await statByKey(key);
  check(`legacy ${key} ≈ ${want}`, !!card && near(card.v, want), card ? `got ${card.v}` : 'no card');
}
const launchCard = await statByKey('launch accel');
check('legacy launch fuse-limited', launchCard.u.includes('fuse-limited'), launchCard.u);

// 2. new defaults: fresh pack 13.5 V, loop 0.14 ohm, thermal + stop
await page.fill('#voc', '13.5');
await page.fill('#rint', '0.14');
await page.click('#fuseBurst');
await page.check('#stopEnd');
await page.waitForTimeout(900);
const lc2 = await statByKey('launch accel');
check('thermal launch ≈ 10.5 t/s²', near(lc2.v, 10.5, 0.04), `got ${lc2.v}`);
check('thermal launch grip-limited', lc2.u.includes('grip-limited'), lc2.u);
const stopSprint = await statByKey('sprint time');
check('stop sprint ≈ 1.31 s', near(stopSprint.v, 1.31, 0.05), `got ${stopSprint.v}`);
const draw = await statByKey('launch draw');
check('thermal draw > 20 A', draw.v > 20.5, `got ${draw.v}`);
// Braking only earns a group when a leg ends at one.
const stopCard = await statByKey('stopping distance');
check('stopping group appears when the leg ends at a stop', !!stopCard && stopCard.v > 0, JSON.stringify(stopCard));

// board: buildable recipe + honest window
const readBoard = () => page.evaluate(() => ({
  k: document.querySelector('#boardK').textContent,
  n: document.querySelector('#boardN').textContent.trim(),
  recipe: document.querySelector('#boardRecipe').textContent,
  band: document.querySelector('#boardBand').textContent,
  basis: document.querySelector('#boardBasis').textContent,
  s: document.querySelector('#boardS').textContent,
  ideal: document.querySelector('#boardIdeal').textContent,
  alt: document.querySelector('#boardAlt').textContent,
  altHidden: document.querySelector('#boardAlt').hidden,
}));
const board = await readBoard();
check('board rpm is numeric', /^\d{3}$/.test(board.n), board.n);
check('board recipe names a part', /cartridge|UP|direct/.test(board.recipe), board.recipe.slice(0, 60));
// The default headline, pinned exactly. It keeps the fitted 13.7:1 cartridge
// (6000/435 = 13.7931) and reaches the window through one external stage:
// 30 driving 24 is 13.7931 x 24/30 = 11.03:1, so 6000/11.03 = 544 rpm. A drift
// here means the recipe pool, the pinion ceiling or the composite moved.
check('the default headline keeps the fitted cartridge and gears externally',
  board.recipe.trim() === '13.7:1 cartridge + gears 30:24 → 11.03:1', board.recipe.trim());
check('the default headline pins at 544 rpm', board.n === '544', board.n);
check('board band has an rpm window', /\d+–\d+ rpm/.test(board.band), board.band.slice(0, 60));
check('board status names your own rpm', /you run 435 rpm/.test(board.s), board.s.slice(0, 80));
check('spec/dyno swap line visible', !board.altHidden && /dyno|vendor/.test(board.alt), board.alt.slice(0, 60));

// 2b. the board is a verdict, not an essay: four short lines, the buildable
// answer on top and the un-orderable ideal underneath it.
check('the ideal sits BELOW the buildable answer as a small line',
  /^ideal \d+ rpm · window \d+–\d+ rpm$/.test(board.ideal.trim()), board.ideal.trim());
// The buildable answer is the headline and the ideal is under it, in that
// order, so nobody reads the un-orderable number as the instruction.
check('the ideal renders after the buildable rpm and its recipe', await page.evaluate(() => {
  const order = [...document.querySelectorAll('#board > p')].map((p) => p.id);
  return order.indexOf('boardIdeal') > order.indexOf('boardRecipe')
    && order.indexOf('boardRecipe') > order.indexOf('boardN');
}), await page.evaluate(() => [...document.querySelectorAll('#board > p')].map((p) => p.id).join(',')));
check('the recipe line drops the runner-up', !/runner-up/i.test(board.recipe), board.recipe);
const boardLines = await page.evaluate(() =>
  ['boardK', 'boardRecipe', 'boardS', 'boardIdeal', 'boardAlt'].map((i) => document.querySelector('#' + i).textContent.trim()));
const words = (t) => t.replace(/[·→]/g, ' ').split(/\s+/).filter(Boolean).length;
const longLine = boardLines.find((t) => words(t) > 8);
check('no line on the board proper runs past eight words', !longLine, longLine || '');
check('the workings fold onto the board and ship closed', await page.evaluate(() => {
  const d = document.querySelector('#boardWhy');
  return !!d && !d.open && /how this is scored/i.test(d.querySelector('summary').textContent);
}));
check('the fold carries the scoring basis and both drain states',
  /overall movement/.test(board.basis) && /13\.5 V/.test(board.basis) && /12\.5 V/.test(board.basis), board.basis.slice(0, 120));
check('the fold carries the runner-up and the best-time spread',
  /Runner-up:/.test(board.basis) && /Best-time spread/.test(board.band), board.basis.slice(-60));

// The sweep chart's DISPLAY window narrows to the decision region, but the
// window MATH is untouched. These are re-pinned onto the overall-movement
// basis (mean stop-to-stop time over 1/2/3/4/6 tiles, at 13.5 V and a
// match-drained 12.5 V), so a drift here means sensitivity() moved.
check('honest window math pinned (463–688 rpm)', /Honest window: 463–688 rpm/.test(board.band), board.band.slice(0, 40));
check('continuous best pinned (538 rpm)', /Continuous best: 538 rpm/.test(board.band), board.band.slice(-30));
// The DISPLAY window is anchored on the marks the reader compares: your
// gearing, the continuous best, and every buildable tick drawn, padded 10 to
// 15 percent of that span a side, never letting a mark near the frame.
const WIN_FLOOR = 100; // rpm the page opens a tight frame out to
const win = await page.evaluate(() => {
  const cv = document.querySelector('#cSweep');
  return {
    lo: parseFloat(cv.dataset.xlo),
    hi: parseFloat(cv.dataset.xhi),
    marks: (cv.dataset.marks || '').split(' ').map(Number).filter((v) => isFinite(v)),
  };
});
const wSpan = win.hi - win.lo;
const mLo = Math.min(...win.marks), mHi = Math.max(...win.marks), mSpan = mHi - mLo;
const shownWin = `win ${win.lo.toFixed(1)}..${win.hi.toFixed(1)} marks ${win.marks.join(',')}`;
check('sweep window carries its mark set', win.marks.length >= 3 && mSpan > 0, shownWin);
check('every mark sits inside the sweep window', win.marks.every((v) => v >= win.lo && v <= win.hi), shownWin);
check('no mark sits within 4% of a window edge',
  win.marks.every((v) => (v - win.lo) / wSpan >= 0.04 && (win.hi - v) / wSpan >= 0.04), shownWin);
const padLo = (mLo - win.lo) / mSpan, padHi = (win.hi - mHi) / mSpan;
check('window pads the mark span 10-15% a side',
  padLo >= 0.099 && padLo <= 0.151 && padHi >= 0.099 && padHi <= 0.151,
  `pad ${padLo.toFixed(3)} / ${padHi.toFixed(3)} over span ${mSpan}`);
check('window never narrower than the readable floor', wSpan >= WIN_FLOOR - 1, `span ${wSpan.toFixed(1)}`);
// Everything the reader is asked to compare has to be inside the frame.
const inFrame = await page.evaluate(() => {
  const cv = document.querySelector('#cSweep');
  const lo = parseFloat(cv.dataset.xlo), hi = parseFloat(cv.dataset.xhi);
  const sr = document.querySelector('#srSweep').textContent;
  const pick = (re) => { const m = sr.match(re); return m ? parseFloat(m[1]) : NaN; };
  const you = pick(/configuration (\d+) rpm/), best = pick(/continuous best (\d+) rpm/), rec = pick(/best buildable (\d+) rpm/);
  const ok = (v) => !isFinite(v) || (v >= lo && v <= hi);
  return { lo, hi, you, best, rec, ok: ok(you) && ok(best) && ok(rec) };
});
check('markers and recipe ticks sit inside the window', inFrame.ok, JSON.stringify(inFrame));

// τc renders with the glyph, not "TC"
const tauLabel = await page.evaluate(() => [...document.querySelectorAll('#stats .dt-stat .k')].map((k) => k.textContent).find((t) => t.includes('τ')));
check('τc label keeps the Greek', !!tauLabel && tauLabel.includes('τc'), tauLabel);

// Explanations fold away: the reading note is closed until someone asks.
const note = await page.evaluate(() => {
  const d = document.querySelector('#statsNote');
  return { has: !!d, open: !!d && d.open, txt: d ? d.textContent : '' };
});
check('stats-note fold exists and starts closed',
  note.has && !note.open && /tenth of a second/.test(note.txt), JSON.stringify({ has: note.has, open: note.open }));
await page.click('#statsNote summary');
await page.waitForTimeout(280);
check('stats-note fold opens', await page.evaluate(() => document.querySelector('#statsNote').open));
await page.click('#statsNote summary');
await page.waitForTimeout(150);
check('sweep sr-summary present', /best buildable \d+ rpm/.test(await page.textContent('#srSweep')), (await page.textContent('#srSweep')).slice(0, 70));

// no em dash anywhere in rendered text (site rule; en dashes are ranges)
const emDash = await page.evaluate(() => (document.body.innerText.match(/—/g) || []).length);
check('zero em dashes in rendered text', emDash === 0, `found ${emDash}`);

// 3. chart sizing stays stable across option toggles (shrink regression)
const dims0 = await page.evaluate(() => ({ w: document.querySelector('#cSweep').clientWidth, h: document.querySelector('#cSweep').clientHeight }));
check('sweep chart is big at 1366px', dims0.w > 700 && dims0.h >= 300, JSON.stringify(dims0));
for (let i = 0; i < 3; i++) {
  await page.click('#fuseHard'); await page.waitForTimeout(220);
  await page.click('#fuseBurst'); await page.waitForTimeout(220);
}
await openTune('batteryTune');
await page.click('#modePath'); await page.waitForTimeout(400);
await page.click('#modeSprint'); await page.waitForTimeout(400);
const dims1 = await page.evaluate(() => ({ w: document.querySelector('#cSweep').clientWidth, h: document.querySelector('#cSweep').clientHeight }));
check('chart size unchanged after toggles', Math.abs(dims1.w - dims0.w) <= 2 && Math.abs(dims1.h - dims0.h) <= 2, `${JSON.stringify(dims0)} → ${JSON.stringify(dims1)}`);

// 3b. the three-up row (profile / force / current) is three uniform blocks:
// same column width, the same fixed chart height, and headers deep enough that
// every canvas starts on one rule even when a caption runs to two lines.
const threeUp = await page.evaluate(() => [...document.querySelectorAll('.dt-two > figure')].map((f) => {
  const b = f.querySelector('.dt-chartbox');
  return {
    w: b.clientWidth,
    h: b.clientHeight,
    top: Math.round(b.getBoundingClientRect().top - f.getBoundingClientRect().top),
    card: Math.round(f.getBoundingClientRect().height),
  };
}));
check('the chart row holds three blocks', threeUp.length === 3, JSON.stringify(threeUp));
check('the three chart boxes are equal width at 1366', new Set(threeUp.map((d) => d.w)).size === 1, JSON.stringify(threeUp.map((d) => d.w)));
check('the three chart boxes are equal height at 1366', new Set(threeUp.map((d) => d.h)).size === 1, JSON.stringify(threeUp.map((d) => d.h)));
check('the three headers put every canvas on the same rule', new Set(threeUp.map((d) => d.top)).size === 1, JSON.stringify(threeUp.map((d) => d.top)));
check('the three cards end level', Math.max(...threeUp.map((d) => d.card)) - Math.min(...threeUp.map((d) => d.card)) <= 1, JSON.stringify(threeUp.map((d) => d.card)));

// 4. the run animator strip is gone: the Simulate section (14b) owns playback now.

// 5. path mode: the headline is the ACTUAL chain the Simulate section is
// driving, and a cycle is that chain plus whatever the robot does standing
// still. Nothing here is a straight-line proxy.
await page.click('#modePath');
await page.waitForTimeout(1100);
const chainCard = await statByKey('chain time');
const pvTotal = parseFloat(await page.textContent('#pvTotal'));
check('path mode leads with the chain time', !!chainCard && Math.abs(chainCard.v - pvTotal) < 0.02, `${chainCard ? chainCard.v : 'no card'} vs pvTotal ${pvTotal}`);
check('path mode labels the time honestly', /this chain/.test(chainCard.u), chainCard.u);
check('sprint time card is gone in path mode', !(await statByKey('sprint time')));
// The cycle line sits under the headline: driving time plus standing-still
// time, an addition the reader can check by eye.
const cycLine = async () => {
  const t = await page.textContent('#leadCycle');
  return { txt: t, v: parseFloat((t.match(/([\d.]+) s<?\/?b?> per cycle/) || t.match(/([\d.]+) s per cycle/) || [])[1]) };
};
const cyc1 = await cycLine();
check('cycle line is chain plus overhead', Math.abs(cyc1.v - (pvTotal + 1)) < 0.02, `${cyc1.txt} vs ${pvTotal} + 1`);
await page.fill('#overhead', '3.5');
await page.waitForTimeout(900);
const cyc2 = await cycLine();
check('overhead adds linearly', Math.abs(cyc2.v - cyc1.v - 2.5) < 0.02, `${cyc1.v} → ${cyc2.v}`);
check('overhead never touches the chain time itself',
  Math.abs((await statByKey('chain time')).v - chainCard.v) < 0.005, `${chainCard.v} → ${(await statByKey('chain time')).v}`);
check('the cycle line names the overhead it added', /3\.5 s overhead/.test(cyc2.txt), cyc2.txt);
await page.fill('#overhead', '1');
await page.waitForTimeout(500);
await page.click('#modeSprint');
await page.waitForTimeout(800);
check('the cycle line is gone in sprint mode', await page.evaluate(() => !document.querySelector('#leadCycle')));
await page.click('#modePath');
await page.waitForTimeout(900);
// a different chain must re-time the headline, and must NOT move the board
const boardPathA = await readBoard();
await page.selectOption('#pvSel', 'decode');
await page.waitForTimeout(1200);
const chainB = await statByKey('chain time');
const boardPathB = await readBoard();
check('picking another chain re-times the headline', Math.abs(chainB.v - chainCard.v) > 0.2, `${chainCard.v} → ${chainB.v}`);
check('picking another chain never moves the board',
  boardPathA.n === boardPathB.n && boardPathA.ideal === boardPathB.ideal && boardPathA.band === boardPathB.band,
  `${boardPathA.n}/${boardPathA.ideal} → ${boardPathB.n}/${boardPathB.ideal}`);
await page.selectOption('#pvSel', 'preload');
await page.waitForTimeout(900);
await page.click('#modeSprint');
await page.waitForTimeout(600);

// 5c. THE LEAD CARD'S ROWS. A chain name is arbitrary length, so the card
// gives it a line of its own and every other line keeps its own row. This is a
// regression: the cycle line used to carry the unit line's class, inherit its
// grid area with it, and print itself on top of the unit line the moment a
// long name made that line wrap. Boxes are compared, not text.
{
  const LONGEST = 'Into the Deep bucket auto, legacy 1.0.x syntax';
  const leadProbe = (p) => p.evaluate(() => {
    const lead = document.querySelector('.dt-stat-lead');
    const box = (el) => {
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { t: b.top, b: b.bottom, l: b.left, r: b.right, h: b.height };
    };
    const cs = getComputedStyle(lead);
    const cb = lead.getBoundingClientRect();
    const nm = document.querySelector('#leadName');
    const v = lead.querySelector('.v');
    return {
      inner: { l: cb.left + parseFloat(cs.paddingLeft), r: cb.right - parseFloat(cs.paddingRight) },
      k: box(lead.querySelector('.k')), v: box(v), u: box(lead.querySelector('.u')),
      nm: box(nm), cyc: box(document.querySelector('#leadCycle')),
      gauge: box(lead.querySelector('.dt-gauge')),
      vText: v.textContent, vPx: parseFloat(getComputedStyle(v).fontSize),
      tabular: getComputedStyle(v).fontVariantNumeric,
      otherPx: [...document.querySelectorAll('#stats .dt-stat:not(.dt-stat-lead) .v')].map((e) => parseFloat(getComputedStyle(e).fontSize)),
      name: nm ? nm.textContent : null, title: nm ? nm.getAttribute('title') : null,
      nmLines: nm ? Math.round(nm.getBoundingClientRect().height / parseFloat(getComputedStyle(nm).lineHeight)) : 0,
      pv: document.querySelector('#pvTotal').textContent,
    };
  });
  // Two boxes overlap when they share area in BOTH axes. The gauge is a column
  // neighbour on wide screens, so only the text rows are compared to each other.
  const hits = (a, b) => !!a && !!b
    && Math.min(a.r, b.r) - Math.max(a.l, b.l) > 1
    && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 1;
  const rowsInOrder = (r) => [r.k, r.v, r.u, r.nm, r.cyc].filter(Boolean)
    .every((row, i, all) => i === 0 || row.t >= all[i - 1].b - 1);

  for (const w of [390, 1366]) {
    const lp = await browser.newPage({ viewport: { width: w, height: 950 } });
    await lp.goto(BASE + '/drivetrain/', { waitUntil: 'networkidle' });
    await lp.waitForTimeout(1000);
    await lp.click('#modePath');
    await lp.selectOption('#pvSel', 'bucket'); // the longest stock label there is
    await lp.waitForTimeout(1300);
    const r = await leadProbe(lp);

    check(`lead card: the chain name takes a line of its own at ${w}`,
      !!r.nm && r.name === LONGEST, `${r.name}`);
    check(`lead card: the unit line and the cycle line never overlap at ${w}`,
      !hits(r.u, r.cyc), JSON.stringify({ u: r.u, cyc: r.cyc }));
    check(`lead card: the name and the cycle line never overlap at ${w}`,
      !hits(r.nm, r.cyc), JSON.stringify({ nm: r.nm, cyc: r.cyc }));
    check(`lead card: the name and the unit line never overlap at ${w}`, !hits(r.u, r.nm));
    check(`lead card: every row sits below the one above it at ${w}`, rowsInOrder(r),
      JSON.stringify({ k: r.k?.b, v: r.v?.b, u: r.u?.b, nm: r.nm?.t, cyc: r.cyc?.t }));
    check(`lead card: the whole label stays on the title at ${w}`, r.title === LONGEST, `${r.title}`);
    check(`lead card: the figure is still the biggest number in the ledger at ${w}`,
      r.otherPx.length > 0 && r.vPx > Math.max(...r.otherPx), `${r.vPx} vs ${Math.max(...r.otherPx)}`);
    check(`lead card: the figure keeps tabular figures at ${w}`, /tabular-nums/.test(r.tabular), r.tabular);
    // (c) the headline IS the Simulate readout, for whatever chain is loaded
    check(`lead card: the card number equals #pvTotal at ${w}`,
      Math.abs(parseFloat(r.vText) - parseFloat(r.pv)) < 0.02, `${r.vText} vs ${r.pv}`);

    // (b) a name nobody would ever type, including an unbreakable run of it
    await lp.evaluate(() => {
      document.querySelector('#leadName').textContent =
        'Regional qualifier alliance-side autonomous with preload score and a parking retreat '
        + 'Supercalifragilisticexpialidociousnessgoesrighthereandsimplykeepsongoingforever';
    });
    await lp.waitForTimeout(120);
    const g = await leadProbe(lp);
    check(`lead card: an absurd name never overlaps the cycle line at ${w}`,
      !hits(g.nm, g.cyc) && !hits(g.u, g.nm), JSON.stringify({ nm: g.nm, cyc: g.cyc }));
    check(`lead card: an absurd name still leaves every row in order at ${w}`, rowsInOrder(g));
    check(`lead card: an absurd name clamps at two lines at ${w}`, g.nmLines <= 2, `${g.nmLines} lines`);
    check(`lead card: an absurd name never pushes past the card at ${w}`,
      g.nm.r <= g.inner.r + 1.5 && g.nm.l >= g.inner.l - 1.5, JSON.stringify({ nm: g.nm, inner: g.inner }));
    check(`lead card: an absurd name never widens the page at ${w}`,
      (await lp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1);

    // a real pasted chain has to land on the card too, and stay in sync
    await lp.selectOption('#pvSel', 'custom');
    await lp.fill('#pvSrcText', `follower.pathBuilder()
        .addPath(new BezierLine(new Pose(12, 24), new Pose(120, 120)))
        .setLinearHeadingInterpolation(Math.toRadians(0), Math.toRadians(90))
        .build();`);
    await lp.click('#pvLoad');
    await lp.waitForTimeout(1200);
    const cu = await leadProbe(lp);
    check(`lead card: a pasted chain names itself on the card at ${w}`, !!cu.name, `${cu.name}`);
    check(`lead card: a pasted chain leaves every row in order at ${w}`,
      rowsInOrder(cu) && !hits(cu.u, cu.cyc) && !hits(cu.nm, cu.cyc), JSON.stringify(cu));
    check(`lead card: a pasted chain keeps the card in sync with #pvTotal at ${w}`,
      Math.abs(parseFloat(cu.vText) - parseFloat(cu.pv)) < 0.02, `${cu.vText} vs ${cu.pv}`);
    check(`lead card: a pasted chain actually re-timed the headline at ${w}`,
      Math.abs(parseFloat(cu.vText) - parseFloat(r.vText)) > 0.05, `${r.vText} → ${cu.vText}`);
    await lp.close();
  }
}

// 5b. the board is scored on overall movement, so the sprint slider is a
// readout control and nothing more.
const boardD3 = await readBoard();
await page.fill('#dist', '7');
await page.waitForTimeout(1100);
const boardD7 = await readBoard();
check('moving the sprint slider moves the headline', (await statByKey('sprint time')).v > 2,
  `${(await statByKey('sprint time')).v} s at 7 tiles`);
check('moving the sprint slider never moves the board',
  boardD3.n === boardD7.n && boardD3.ideal === boardD7.ideal && boardD3.band === boardD7.band,
  `${boardD3.n}/${boardD3.ideal} → ${boardD7.n}/${boardD7.ideal}`);
await page.fill('#dist', '3');
await page.waitForTimeout(700);

// 6. external stage math. Teeth are TYPED now, because there are far more real
// gears than any one vendor's ladder; the family select keeps setting the
// efficiency and now feeds a datalist of that vendor's stocked sizes.
await page.click('#addStage');
await page.waitForTimeout(400);
check('a new stage defaults to a gear pair', (await page.inputValue('#stageList [data-st="type"]')) === 'gears', await page.inputValue('#stageList [data-st="type"]'));
check('a new stage is ratio-neutral', (await page.textContent('#roG')) === '13.79 : 1', await page.textContent('#roG'));
check('teeth are typed, not picked', await page.evaluate(() => {
  const el = document.querySelector('#stageList [data-st="din"]');
  return el.tagName === 'INPUT' && el.type === 'number' && el.step === '1';
}), await page.evaluate(() => document.querySelector('#stageList [data-st="din"]').tagName));
await page.selectOption('#stageList [data-st="type"]', 'belt');
await page.waitForTimeout(400);
await page.fill('#stageList [data-st="din"]', '16');
await page.fill('#stageList [data-st="dout"]', '24');
await page.waitForTimeout(500);
check('16:24 stage → 20.69 : 1', (await page.textContent('#roG')) === '20.69 : 1', await page.textContent('#roG'));
// per-type efficiency: 93% gearbox times the family figure
const etaOf = async (t) => {
  await page.selectOption('#stageList [data-st="type"]', t);
  await page.waitForTimeout(400);
  return page.textContent('#roEta');
};
check('belt stage reads 90% net', (await etaOf('belt')) === '90%', await page.textContent('#roEta'));
check('gear stage reads 89% net', (await etaOf('gears')) === '89%', await page.textContent('#roEta'));
check('8 mm chain stage reads 88% net', (await etaOf('chain8')) === '88%', await page.textContent('#roEta'));
check('#25 chain stage reads 88% net', (await etaOf('chain25')) === '88%', await page.textContent('#roEta'));
// families never mix: the SUGGESTIONS on a field are that vendor's ladder only
const teethList = (k) => page.evaluate((kk) => {
  const el = document.querySelector(`#stageList [data-st="${kk}"]`);
  const id = el.getAttribute('list');
  const dl = id ? document.getElementById(id) : null;
  return { id, opts: dl ? [...dl.options].map((o) => Number(o.value)) : null };
}, k);
await page.selectOption('#stageList [data-st="type"]', 'belt');
await page.waitForTimeout(350);
const beltT = await teethList('din');
check('belt teeth suggest the HTD pulley ladder only', JSON.stringify(beltT.opts) === JSON.stringify([16, 24, 48]), JSON.stringify(beltT));
await page.selectOption('#stageList [data-st="type"]', 'gears');
await page.waitForTimeout(350);
const gearT = await teethList('dout');
check('gear teeth suggest the whole confirmed MOD 0.8 catalog',
  JSON.stringify(gearT.opts) === JSON.stringify([15, 20, 24, 30, 36, 40, 48, 50, 60, 68, 80, 90, 96, 100, 105, 108]), JSON.stringify(gearT.opts));
check('gear teeth suggest no sprocket counts', !gearT.opts.includes(17) && !gearT.opts.includes(66), JSON.stringify(gearT.opts));
check('every stocked family ships its own datalist', await page.evaluate(() =>
  ['gears', 'belt', 'chain8', 'chain25'].every((k) => {
    const dl = document.getElementById('dt-teeth-' + k);
    return dl && dl.tagName === 'DATALIST' && dl.options.length > 0;
  })), await page.evaluate(() => [...document.querySelectorAll('datalist[id^="dt-teeth-"]')].map((d) => d.id).join(',')));
check('the hint says recipes still name stocked parts only',
  /stocked parts/.test(await page.textContent('.dt-stages')), (await page.textContent('.dt-stages')).replace(/\s+/g, ' ').trim().slice(-60));
await page.selectOption('#stageList [data-st="type"]', 'custom');
await page.waitForTimeout(350);
check('a custom stage suggests nothing', (await teethList('din')).id === null, JSON.stringify(await teethList('din')));

// 6b. the point of typing them: the very small and the very large pairs
await page.selectOption('#stageList [data-st="type"]', 'gears');
await page.waitForTimeout(350);
await page.fill('#stageList [data-st="din"]', '12');
await page.fill('#stageList [data-st="dout"]', '96');
await page.waitForTimeout(500);
check('typed 12:96 reads 110.34 : 1', (await page.textContent('#roG')) === '110.34 : 1', await page.textContent('#roG'));
check('an off-ladder pair stays on its family', (await page.inputValue('#stageList [data-st="type"]')) === 'gears', await page.inputValue('#stageList [data-st="type"]'));
// switching family re-suggests; it never silently retypes a still-legal pair
await page.selectOption('#stageList [data-st="type"]', 'chain25');
await page.waitForTimeout(450);
check('switching family keeps legal typed teeth',
  (await page.inputValue('#stageList [data-st="din"]')) === '12' && (await page.inputValue('#stageList [data-st="dout"]')) === '96',
  `${await page.inputValue('#stageList [data-st="din"]')}:${await page.inputValue('#stageList [data-st="dout"]')}`);
check('switching family still resets the family efficiency', (await page.inputValue('#stageList [data-st="eff"]')) === '95', await page.inputValue('#stageList [data-st="eff"]'));

// 6c. weird values never reach the model. A number input already refuses
// non-numeric text (a pasted "48 tooth" lands as an empty string), so what is
// left to defend against is out-of-range and empty, and both clamp on blur.
const blurTeeth = async () => { await page.locator('#stageList [data-st="eff"]').focus(); await page.waitForTimeout(350); };
await page.fill('#stageList [data-st="din"]', '9999');
await blurTeeth();
check('an absurd tooth count clamps to the ceiling', (await page.inputValue('#stageList [data-st="din"]')) === '200', await page.inputValue('#stageList [data-st="din"]'));
await page.fill('#stageList [data-st="din"]', '2');
await blurTeeth();
check('a tooth count under the floor clamps up', (await page.inputValue('#stageList [data-st="din"]')) === '8', await page.inputValue('#stageList [data-st="din"]'));
await page.evaluate(() => {
  const el = document.querySelector('#stageList [data-st="din"]');
  el.focus();
  el.value = '48 tooth pinion'; // what a paste of junk actually leaves behind
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
});
await blurTeeth();
check('pasted junk lands on a valid tooth count', /^\d+$/.test(await page.inputValue('#stageList [data-st="din"]')), await page.inputValue('#stageList [data-st="din"]'));
check('a fractional tooth count rounds to a whole tooth', await page.evaluate(async () => {
  const el = document.querySelector('#stageList [data-st="din"]');
  el.focus();
  el.value = '20.7';
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return el.value === '21';
}));
check('no garbage ever NaNs the reduction readout', /^\d+\.\d{2} : 1$/.test(await page.textContent('#roG')), await page.textContent('#roG'));
await page.locator('#stageList .dt-rm').click();
await page.waitForTimeout(400);

// 7. wheel presets: COTS values land in the fields, edits flip to custom
await page.selectOption('#wPreset', 'am4mec');
await page.waitForTimeout(400);
check('AndyMark preset sets 101.6 mm', (await page.inputValue('#wDia')) === '101.6', await page.inputValue('#wDia'));
check('AndyMark preset sets μ 0.51', (await page.inputValue('#mu')) === '0.51', await page.inputValue('#mu'));
await page.fill('#mu', '0.60');
await page.waitForTimeout(400);
check('editing μ flips preset to custom', (await page.evaluate(() => document.querySelector('#wPreset').value)) === 'custom');
await page.selectOption('#wPreset', 'gb96mec');
await page.waitForTimeout(400);
check('back to goBILDA 96 defaults', (await page.inputValue('#wDia')) === '96' && (await page.inputValue('#mu')) === '0.7', `${await page.inputValue('#wDia')} / ${await page.inputValue('#mu')}`);
// the page assumes mecanum or tank, so omni is gone from both selects
const wheelVals = await page.$$eval('#wPreset option, #wType option', (o) => o.map((x) => x.value).join(','));
check('omni is absent from the wheel controls', !/omni/i.test(wheelVals), wheelVals);

// 7b. brand-locked platform picker: a gearbox is offered only where it mounts
const gbList = () => page.$$eval('#gbSel option', (o) => o.map((x) => ({ v: x.value, t: x.textContent })));
const platforms = await page.$$eval('#mPreset option', (o) => o.map((x) => x.value));
check('platform select offers the three brands plus custom', platforms.join(',') === 'gb,rev,am,custom', platforms.join(','));
for (const plat of platforms) {
  await page.selectOption('#mPreset', plat);
  await page.waitForTimeout(700);
  const opts = await gbList();
  check(`${plat} offers a bare option first`, opts[0].v === '1' && /bare|direct/i.test(opts[0].t), JSON.stringify(opts[0]));
  // a goBILDA cartridge is named "<ratio>:1 cartridge"; "no cartridge" on the
  // bare rungs is a description of the absence, not a part
  const GB_PART = /\d(\.\d)?:1 cartridge/, REV_PART = /UltraPlanetary|Core Hex/, AM_PART = /Orbital|Classic|NeveRest/;
  const foreign = plat === 'gb'
    ? opts.filter((o) => REV_PART.test(o.t) || AM_PART.test(o.t))
    : plat === 'rev'
      ? opts.filter((o) => GB_PART.test(o.t) || AM_PART.test(o.t))
      : plat === 'am'
        ? opts.filter((o) => GB_PART.test(o.t) || REV_PART.test(o.t))
        : opts.filter((o) => GB_PART.test(o.t) || REV_PART.test(o.t) || AM_PART.test(o.t));
  check(`${plat} never lists another brand's gearbox`, foreign.length === 0, foreign.map((o) => o.t).join(' | '));
}
await page.selectOption('#mPreset', 'rev');
await page.waitForTimeout(800);
const revOpts = await gbList();
check('REV names actual UltraPlanetary ratios beside the nominal', revOpts.some((o) => /nominal 12:1 \(actual 10\.48\)/.test(o.t)), revOpts.map((o) => o.t).slice(0, 6).join(' | '));
check('REV stacks up to three cartridges', revOpts.some((o) => /nominal 60:1 \(actual 54\.83\)/.test(o.t)));
check('REV carries Core Hex as its own fixed unit', revOpts.some((o) => o.v === '72' && /Core Hex/.test(o.t)));
check('torque basis hides where only one basis exists', await page.evaluate(() => document.querySelector('#basisWrap').hidden));
// Core Hex is a sealed gearmotor, so picking it swaps the motor numbers too
await page.selectOption('#gbSel', '72');
await page.waitForTimeout(700);
check('Core Hex brings its own published motor figures', (await page.inputValue('#mFree')) === '9000' && (await page.inputValue('#mIs')) === '4.4', `${await page.inputValue('#mFree')} / ${await page.inputValue('#mIs')}`);
await page.selectOption('#gbSel', '1');
await page.waitForTimeout(700);
check('stepping off Core Hex restores the platform motor', (await page.inputValue('#mFree')) === '6000' && (await page.inputValue('#mIs')) === '11', `${await page.inputValue('#mFree')} / ${await page.inputValue('#mIs')}`);
const revRecipe = await page.textContent('#boardRecipe');
check('REV recipes only name REV parts', !/cartridge|Orbital|Classic/.test(revRecipe), revRecipe.slice(0, 70));
await page.selectOption('#mPreset', 'gb');
await page.waitForTimeout(800);
check('torque basis returns for goBILDA', !(await page.evaluate(() => document.querySelector('#basisWrap').hidden)));
check('goBILDA keeps the spec/dyno swap line', /vendor|dyno/.test(await page.textContent('#boardAlt')), (await page.textContent('#boardAlt')).slice(0, 50));
await page.selectOption('#gbSel', STOCK_GB);
await page.waitForTimeout(700);

// 7b2. EXACT RATIOS. The whole point of the rung is that the number the page
// computes is the number printed on the box: pick every goBILDA cartridge in
// turn and demand the wheel free speed come back as the vendor's own rpm at
// 1:1 external. There is no exception. Every rung is the same back-solve of
// the published rpm, including the 50.9, so no label can contradict its own
// readout; the sourced 250047/4913 fraction is discussed in the notes instead.
const GB_LADDER = [[1, 6000], [3.7037, 1620], [5.2174, 1150], [13.7931, 435], [19.2308, 312],
  [26.9058, 223], [51.2821, 117], [71.4286, 84], [100, 60], [139.5349, 43], [200, 30]];
for (const [v, rpm] of GB_LADDER) {
  await page.selectOption('#gbSel', String(v));
  await page.waitForTimeout(420);
  const got = await page.textContent('#roRPM');
  check(`the ${rpm} rpm cartridge reads back ${rpm} rpm`, got === `${rpm} rpm`, `${v}:1 gave ${got}`);
}
check('no goBILDA rung is left on a hand-picked fraction', await page.$$eval('#gbSel option', (o) =>
  o.map((x) => x.value).filter((v) => v !== 'custom').every((v) => {
    const rpm = Math.round(6000 / Number(v));
    return Math.round((6000 / rpm) * 1e4) / 1e4 === Number(v);
  })), await page.$$eval('#gbSel option', (o) => o.map((x) => x.value).join(',')));
const gbLabels = await page.$$eval('#gbSel option', (o) => o.map((x) => x.textContent));
check('the 43 rpm / 139:1 rung is on the picker', gbLabels.some((t) => /139:1 cartridge \(43 rpm\)/.test(t)), gbLabels.join(' | ').slice(0, 200));
check('the goBILDA ladder is the full eleven rungs plus custom', gbLabels.length === 12, String(gbLabels.length));
check('every cartridge label still names its published rpm',
  gbLabels.filter((t) => /cartridge|Bare/.test(t)).every((t) => /\(\d+ rpm\)/.test(t)), gbLabels.join(' | ').slice(0, 160));
await page.selectOption('#gbSel', STOCK_GB);
await page.waitForTimeout(700);

// 7c. every explanation fold opens and closes on click
for (const id of FOLD_IDS) {
  await page.evaluate((i) => { document.querySelector('#' + i).open = false; }, id);
  await page.click(`#${id} > summary`);
  await page.waitForTimeout(160);
  const open = await page.evaluate((i) => document.querySelector('#' + i).open, id);
  await page.click(`#${id} > summary`);
  await page.waitForTimeout(140);
  const shut = await page.evaluate((i) => !document.querySelector('#' + i).open, id);
  check(`fold #${id} opens and closes on click`, open && shut, `opened=${open} closed=${shut}`);
}

// 7d. "build the recommendation" rewrites the config to the named recipe, and
// rewrites NOTHING else. The page's own persisted snapshot is the config, so
// diff it either side of the click and demand the only keys that moved are the
// gearbox and the stage list.
await page.waitForTimeout(500);
const recBefore = await page.evaluate(() => document.querySelector('#boardRecipe').textContent.split('·')[0]);
const recG = (recBefore.match(/→\s*([\d.]+):1/) || [])[1];
check('apply button is live when the config is not the recommendation', !(await page.evaluate(() => document.querySelector('#applyRec').disabled)));
const cfgPre = await cfgSnap();
await page.click('#applyRec');
await page.waitForTimeout(1400);
const cfgPost = await cfgSnap();
const applyMoved = cfgDiff(cfgPre, cfgPost);
// A gearbox is part of the motor assembly, so on goBILDA the button is allowed
// exactly one key: the external stage list. Not the cartridge, not the motor.
const ALLOWED_APPLY = new Set(['stages']);
check('applying moves only the external stage list',
  applyMoved.length > 0 && applyMoved.every((k) => ALLOWED_APPLY.has(k)), applyMoved.join(',') || 'nothing moved');
check('applying lands on the recipe ratio', (await page.textContent('#roG')) === `${recG} : 1`, `${await page.textContent('#roG')} want ${recG}`);
check('applying leaves the board inside the window', /inside the window/.test(await page.textContent('#boardS')), (await page.textContent('#boardS')).slice(0, 90));
check('apply button disables once the config IS the recommendation', await page.evaluate(() => document.querySelector('#applyRec').disabled));
check('applying never leaves the chosen platform', (await page.evaluate(() => document.querySelector('#mPreset').value)) === 'gb');
check('applying replaces the stage list, it does not append', (await page.locator('#stageList .dt-stage-row').count()) <= 1);
// back to stock for the pin tests
await page.evaluate(() => { document.querySelectorAll('#stageList .dt-rm').forEach((b) => b.click()); });
await page.waitForTimeout(400);
await page.selectOption('#gbSel', STOCK_GB);
await page.waitForTimeout(700);
check('back to the stock 435 rpm cartridge', (await page.textContent('#roG')) === '13.79 : 1', await page.textContent('#roG'));

// 7e. THE RECOMMENDATION KEEPS YOUR MOTOR.
// A gearbox is part of the motor assembly: fitting a different one changes the
// length and the mass of the drive pod, so a button labelled "build the
// recommendation" must never do it behind your back. External stages bolt to
// the chassis and never touch the motor, so that is the road the headline
// takes. One exception is verified and only one: REV publishes the
// UltraPlanetary at 90/100/110/120 mm for zero to three cartridges, so two
// stacks carrying the same number of cartridges are the same length, and that
// swap may be offered as long as it is labelled.
const boardBits = () => page.evaluate(() => ({
  k: document.querySelector('#boardK').textContent.trim(),
  recipe: document.querySelector('#boardRecipe').textContent.trim(),
  basis: document.querySelector('#boardBasis').textContent.trim(),
  swap: document.querySelector('#boardSwap').textContent.trim(),
  swapHidden: document.querySelector('#boardSwap').hidden,
  lines: ['boardK', 'boardRecipe', 'boardS', 'boardIdeal', 'boardAlt']
    .map((i) => document.querySelector('#' + i).textContent.trim()),
  gb: document.querySelector('#gbSel').value,
  gbLabel: document.querySelector('#gbSel').selectedOptions[0].textContent,
  off: document.querySelector('#applyRec').disabled,
}));
// Every stage the engine may name, by family, so a box label like "13.7:1
// cartridge" is never mistaken for a tooth pair.
const STAGE_RX = /(?:gears|HTD belt|8 mm chain|#25 chain) (\d+):(\d+)/g;
const stagesIn = (t) => [...t.matchAll(STAGE_RX)].map((m) => ({ din: Number(m[1]), dout: Number(m[2]) }));
// goBILDA's MOD 0.8 ladder stops selling pinions at 40 teeth; 48 and up are
// hub-mount gears that need a hub and a plate. Nothing bigger may sit on a
// motor shaft, which is what kills "96 teeth driving 15".
const PINION_MAX = 40;
// The only dimensions that survived verification. Anything else in the UI is a
// number somebody made up.
const OK_MM = new Set(['10', '90', '100', '110', '120', '83.8', '133.4']);
const dimsOk = (t) => [...t.matchAll(/([\d.]+)\s*mm/g)].every((m) => OK_MM.has(m[1])) && !/[\d.]+\s*g\b/.test(t);
const cartOfLabel = (t) => { const m = t.match(/UltraPlanetary ([\d+]+),/); return m ? m[1].split('+').length : 0; };
const cartOfShort = (t) => { const m = t.match(/^UP ([\d+]+)/); return m ? m[1].split('+').length : 0; };
const RECIPE_RX = /^(.*?)(?: \+ (?:gears|HTD belt|8 mm chain|#25 chain) (\d+):(\d+))? → ([\d.]+):1$/;

// The stock rung of each platform, pinned exactly. goBILDA: keep the 13.7931
// cartridge, gear 30:24, 13.7931 x 24/30 = 11.03:1. AndyMark: keep the 19.4118
// Orbital, gear 36:20, 19.4118 x 20/36 = 10.78:1. REV: the licensed same-size
// swap, UP 4+4 to UP 3+4, both two-cartridge stacks, no external stage at all.
const PINNED_HEAD = {
  'gb 13.7931': '13.7:1 cartridge + gears 30:24 → 11.03:1',
  'am 19.4118': 'Orbital 19.2:1 + gears 36:20 → 10.78:1',
  'rev 13.0975': 'UP 3+4 → 10.48:1',
};
const seenSwap = { labelled: 0, sameCart: 0 };
let sawNoReach = 0, sawBetterElsewhere = 0;
for (const plat of ['gb', 'rev', 'am']) {
  await page.selectOption('#mPreset', plat);
  await page.waitForTimeout(700);
  const rungs = (await page.$$eval('#gbSel option', (o) => o.map((x) => x.value))).filter((v) => v !== 'custom');
  for (const v of rungs) {
    await page.selectOption('#gbSel', v);
    await page.waitForTimeout(620);
    const bits = await boardBits();
    const where = `${plat} ${v}`;
    if (PINNED_HEAD[where]) check(`${where}: the stock headline is pinned`, bits.recipe === PINNED_HEAD[where], bits.recipe);
    // 1. no recipe ever puts a hub gear on the motor shaft
    const big = stagesIn(bits.recipe + ' ' + bits.basis + ' ' + bits.swap).filter((s) => s.din > PINION_MAX);
    check(`${where}: every recipe drives from a pinion`, big.length === 0,
      big.map((s) => `${s.din}:${s.dout}`).join(',') || bits.recipe);
    // 2. the headline reaches its ratio on the fitted gearbox
    const m = bits.recipe.match(RECIPE_RX);
    if (m) {
      const want = m[2] ? Number(bits.gb) * Number(m[3]) / Number(m[2]) : Number(bits.gb);
      const keeps = Math.abs(Number(m[4]) - want) <= 0.006;
      if (plat === 'rev' && !keeps) {
        // the one licensed exception: a same-length UltraPlanetary stack
        seenSwap.labelled += /same-size swap/.test(bits.k) ? 1 : 0;
        seenSwap.sameCart += cartOfShort(m[1]) > 0 && cartOfShort(m[1]) === cartOfLabel(bits.gbLabel) ? 1 : 0;
        check(`${where}: a swapped headline stays inside one cartridge count`,
          cartOfShort(m[1]) > 0 && cartOfShort(m[1]) === cartOfLabel(bits.gbLabel), `${m[1]} vs ${bits.gbLabel}`);
        check(`${where}: a swapped headline says so on the board`, /same-size swap/.test(bits.k), bits.k);
        check(`${where}: a swapped headline shows its published length`,
          !bits.swapHidden && /mm/.test(bits.swap), bits.swap.slice(0, 90));
      } else {
        check(`${where}: the headline keeps the fitted gearbox`, keeps, `${bits.recipe} on ${bits.gb}`);
        check(`${where}: an unswapped headline is not labelled a swap`, !/same-size swap/.test(bits.k), bits.k);
      }
    } else {
      // 3. a gearbox that cannot be geared into the window says so plainly
      sawNoReach++;
      check(`${where}: an unreachable window is stated plainly`,
        /no stocked stage gets this gearbox there/.test(bits.recipe), bits.recipe);
      check(`${where}: the button is dead when nothing is buildable`, bits.off, String(bits.off));
    }
    // 4. the better-but-different option is information, and never invents a
    // millimetre or a gram
    if (!bits.swapHidden && /different gearbox/.test(bits.swap)) {
      sawBetterElsewhere++;
      check(`${where}: the different-gearbox line gives the honest reason`,
        /different assembly|assembly length|not the recommendation/.test(bits.swap), bits.swap.slice(0, 90));
    }
    check(`${where}: the gearbox note carries no unverified dimension`, dimsOk(bits.swap), bits.swap.slice(0, 120));
    // 5. the board proper is still a verdict, not an essay
    const over = bits.lines.find((t) => words(t) > 8);
    check(`${where}: no board line runs past eight words`, !over, over || '');
  }
}
check('some gearbox genuinely cannot reach the window', sawNoReach > 0, String(sawNoReach));
check('the different-gearbox line does appear somewhere', sawBetterElsewhere > 0, String(sawBetterElsewhere));
check('REV offers the same-size swap and labels every one of them',
  seenSwap.labelled > 0 && seenSwap.labelled === seenSwap.sameCart, JSON.stringify(seenSwap));

// 7e2. the button, operationally: the config diff either side of a click.
for (const [plat, rung] of [['gb', '3.7037'], ['gb', '26.9058'], ['am', '19.4118'], ['am', '41.25'], ['rev', '13.0975'], ['rev', '18.9304']]) {
  await page.selectOption('#mPreset', plat);
  await page.waitForTimeout(650);
  await page.selectOption('#gbSel', rung);
  await page.waitForTimeout(700);
  if (await page.evaluate(() => document.querySelector('#applyRec').disabled)) continue;
  const gbPre = await page.inputValue('#gbSel');
  const cartPre = cartOfLabel(await page.evaluate(() => document.querySelector('#gbSel').selectedOptions[0].textContent));
  const pre = await cfgSnap();
  await page.click('#applyRec');
  await page.waitForTimeout(1200);
  const moved = cfgDiff(pre, await cfgSnap());
  const gbPost = await page.inputValue('#gbSel');
  const cartPost = cartOfLabel(await page.evaluate(() => document.querySelector('#gbSel').selectedOptions[0].textContent));
  if (plat === 'rev') {
    check(`apply on ${plat} ${rung} never leaves the cartridge count`, cartPost === cartPre, `${cartPre} → ${cartPost}`);
    check(`apply on ${plat} ${rung} moves only the gearbox and the stages`,
      moved.every((k) => k === 'stages' || k === 'gbSel'), moved.join(','));
  } else {
    check(`apply on ${plat} ${rung} leaves the gearbox exactly where it was`, gbPost === gbPre, `${gbPre} → ${gbPost}`);
    check(`apply on ${plat} ${rung} moves only the external stages`, moved.every((k) => k === 'stages'), moved.join(','));
  }
  await page.evaluate(() => { document.querySelectorAll('#stageList .dt-rm').forEach((b) => b.click()); });
  await page.waitForTimeout(350);
}

// 7e3. a hand-typed custom ratio is a gearbox somebody owns too: the button
// gears around it and never snaps it onto a stocked cartridge.
await page.selectOption('#mPreset', 'gb');
await page.waitForTimeout(650);
await page.selectOption('#gbSel', 'custom');
await page.fill('#gbCustom', '9');
await page.waitForTimeout(800);
const custBits = await boardBits();
check('a custom ratio is named as the reader\'s own', /^your ratio/.test(custBits.recipe), custBits.recipe);
if (!custBits.off) {
  const custPre = await cfgSnap();
  await page.click('#applyRec');
  await page.waitForTimeout(1200);
  const custMoved = cfgDiff(custPre, await cfgSnap());
  check('applying on a custom ratio moves only the external stages', custMoved.every((k) => k === 'stages'), custMoved.join(','));
  check('applying on a custom ratio leaves the ratio typed', (await page.inputValue('#gbCustom')) === '9', await page.inputValue('#gbCustom'));
  check('applying on a custom ratio stays on the custom rung', (await page.inputValue('#gbSel')) === 'custom', await page.inputValue('#gbSel'));
}
await page.evaluate(() => { document.querySelectorAll('#stageList .dt-rm').forEach((b) => b.click()); });
await page.waitForTimeout(350);
await page.selectOption('#gbSel', STOCK_GB);
await page.waitForTimeout(700);
check('the rule block leaves the stock cartridge behind it', (await page.textContent('#roG')) === '13.79 : 1', await page.textContent('#roG'));

// 7e4. THE PICKER ITSELF, BYTE FOR BYTE.
// Every check above diffs the persisted config, and the config stores a RATIO.
// That cannot see the picker land on a different rung which happens to compute
// the same number, and it cannot see the button answer to the frame BEFORE the
// reader's last edit. So read the control instead: the value string and the
// words on screen, both sides of a click. Half these cases fire the click in
// the SAME task as the pick, which is the state that used to drop a goBILDA
// reader back onto the 435 rpm cartridge they had just moved off.
const gbDom = () => page.evaluate(() => {
  const s = document.querySelector('#gbSel');
  return {
    v: s.value,
    text: s.selectedOptions[0] ? s.selectedOptions[0].textContent : '(none)',
    custom: document.querySelector('#gbCustom').value,
    motor: ['mFree', 'mTau', 'mIs', 'mIf'].map((i) => document.querySelector('#' + i).value).join('/'),
  };
});
// Pick a rung and press build inside ONE task. A mouse rarely lands that fast;
// a keyboard, a busy frame or a doubled event does, and the button must answer
// to the gearbox in front of the reader either way.
const sameTickBuild = (v) => page.evaluate((val) => {
  const s = document.querySelector('#gbSel');
  if (val !== null) { s.value = val; s.dispatchEvent(new Event('change', { bubbles: true })); }
  const seen = {
    v: s.value,
    text: s.selectedOptions[0] ? s.selectedOptions[0].textContent : '(none)',
    custom: document.querySelector('#gbCustom').value,
    motor: ['mFree', 'mTau', 'mIs', 'mIf'].map((i) => document.querySelector('#' + i).value).join('/'),
  };
  document.querySelector('#applyRec').click();
  return seen;
}, v);
const fitRung = async (plat, rung, custom, stage) => {
  await page.selectOption('#mPreset', plat);
  await page.waitForTimeout(620);
  await page.evaluate(() => { document.querySelectorAll('#stageList .dt-rm').forEach((b) => b.click()); });
  await page.waitForTimeout(320);
  await page.selectOption('#gbSel', rung);
  if (custom) await page.fill('#gbCustom', custom);
  await page.waitForTimeout(650);
  if (stage) {
    await page.click('#addStage');
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      const r = document.querySelector('#stageList .dt-stage-row');
      const din = r.querySelector('[data-st="din"]'), dout = r.querySelector('[data-st="dout"]');
      din.value = '16'; din.dispatchEvent(new Event('input', { bubbles: true }));
      dout.value = '24'; dout.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }
  await page.waitForTimeout(700);
};
// A gearbox is part of the motor assembly, so "left alone" means the control
// itself, not a ratio that happens to agree: same value string, same words,
// same typed custom ratio, same motor row.
const pickerHeld = (tag, a, b) => {
  check(`${tag}: the picker's value is byte-identical across the click`, a.v === b.v, `${a.v} → ${b.v}`);
  check(`${tag}: the picker's visible label is byte-identical across the click`, a.text === b.text, `${a.text} → ${b.text}`);
  check(`${tag}: the typed custom ratio is untouched`, a.custom === b.custom, `${a.custom} → ${b.custom}`);
  check(`${tag}: the motor row is untouched`, a.motor === b.motor, `${a.motor} → ${b.motor}`);
};
// REV's one licensed move: a picker that DID shift must still read as an
// UltraPlanetary carrying the same cartridge count, which is the same
// published assembly length.
const pickerSameLength = (tag, a, b) => {
  const ca = cartOfLabel(a.text), cb = cartOfLabel(b.text);
  check(`${tag}: a shifted picker keeps its cartridge count`,
    (a.v === b.v && a.text === b.text) || (ca > 0 && ca === cb), `${a.text} → ${b.text}`);
  check(`${tag}: the typed custom ratio is untouched`, a.custom === b.custom, `${a.custom} → ${b.custom}`);
  check(`${tag}: the motor row is untouched`, a.motor === b.motor, `${a.motor} → ${b.motor}`);
};
// A button that quietly did nothing would pass every check above, so each case
// also has to show the build landing.
const buildLanded = async (tag) => check(`${tag}: the build actually ran`,
  await page.evaluate(() => document.querySelector('#applyRec').disabled),
  await page.textContent('#boardRecipe'));

// Same-tick cases: [platform, rung settled first, rung picked in the click's
// own task, whether an external stage is already fitted]. The settled rung is
// always a different part, so the recipe the button would have cached names a
// gearbox the reader has already left.
const SAME_TICK = [
  ['gb', STOCK_GB, '26.9058', false],
  ['gb', '26.9058', '51.2821', false],
  ['gb', STOCK_GB, '19.2308', true],
  ['am', '3.6996', '41.25', false],
  ['am', '41.25', '19.4118', false],
  ['rev', '24.3021', '13.0975', false],
  ['rev', '13.0975', '24.3021', false],
];
for (const [plat, from, to, stage] of SAME_TICK) {
  await fitRung(plat, from, null, stage);
  const tag = `same-tick build on ${plat} ${from} → ${to}${stage ? ' with a stage fitted' : ''}`;
  const before = await sameTickBuild(to);
  await page.waitForTimeout(1200);
  const after = await gbDom();
  check(`${tag}: the picked rung is the one the reader sees`, before.v === to, `${before.v} want ${to}`);
  if (plat === 'rev') pickerSameLength(tag, before, after); else pickerHeld(tag, before, after);
  await buildLanded(tag);
}

// Settled cases: the same click, taken at leisure, on every platform including
// the fitted rung that is NOT the platform default and the custom rung.
const SETTLED = [
  ['gb', STOCK_GB, null, false],
  ['gb', '51.2821', null, false],
  ['gb', '26.9058', null, true],
  ['gb', 'custom', '9', false],
  ['gb', 'custom', '22.5', true],
  ['am', '19.4118', null, false],
  ['am', '50.9', null, false],
  ['rev', '24.3021', null, false],
  ['rev', '18.9304', null, false],
  ['custom', 'custom', '9', false],
];
for (const [plat, rung, custom, stage] of SETTLED) {
  await fitRung(plat, rung, custom, stage);
  const tag = `settled build on ${plat} ${rung}${custom ? ' at ' + custom : ''}${stage ? ' with a stage fitted' : ''}`;
  if (await page.evaluate(() => document.querySelector('#applyRec').disabled)) {
    check(`${tag}: a dead button means the config already IS the recommendation`, true, 'skipped, already built');
    continue;
  }
  const before = await gbDom();
  await page.click('#applyRec');
  await page.waitForTimeout(1200);
  const after = await gbDom();
  if (plat === 'rev') pickerSameLength(tag, before, after); else pickerHeld(tag, before, after);
  await buildLanded(tag);
}

// The platform change is its own stale frame: the cached recipe names a rung of
// the brand just left, and no goBILDA picker may ever be handed a REV ratio.
for (const [from, to] of [['rev', 'gb'], ['gb', 'am'], ['am', 'rev'], ['gb', 'rev']]) {
  await fitRung(from, from === 'rev' ? '13.0975' : from === 'gb' ? STOCK_GB : '19.4118', null, false);
  const tag = `same-tick build straight after leaving ${from} for ${to}`;
  const before = await page.evaluate((t) => {
    const p = document.querySelector('#mPreset');
    p.value = t;
    p.dispatchEvent(new Event('change', { bubbles: true }));
    const s = document.querySelector('#gbSel');
    const seen = {
      v: s.value,
      text: s.selectedOptions[0] ? s.selectedOptions[0].textContent : '(none)',
      custom: document.querySelector('#gbCustom').value,
      motor: ['mFree', 'mTau', 'mIs', 'mIf'].map((i) => document.querySelector('#' + i).value).join('/'),
    };
    document.querySelector('#applyRec').click();
    return seen;
  }, to);
  await page.waitForTimeout(1200);
  const after = await gbDom();
  check(`${tag}: the picker never decays to a custom ratio`, after.v !== 'custom' || before.v === 'custom', `${before.v} → ${after.v}`);
  if (to === 'rev') pickerSameLength(tag, before, after); else pickerHeld(tag, before, after);
}

await page.selectOption('#mPreset', 'gb');
await page.waitForTimeout(650);
await page.evaluate(() => { document.querySelectorAll('#stageList .dt-rm').forEach((b) => b.click()); });
await page.waitForTimeout(320);
await page.selectOption('#gbSel', STOCK_GB);
await page.waitForTimeout(700);
check('the picker block leaves the stock cartridge behind it', (await page.textContent('#roG')) === '13.79 : 1', await page.textContent('#roG'));

// 8. pins: position, payload, add, restore, share
check('the pins sheet sits above the results', await page.evaluate(() => {
  const pins = document.querySelector('.dt-pins'), res = document.querySelector('.dt-results');
  return !!(pins.compareDocumentPosition(res) & Node.DOCUMENT_POSITION_FOLLOWING);
}));
check('the pins sheet is subtitled as robot setups', /robot setups/i.test(await page.textContent('#pinsHead')), await page.textContent('#pinsHead'));
await page.click('#pinBtn');
await page.waitForTimeout(300);
check('pin adds a row', (await page.locator('#pinBody tr').count()) === 1);
// a pin is a ROBOT setup: no path, visualiser, animator or overlay state
const pinPayload = await page.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('dt-cfg'));
  return { top: Object.keys(d.pins[0].cfg), fields: Object.keys(d.pins[0].cfg.fields) };
});
const PATHY = /^(pv|anim|ar|sr|csv|c[A-Z])|Scrub|Speed|Path|path|overlay/;
const pathKeys = [...pinPayload.top, ...pinPayload.fields].filter((k) => PATHY.test(k));
check('a fresh pin payload carries no path or animator keys', pathKeys.length === 0, pathKeys.join(','));
check('a pin payload does carry the robot fields', ['mPreset', 'gbSel', 'wt', 'mu', 'voc'].every((k) => pinPayload.fields.includes(k)), pinPayload.fields.join(','));
await page.fill('#wt', '40');
await page.click('#fuseHard');
await page.waitForTimeout(500);
await page.click('#pinBtn');
await page.waitForTimeout(300);
check('two pins', (await page.locator('#pinBody tr').count()) === 2);
await page.locator('[data-restore="0"]').click();
await page.waitForTimeout(600);
check('restore returns weight 29', (await page.inputValue('#wt')) === '29', await page.inputValue('#wt'));
check('restore returns thermal fuse', await page.evaluate(() => document.querySelector('#fuseBurst').classList.contains('is-active')));
check('share button exists', await page.evaluate(() => !!document.querySelector('[data-share="1"]')));
// hash-load path with a crafted snapshot
const hash = await page.evaluate(() => {
  const data = JSON.parse(localStorage.getItem('dt-cfg'));
  const snap = { v: 2, mode: 'sprint', fuse: 'hard', strafe: false, stop: false, stages: [], fields: { ...data.fields, wt: '35' } };
  return btoa(unescape(encodeURIComponent(JSON.stringify(snap)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
});
await page.goto(BASE + '/drivetrain/#s=' + hash, { waitUntil: 'networkidle' });
await page.waitForTimeout(900);
check('hash-shared cfg loads wt=35', (await page.inputValue('#wt')) === '35', await page.inputValue('#wt'));
check('shared banner shows', !(await page.evaluate(() => document.querySelector('#sessionNote').hidden)));
check('banner says shared', /Shared setup/.test(await page.textContent('#sessionNoteText')));

// 8a. a share link written in the OLD vocabulary still loads its old numbers.
// mPreset named the motor, not the platform; omni wheels existed; stage rows
// were bare [driving, driven, eff] triples.
const legacyLink = (fields, extra = {}) => page.evaluate(([f, x]) => {
  const snap = { v: 2, mode: 'sprint', fuse: 'hard', strafe: false, stop: false, stages: [], fields: f, ...x };
  return btoa(unescape(encodeURIComponent(JSON.stringify(snap)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}, [fields, extra]);
const LEGACY_FIELDS = {
  mPreset: 'yjspec', mFree: '6000', mTau: '0.144', mIs: '9.2', mIf: '0.25', nMotors: '4',
  gbSel: '13.7', gbEff: '93', gbCustom: '13.7',
  wPreset: 'gb96mec', wDia: '96', wType: 'mecanum', mu: '0.7', crr: '0.045',
  wt: '29', cgH: '5', cgX: '5', voc: '13.0', packIR: '160', rint: '0.20',
  ilim: '20', iburst: '35', tburst: '1.5', dist: '3', legs: '2.5, 1, 2.5', overhead: '1.0', brakeFrac: '0.6',
};
await page.goto(BASE + '/drivetrain/#s=' + (await legacyLink(LEGACY_FIELDS)), { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);
check('legacy link maps yjspec onto goBILDA + vendor spec', await page.evaluate(() =>
  document.querySelector('#mPreset').value === 'gb' && document.querySelector('#basisSpec').classList.contains('is-active')),
  await page.evaluate(() => document.querySelector('#mPreset').value));
check('a legacy 13.7 maps onto the exact 13.7931 rung', (await page.evaluate(() => document.querySelector('#gbSel').value)) === STOCK_GB,
  await page.evaluate(() => document.querySelector('#gbSel').value));
for (const [id, want] of [['roG', '13.79 : 1'], ['roRPM', '435 rpm'], ['roTau', '18.8 kg·cm'], ['roEta', '93%']]) {
  const got = await page.textContent('#' + id);
  check(`legacy link #${id} == ${want}`, got === want, got);
}
for (const [key, want] of LEGACY) {
  const card = await statByKey(key);
  check(`legacy link ${key} ≈ ${want}`, !!card && near(card.v, want), card ? `got ${card.v}` : 'no card');
}
// gm0-dyno vocabulary, an omni wheel set, and an untyped stage row
await page.goto(BASE + '/drivetrain/#s=' + (await legacyLink(
  { ...LEGACY_FIELDS, mPreset: 'gobilda', mFree: '5900', mTau: '0.19', mIs: '11', mIf: '0.3', wPreset: 'omni96', wType: 'omni', mu: '0.9', crr: '0.02' },
  { stages: [['16', '24', '96']] })), { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);
check('legacy gm0 vocabulary maps onto the dyno basis', await page.evaluate(() =>
  document.querySelector('#mPreset').value === 'gb' && document.querySelector('#basisDyno').classList.contains('is-active')));
check('legacy omni keeps its own measured constants', (await page.inputValue('#mu')) === '0.9' && (await page.inputValue('#crr')) === '0.02', `${await page.inputValue('#mu')} / ${await page.inputValue('#crr')}`);
check('legacy omni lands on a real wheel type', (await page.evaluate(() => document.querySelector('#wType').value)) === 'custom', await page.evaluate(() => document.querySelector('#wType').value));
check('legacy untyped stage keeps its exact ratio', (await page.textContent('#roG')) === '20.69 : 1', await page.textContent('#roG'));
// a cartridge the chosen platform does not stock survives as a custom ratio
await page.goto(BASE + '/drivetrain/#s=' + (await legacyLink({ ...LEGACY_FIELDS, mPreset: 'yjspec', gbSel: '2.897' })), { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);
check('an off-platform legacy ratio survives as a custom ratio', await page.evaluate(() =>
  document.querySelector('#gbSel').value === 'custom' && document.querySelector('#gbCustom').value === '2.897'),
  await page.evaluate(() => document.querySelector('#gbSel').value + '/' + document.querySelector('#gbCustom').value));
check('off-platform legacy ratio reproduces its reduction', (await page.textContent('#roG')) === '2.90 : 1', await page.textContent('#roG'));

// 8a2. cycle-legs mode is retired, so a link that carried legs comes back as
// the sprint those legs add up to, with the stops it was charging.
await page.goto(BASE + '/drivetrain/#s=' + (await legacyLink(
  { ...LEGACY_FIELDS, legs: '2.5, 1, 2.5' }, { mode: 'cycle', stop: false })), { waitUntil: 'networkidle' });
await page.waitForTimeout(1100);
check('a legacy cycle link lands in sprint mode', await page.evaluate(() =>
  document.querySelector('#modeSprint').classList.contains('is-active')));
check('its legs become one sprint of their sum', (await page.inputValue('#dist')) === '6', await page.inputValue('#dist'));
check('and the stops it charged stay charged', await page.evaluate(() => document.querySelector('#stopEnd').checked));
check('a legacy sprint link still lands in sprint mode', await (async () => {
  await page.goto(BASE + '/drivetrain/#s=' + (await legacyLink(LEGACY_FIELDS)), { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  return page.evaluate(() => document.querySelector('#modeSprint').classList.contains('is-active'));
})());

// 8b. hostile share payloads are neutralized
const evil = await page.evaluate(() => {
  const snap = { v: 2, mode: 'sprint', fuse: 'hard', strafe: false, stop: false,
    stages: [['"><img src=x onerror=window.__pwned=1>', '24', '96']],
    fields: { gbSel: '"><script>1</script>' } };
  return btoa(unescape(encodeURIComponent(JSON.stringify(snap)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
});
await page.goto(BASE + '/drivetrain/#s=' + evil, { waitUntil: 'networkidle' });
await page.waitForTimeout(900);
const pwned = await page.evaluate(() => ({
  pwned: !!window.__pwned,
  imgs: document.querySelectorAll('#stageList img').length,
  stageVal: document.querySelector('#stageList [data-st="din"]')?.value,
  stageType: document.querySelector('#stageList [data-st="type"]')?.value,
  boardN: document.querySelector('#boardN').textContent.trim(),
}));
check('hostile stage payload not executed', !pwned.pwned && pwned.imgs === 0, JSON.stringify(pwned));
// Teeth now come from a stocked ladder, so an unusable value lands on the
// family default (still a ratio-neutral 20:20) instead of a bare 1.
check('hostile stage coerced to the stocked default', pwned.stageVal === '20' && pwned.stageType === 'gears', JSON.stringify(pwned));
check('garbage cartridge falls back (board numeric)', /^\d{3}$/.test(pwned.boardN), pwned.boardN);
const evil2 = await page.evaluate(() => btoa(unescape(encodeURIComponent(JSON.stringify({ v: 2, stages: 'x' })))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''));
await page.goto(BASE + '/drivetrain/#s=' + evil2, { waitUntil: 'networkidle' });
await page.waitForTimeout(900);
const alive = await page.evaluate(() => document.querySelector('#boardN').textContent.trim());
check('non-array stages payload leaves page alive', /^\d{3}$/.test(alive), alive);

// 8c. every number in a payload is clamped to the bounds its own control
// declares, so a hand-edited link cannot plant a value no control could make.
const OUT_OF_RANGE = {
  mPreset: 'gb', mFree: '-9e9', mTau: '1e12', mIs: '0', mIf: '-40', nMotors: '900',
  gbSel: '13.7931', gbEff: '9000', gbCustom: '-5',
  wPreset: 'gb96mec', wDia: 'NaN', wType: 'mecanum', mu: '99', crr: '-3',
  wt: '100000', cgH: '-2', cgX: '1e9', voc: '4000', packIR: '0.0001', rint: '-1',
  ilim: '10000', iburst: '-50', tburst: '1e9', dist: '99', overhead: '-7', brakeFrac: '50',
};
await page.goto(BASE + '/drivetrain/#s=' + (await legacyLink(OUT_OF_RANGE)), { waitUntil: 'networkidle' });
await page.waitForTimeout(1100);
const clamped = await page.evaluate(() => {
  const out = {};
  document.querySelectorAll('#dt-inputs input[type="number"], #dt-inputs input[type="range"]').forEach((el) => {
    const v = parseFloat(el.value), lo = parseFloat(el.min), hi = parseFloat(el.max);
    out[el.id] = { v, ok: isFinite(v) && (!isFinite(lo) || v >= lo) && (!isFinite(hi) || v <= hi) };
  });
  return out;
});
const bad = Object.entries(clamped).filter(([, r]) => !r.ok).map(([k, r]) => `${k}=${r.v}`);
check('an out-of-range-everything payload lands inside every field bound', bad.length === 0, bad.join(' '));
check('and the page still computes a verdict', /^\d{2,4}$/.test(await page.evaluate(() => document.querySelector('#boardN').textContent.trim())),
  await page.evaluate(() => document.querySelector('#boardN').textContent.trim()));
check('zero console errors after the hostile payloads', errors.length === 0, errors.slice(0, 2).join(' | '));

await page.goto(BASE + '/drivetrain/', { waitUntil: 'networkidle' });
await page.waitForTimeout(700);
while (await page.locator('#stageList .dt-rm').count()) { await page.locator('#stageList .dt-rm').first().click(); await page.waitForTimeout(250); }

// 9. restored-session banner
await page.goto(BASE + '/drivetrain/', { waitUntil: 'networkidle' });
await page.waitForTimeout(900);
check('restored banner shows', !(await page.evaluate(() => document.querySelector('#sessionNote').hidden)));
check('banner says restored', /Restored/.test(await page.textContent('#sessionNoteText')));
check('pins survive reload', (await page.locator('#pinBody tr').count()) === 2);
await page.click('#sessionReset');
await page.waitForTimeout(900);
check('start-fresh hides banner', await page.evaluate(() => document.querySelector('#sessionNote').hidden));
check('start-fresh restores wt=29', (await page.inputValue('#wt')) === '29', await page.inputValue('#wt'));
// Reset lands on the simulator path; the sprint checks below need the straight
// line, so ask for it explicitly rather than inheriting whatever came before.
await page.click('#modeSprint');
await page.waitForTimeout(700);

// 10. CSV overlay + calibration report. The INPUT now lives in the real-world
// testing section (10b); only the chart's drawing and its legend stayed behind.
check('the calibration input left the sprint-profile card', await page.evaluate(() =>
  !document.querySelector('#overlay #csvText') && !document.querySelector('#overlay .dt-overlay')));
check('the calibration input lives in the testing section', await page.evaluate(() =>
  !!document.querySelector('#measure #csvText') && !!document.querySelector('#measure #csvUnits')
  && !!document.querySelector('#measure #csvClear') && !!document.querySelector('#measure #calReport')));
check('the chart keeps its measured legend entry', await page.evaluate(() =>
  /measured/.test(document.querySelector('#overlay .dt-legend').textContent)));
await page.click('.dt-overlay summary');
await page.waitForTimeout(200);
// synthetic log that tops out 8% slower than the model predicts (~3.55 t/s)
const rows = [];
for (let t = 0; t <= 2; t += 0.1) rows.push(`${t.toFixed(2)}, ${(3.55 * (1 - Math.exp(-t / 0.35))).toFixed(3)}`);
await page.fill('#csvText', rows.join('\n'));
await page.waitForTimeout(500);
const cal = await page.textContent('#calReport');
check('cal report appears', !(await page.evaluate(() => document.querySelector('#calReport').hidden)));
check('cal reports measured vs predicted', /Measured top .* vs predicted/.test(cal), cal.slice(0, 80));
check('cal suggests a Crr fix', /Crr ≈ \d\.\d+/.test(cal.replace(/\s/g, ' ')) || /C\s*rr\s*≈/.test(cal), cal.slice(0, 120));
// The points still land on the chart even though the box that fed them moved.
check('the chart still draws the measured points', /Measured overlay: \d+ points/.test(await page.textContent('#srProfile')),
  (await page.textContent('#srProfile')).slice(-60));
await page.click('#csvClear');
await page.waitForTimeout(300);
check('cal clears', await page.evaluate(() => document.querySelector('#calReport').hidden));

// 10b. REAL-WORLD TESTING. The pit protocol between the config and the verdict.
// Every field is optional; entering one replaces exactly one folklore constant
// and recomputes the whole page off it. An empty section has to leave every
// existing number where it was, which is asserted against hard-coded anchors
// rather than against "whatever the page happened to say a moment ago".
{
  const MEAS = ['msVfwd', 'msVstr', 'msAfwd', 'msAlat', 'msPull', 'msVidle', 'msVload', 'msIload'];
  const FILLED = '62,48,41.3,59.8,14.5,13.1,11.4,12';
  const measVals = () => page.evaluate((ids) => ids.map((i) => document.querySelector('#' + i).value).join(','), MEAS);
  const measRead = () => page.evaluate(() => ({
    prov: document.querySelector('#boardProv').textContent.trim(),
    provState: document.querySelector('#boardProv').dataset.meas,
    rows: [...document.querySelectorAll('.dt-prov-row')].map((r) => ({
      k: r.querySelector('.dt-prov-k').textContent.trim(),
      v: r.querySelector('.dt-prov-v').textContent.trim(),
      src: r.querySelector('.dt-prov-src').textContent.trim(),
      state: r.className.replace('dt-prov-row is-', '').trim(),
    })),
    boardN: document.querySelector('#boardN').textContent.trim(),
    boardBand: document.querySelector('#boardBand').textContent,
  }));
  const rowOf = (r, frag) => r.rows.find((x) => x.k.toLowerCase().includes(frag));
  const words = (t) => t.replace(/[·→]/g, ' ').split(/\s+/).filter(Boolean).length;
  // This section navigates through hash payloads, which re-init with an empty
  // pin list. Hand the ledger back at the end so the sections after this one
  // still find what they saved.
  const keptPins = await page.evaluate(() => JSON.parse(localStorage.getItem('dt-cfg') || '{}').pins || []);

  // Land on a known page: fresh defaults, straight sprint, forward.
  await page.click('#resetBtn');
  await page.waitForTimeout(1400);
  await page.click('#modeSprint');
  await page.waitForTimeout(800);

  // (a) SHAPE. A peer of the setup blocks, sitting where the reading order says.
  check('the testing section sits between the pins and the results', await page.evaluate(() => {
    const m = document.querySelector('#measure');
    const pins = document.querySelector('.dt-pins'), res = document.querySelector('.dt-results');
    return !!(pins.compareDocumentPosition(m) & Node.DOCUMENT_POSITION_FOLLOWING)
      && !!(m.compareDocumentPosition(res) & Node.DOCUMENT_POSITION_FOLLOWING);
  }));
  check('it carries the same structural weight as a setup block', await page.evaluate(() =>
    !!document.querySelector('#measure .dt-panel.dt-block')
    && /real-world testing/i.test(document.querySelector('#measure .dt-panel-h').textContent)));
  check('it says it is optional and that skipping it keeps the published values',
    /optional and independent/i.test(await page.textContent('.dt-meas-lede'))
    && /(published|folklore)/i.test(await page.textContent('.dt-meas-lede')),
    (await page.textContent('.dt-meas-lede')).replace(/\s+/g, ' ').slice(0, 90));
  check('it ships five ordered tests', (await page.locator('#measure .dt-test').count()) === 5,
    String(await page.locator('#measure .dt-test').count()));
  check('every test opens with an instruction, not a field',
    (await page.locator('#measure .dt-test-do').count()) === 5);
  check('every measured field ships empty', (await measVals()) === ',,,,,,,', await measVals());
  check('every measured field names its unit on the label', await page.evaluate((ids) =>
    ids.every((i) => {
      const lab = document.querySelector(`label[for="${i}"]`);
      return !!lab && /\((in\/s²|in\/s|lbf|V|A)\)/.test(lab.textContent);
    }), MEAS));
  check('every test states a sane range', await page.evaluate(() =>
    [...document.querySelectorAll('#measure .dt-test')].slice(0, 4)
      .every((t) => /\d+(\.\d+)? to \d+/.test(t.textContent))));
  check('the pull test reuses the weight already in the config, it does not ask twice',
    (await page.locator('#measure input#wt').count()) === 0
    && (await page.textContent('#msWtEcho')) === '29 lb', await page.textContent('#msWtEcho'));

  // (b) NOTHING MEASURED = today's page, to the digit.
  const EMPTY_ANCHORS = [['top speed', 3.8], ['free speed', 3.59], ['launch accel', 10.5],
    ['launch draw', 22.0], ['sprint time', 1.31], ['push force', 90], ['accel tax', 0.36],
    ['90%', 0.63], ['stopping distance', 0.96], ['cost of stopping', 0.25], ['tip margin', 66]];
  for (const [key, want] of EMPTY_ANCHORS) {
    const card = await statByKey(key);
    check(`unmeasured ${key} still reads ${want}`, !!card && near(card.v, want), card ? `got ${card.v}` : 'no card');
  }
  const empty = await measRead();
  check('an unmeasured board keeps its pinned window', /Honest window: 463–688 rpm/.test(empty.boardBand), empty.boardBand.slice(0, 40));
  check('an unmeasured readout ledger is all published',
    empty.rows.length === 5 && empty.rows.every((r) => r.state === 'published'), JSON.stringify(empty.rows.map((r) => r.state)));
  check('the ledger opens on the published grip, drag and loop figures',
    rowOf(empty, 'grip').v === '0.70' && rowOf(empty, 'drag').v === '0.045' && rowOf(empty, 'loop').v === '0.140 Ω',
    JSON.stringify(empty.rows.map((r) => r.v)));
  check('it names μ 0.70 as folklore rather than as a measurement',
    /folklore/i.test(rowOf(empty, 'grip').src), rowOf(empty, 'grip').src);
  check('no test readout shows before its own test is run', await page.evaluate(() =>
    ['outSpeed', 'outCoast', 'outPull', 'outLoop'].every((i) => document.querySelector('#' + i).hidden)));
  check('the board says it is running on published constants',
    /published/i.test(empty.prov) && /nothing measured/i.test(empty.prov), empty.prov);
  check('the board indicator is one short line', words(empty.prov) <= 8, empty.prov);

  // (c) PULL FORCE -> mu, and the recommendation recomputes off it.
  const a0Before = (await statByKey('launch accel')).v;
  await page.fill('#msPull', '14.5');          // 14.5 lbf over the config's 29 lb
  await page.waitForTimeout(1100);
  const pulled = await measRead();
  check('a pull force pins μ at force over weight',
    rowOf(pulled, 'grip').v === '0.50' && rowOf(pulled, 'grip').state === 'measured', JSON.stringify(rowOf(pulled, 'grip')));
  const a0After = (await statByKey('launch accel')).v;
  check('the measured μ actually drives the model', a0After < a0Before * 0.85, `${a0Before} → ${a0After}`);
  check('the recommendation recomputes off it', pulled.boardN !== empty.boardN, `${empty.boardN} → ${pulled.boardN}`);
  const pullTxt = (await page.textContent('#outPull')).replace(/\s+/g, ' ');
  check('the pull readout names the correct procedure',
    /sustained/i.test(pullTxt) && /breakaway/i.test(pullTxt), pullTxt.slice(0, 100));
  check('the board flips to measured', pulled.provState === '1' && /measured/.test(pulled.prov), pulled.prov);
  check('and still names what is still published', /rest published/.test(pulled.prov), pulled.prov);

  // (d) COAST-DOWN -> Crr, with the caveat the research insists on.
  await page.fill('#msAfwd', '41.3');
  await page.waitForTimeout(1000);
  const coast = await measRead();
  check('a coast-down pins Crr at |a| over g',
    rowOf(coast, 'drag').v === '0.107' && rowOf(coast, 'drag').state === 'measured', JSON.stringify(rowOf(coast, 'drag')));
  const coastTxt = (await page.textContent('#outCoast')).replace(/\s+/g, ' ');
  check('the Crr readout refuses to call it pure rolling resistance',
    /not pure rolling resistance/i.test(coastTxt) && /back-drag/i.test(coastTxt) && /cannot separate/i.test(coastTxt),
    coastTxt.slice(0, 150));
  check('the ledger names the bundled quantity, not a bare Crr',
    /rolling \+ drivetrain drag/i.test(rowOf(coast, 'drag').k), rowOf(coast, 'drag').k);
  await page.fill('#msAlat', '59.8');
  await page.waitForTimeout(1000);
  const lat = await measRead();
  check('lateral over forward reports a strafe drag multiplier',
    rowOf(lat, 'strafe').v === '1.45×' && rowOf(lat, 'strafe').state === 'reported', JSON.stringify(rowOf(lat, 'strafe')));
  check('and says outright that it is not applied to the model',
    /not applied/i.test(rowOf(lat, 'strafe').src), rowOf(lat, 'strafe').src);

  // (e) VOLTAGE TRIPLE -> loop resistance. Two readings is not a resistance.
  await page.fill('#msVidle', '13.1');
  await page.fill('#msVload', '11.4');
  await page.waitForTimeout(900);
  const partial = await measRead();
  check('two of the three readings leaves the loop published',
    rowOf(partial, 'loop').state === 'published' && rowOf(partial, 'loop').v === '0.140 Ω', JSON.stringify(rowOf(partial, 'loop')));
  check('and it says which reading is still missing',
    /loaded current/i.test(await page.textContent('#outLoop')), (await page.textContent('#outLoop')).replace(/\s+/g, ' ').slice(0, 90));
  await page.fill('#msIload', '12');
  await page.waitForTimeout(1100);
  const loop = await measRead();
  check('the triple pins loop resistance at drop over current',
    rowOf(loop, 'loop').v === '0.142 Ω' && rowOf(loop, 'loop').state === 'measured', JSON.stringify(rowOf(loop, 'loop')));
  check('the loop readout admits it cannot decompose the path',
    /cannot tell you which/i.test(await page.textContent('#outLoop')), (await page.textContent('#outLoop')).replace(/\s+/g, ' ').slice(-90));
  check('three of three reads as measured with nothing left over',
    /measured/.test(loop.prov) && !/rest published/.test(loop.prov), loop.prov);
  check('the board indicator stays one short line when full', words(loop.prov) <= 8, loop.prov);

  // (f) TOP SPEED -> an efficiency VERDICT, reported and never applied.
  await page.fill('#msVfwd', '62');
  await page.waitForTimeout(1000);
  const eff = await measRead();
  check('top speed reports an efficiency verdict',
    rowOf(eff, 'efficiency').state === 'reported' && /^\d+%$/.test(rowOf(eff, 'efficiency').v), JSON.stringify(rowOf(eff, 'efficiency')));
  const effTxt = (await page.textContent('#outSpeed')).replace(/\s+/g, ' ');
  check('the verdict compares measured against free speed at 12 V',
    /62\.0 in\/s against [\d.]+ in\/s of free speed at 12 V/.test(effTxt) && /% of theoretical/.test(effTxt), effTxt.slice(0, 120));
  check('and refuses to split the shortfall without a no-load check',
    /cannot be split/i.test(effTxt) && /no-load/i.test(effTxt) && /not applied/i.test(effTxt), effTxt.slice(-150));
  check('the reported efficiency never touches the model', (await page.textContent('#roEta')) === '93%', await page.textContent('#roEta'));
  await page.fill('#msVstr', '48');
  await page.waitForTimeout(900);
  check('strafe top speed reports as a fraction of forward',
    /77% of forward/.test(await page.textContent('#outSpeed')), (await page.textContent('#outSpeed')).replace(/\s+/g, ' ').slice(0, 130));
  check('the two constants a measurement cannot honestly reach stay reported',
    (await measRead()).rows.filter((r) => r.state === 'reported').length === 2,
    JSON.stringify((await measRead()).rows.map((r) => r.state)));

  // (g) it survives a reload and a share link; a legacy payload does not
  // acquire measurements it never carried.
  const measured = await measRead();
  const measShare = await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('dt-cfg'));
    delete d.pins;
    return btoa(unescape(encodeURIComponent(JSON.stringify(d)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1300);
  check('measurements survive a reload', (await measVals()) === FILLED, await measVals());
  check('and the board still says measured', (await measRead()).prov === measured.prov, (await measRead()).prov);
  await page.goto(BASE + '/drivetrain/#s=' + measShare, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  check('measurements travel in a share link', (await measVals()) === FILLED, await measVals());
  check('a teammate opening the link sees the same measured robot',
    (await measRead()).rows.filter((r) => r.state === 'measured').length === 3,
    JSON.stringify((await measRead()).rows.map((r) => r.state)));
  await page.goto(BASE + '/drivetrain/#s=' + (await legacyLink(LEGACY_FIELDS)), { waitUntil: 'networkidle' });
  await page.waitForTimeout(1100);
  check('a legacy link restores as an unmeasured robot',
    (await measVals()) === ',,,,,,,' && (await page.evaluate(() => document.querySelector('#boardProv').dataset.meas)) === '0',
    await measVals());
  for (const [key, want] of LEGACY) {
    const card = await statByKey(key);
    check(`legacy link ${key} ≈ ${want} with the section present`, !!card && near(card.v, want), card ? `got ${card.v}` : 'no card');
  }

  // (h) a measured field pins to its own declared range on blur, and an empty
  // one stays empty instead of filling in its floor.
  await page.goto(BASE + '/drivetrain/', { waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const MEAS_CLAMPS = [['msVfwd', '999', '120'], ['msVstr', '0', '15'], ['msAfwd', '1', '10'],
    ['msAlat', '999', '120'], ['msPull', '99', '15'], ['msVidle', '2', '11.5'],
    ['msVload', '99', '13'], ['msIload', '-4', '1']];
  for (const [id, typed, want] of MEAS_CLAMPS) {
    await page.fill('#' + id, typed);
    await page.locator(id === 'msPull' ? '#msVfwd' : '#msPull').focus();
    await page.waitForTimeout(230);
    check(`#${id} clamps ${typed} to ${want} on blur`, (await page.inputValue('#' + id)) === want, await page.inputValue('#' + id));
  }
  for (const [id] of MEAS_CLAMPS) await page.fill('#' + id, '');
  await page.locator('#msPull').focus();
  await page.waitForTimeout(500);
  check('an emptied measurement stays empty on blur rather than filling in its floor',
    (await measVals()) === ',,,,,,,', await measVals());
  check('clearing them all puts the board back on published constants',
    await page.evaluate(() => document.querySelector('#boardProv').dataset.meas === '0'));
  await page.goto(BASE + '/drivetrain/#s=' + (await legacyLink(
    { ...OUT_OF_RANGE, msVfwd: '1e9', msPull: '-500', msAfwd: 'NaN', msIload: '9e9' })), { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const measBad = await page.evaluate(() => {
    const bad = [];
    document.querySelectorAll('#measure input[type="number"]').forEach((el) => {
      if (el.value === '') return;
      const v = parseFloat(el.value), lo = parseFloat(el.min), hi = parseFloat(el.max);
      if (!(isFinite(v) && v >= lo && v <= hi)) bad.push(el.id + '=' + el.value);
    });
    return bad;
  });
  check('a hostile payload lands every measured field inside its own bounds', measBad.length === 0, measBad.join(' '));
  check('an unparseable measurement comes back as unmeasured, not as a floor',
    (await page.inputValue('#msAfwd')) === '', await page.inputValue('#msAfwd'));

  // (i) reset clears the measurements along with everything else, through the
  // one canonical DEFAULTS path.
  await page.goto(BASE + '/drivetrain/', { waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.click('#resetBtn');
  await page.waitForTimeout(1400);
  await page.click('#modeSprint');
  await page.waitForTimeout(600);
  await page.fill('#msPull', '12');
  await page.fill('#msAfwd', '40');
  await page.waitForTimeout(1000);
  check('measurements are live before the reset',
    await page.evaluate(() => document.querySelector('#boardProv').dataset.meas === '1'));
  await page.click('#resetBtn');
  await page.waitForTimeout(1500);
  check('reset clears every measurement', (await measVals()) === ',,,,,,,', await measVals());
  check('reset puts the board back on published constants',
    await page.evaluate(() => document.querySelector('#boardProv').dataset.meas === '0'));
  await page.click('#modeSprint');
  await page.waitForTimeout(800);
  const backAgain = await statByKey('launch accel');
  check('and every number goes back to its unmeasured default', near(backAgain.v, 10.5, 0.04), `got ${backAgain.v}`);

  // no h-overflow from the new markup, at either end of the range, full or empty
  for (const w of [320, 1366]) {
    const mp = await browser.newPage({ viewport: { width: w, height: 900 } });
    await mp.goto(BASE + '/drivetrain/', { waitUntil: 'networkidle' });
    await mp.waitForTimeout(900);
    for (const [id, v] of [['msVfwd', '118'], ['msVstr', '99'], ['msAfwd', '79'], ['msAlat', '119'],
      ['msPull', '14.5'], ['msVidle', '13.4'], ['msVload', '8.5'], ['msIload', '19.5']]) await mp.fill('#' + id, v);
    await mp.locator('#msVfwd').focus();
    await mp.waitForTimeout(1100);
    const over = await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    const wide = await mp.evaluate(() => [...document.querySelectorAll('#measure *')]
      .filter((e) => e.scrollWidth - e.clientWidth > 1).map((e) => e.className || e.tagName));
    check(`a fully measured section fits at ${w}px`, over <= 1 && wide.length === 0, `overflow ${over}, wide ${wide.join('|')}`);
    await mp.close();
  }

  // hand the pin ledger back to the sections that come after this one
  await page.evaluate((p) => {
    const d = JSON.parse(localStorage.getItem('dt-cfg') || '{}');
    d.pins = p;
    localStorage.setItem('dt-cfg', JSON.stringify(d));
  }, keptPins);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.click('#modeSprint');
  await page.waitForTimeout(700);
}

// 11. tip check warns for tall CG (CG now lives with the robot, not the wheel)
await openTune('cgTune');
await page.fill('#cgH', '12');
await page.waitForTimeout(900);
const tip = await statByKey('tip margin');
check('tall CG trips tip warn', tip.warn && tip.v > 85, `v=${tip.v} warn=${tip.warn}`);
await page.fill('#cgH', '5');
await page.waitForTimeout(900);

// 12. strafe toggle only for mecanum + moves numbers
const fwdTop = (await statByKey('top speed')).v;
await page.click('#dirStrafe');
await page.waitForTimeout(900);
const strTop = (await statByKey('top speed')).v;
check('strafe slows top speed', strTop < fwdTop * 0.9, `${fwdTop} → ${strTop}`);
await openTune('wheelTune'); // wheel type lives in the wheel fold, CG in its own
await page.selectOption('#wType', 'traction');
await page.waitForTimeout(400);
check('strafe hidden for traction wheels', await page.evaluate(() => document.querySelector('#strafeWrap').hidden));
await page.selectOption('#wType', 'mecanum');
await page.waitForTimeout(400);
check('strafe reset to forward on re-show', await page.evaluate(() => document.querySelector('#dirFwd').classList.contains('is-active')));

// restore path re-syncs strafe visibility
await page.click('#dirStrafe');
await page.waitForTimeout(300);
await page.click('#pinBtn');
await page.waitForTimeout(300);
await page.selectOption('#wType', 'traction');
await page.waitForTimeout(400);
const lastPin = (await page.locator('[data-restore]').count()) - 1;
await page.locator(`[data-restore="${lastPin}"]`).click();
await page.waitForTimeout(800);
check('restore re-shows strafe toggle', !(await page.evaluate(() => document.querySelector('#strafeWrap').hidden)));
check('restore reactivates strafe', await page.evaluate(() => document.querySelector('#dirStrafe').classList.contains('is-active')));
await page.click('#dirFwd');
await page.waitForTimeout(300);

// 12b. braking strength drives the cost
await page.fill('#brakeFrac', '0.3');
await page.waitForTimeout(900);
const softBrake = (await statByKey('sprint time')).v;
check('gentler braking costs time', softBrake > 1.42, `got ${softBrake}`);
await page.fill('#brakeFrac', '0.6');
await page.waitForTimeout(400);
await page.uncheck('#stopEnd');
await page.waitForTimeout(300);
check('brake field disabled when fly-through', await page.evaluate(() => document.querySelector('#brakeFrac').disabled));
await page.check('#stopEnd');
await page.waitForTimeout(400);

// 13. the pack-state preset chips are gone; rest voltage is simply typed, and
// the 13.5 / 12.0 / 11.8 guidance the chips used to carry lives on as prose
// inside the battery fold.
check('the pack-state chip row is gone', await page.evaluate(() => document.querySelectorAll('.dt-chip[data-soc]').length === 0));
check('rest voltage is a plain typeable field', await page.evaluate(() => {
  const el = document.querySelector('#voc');
  return el.tagName === 'INPUT' && el.type === 'number' && !el.disabled && !el.readOnly;
}));
await page.fill('#voc', '12.0');
await page.waitForTimeout(400);
check('a typed rest voltage sticks exactly as typed', (await page.inputValue('#voc')) === '12.0', await page.inputValue('#voc'));
check('the voltage guidance survives as prose, not chrome', await page.evaluate(() => {
  const t = document.querySelector('#batteryTune').textContent;
  return /13\.5/.test(t) && /12\.0/.test(t) && /11\.8/.test(t) && !/mid chip/.test(t);
}), (await page.textContent('#batteryTune')).replace(/\s+/g, ' ').slice(0, 90));
await page.fill('#voc', '99');
await page.locator('#packIR').focus();
await page.waitForTimeout(400);
check('an out-of-range rest voltage clamps instead of reaching the model', (await page.inputValue('#voc')) === '14.5', await page.inputValue('#voc'));
await page.fill('#voc', '12.0');
await page.waitForTimeout(300);
// the pack-health chips are a different control and stay
await page.click('.dt-chip[data-pack="130"]');
await page.waitForTimeout(400);
check('tired chip sets pack 130', (await page.inputValue('#packIR')) === '130', await page.inputValue('#packIR'));
check('tired chip sets loop 0.17 Ω', (await page.inputValue('#rint')) === '0.17', await page.inputValue('#rint'));
check('pack chip lights up', await page.evaluate(() => document.querySelector('.dt-chip[data-pack="130"]').classList.contains('is-active')));
await page.fill('#rint', '0.2');
await page.waitForTimeout(400);
check('hand-edited loop leaves pack alone', (await page.inputValue('#packIR')) === '130', await page.inputValue('#packIR'));
check('hand-edited loop says set by hand', (await page.textContent('#loopNote')).includes('set by hand'), await page.textContent('#loopNote'));
await page.click('.dt-chip[data-pack="80"]');
await page.waitForTimeout(400);
check('good chip sets loop 0.12 Ω', (await page.inputValue('#rint')) === '0.12', await page.inputValue('#rint'));

// raising the sustained limit must lift the visible burst value with it
await page.fill('#ilim', '50');
await page.waitForTimeout(400);
check('raising ilim lifts iburst field', (await page.inputValue('#iburst')) === '50', await page.inputValue('#iburst'));
await page.fill('#ilim', '20');
await page.waitForTimeout(300);

// 13b. NO WEIRD VALUES ANYWHERE. The blur-time clamp covers the whole setup
// region, not just the stage rows and the rest voltage: every numeric field in
// #dt-inputs honours its own min/max/step, including the run-bar fields. Each
// case types something out of range, moves focus, and demands the nearest legal
// value. Values are captured first and written back after, so this section
// leaves the page exactly as it found it.
const FIELD_CLAMPS = [
  ['wt', '999', '60'],          // robot weight, ceiling
  ['cgH', '0', '1'],            // CG height, floor
  ['mu', '5', '2'],             // grip coefficient, ceiling
  ['wDia', '1', '20'],          // wheel diameter, floor
  ['rint', '-3', '0'],          // loop resistance, floor
  ['gbEff', '5', '50'],         // gearbox efficiency, floor
  ['mFree', '1', '500'],        // motor free speed, floor
  ['tburst', '99', '10'],       // burst window, ceiling
];
for (const f of ['wheelTune', 'batteryTune', 'motorTune', 'gearTune', 'cgTune']) await openTune(f);
await page.waitForTimeout(300);
const kept = {};
for (const [id] of FIELD_CLAMPS) kept[id] = await page.inputValue('#' + id);
for (const [id, typed, want] of FIELD_CLAMPS) {
  await page.fill('#' + id, typed);
  // blur onto a field that is not the one under test: the clamp runs on
  // change, which a browser only fires once focus actually leaves.
  await page.locator(id === 'packIR' ? '#wt' : '#packIR').focus();
  await page.waitForTimeout(260);
  const got = await page.inputValue('#' + id);
  check(`#${id} clamps ${typed} to ${want} on blur`, got === want, `${id} = ${got}`);
}
// the run bar's own two numeric fields are the ones a stage-scoped sanitiser
// never saw. Each is only visible in one objective mode, so ask for it there.
const modeWas = await page.evaluate(() => document.querySelector('#modePath').getAttribute('aria-pressed') === 'true' ? 'path' : 'sprint');
await page.click('#modePath');
await page.waitForTimeout(350);
await page.fill('#overhead', '99');
await page.locator('#packIR').focus();
await page.waitForTimeout(260);
check('#overhead clamps 99 to 30 on blur', (await page.inputValue('#overhead')) === '30', await page.inputValue('#overhead'));
await page.fill('#overhead', '1');
await page.click('#modeSprint');
await page.waitForTimeout(350);
await page.fill('#brakeFrac', '9');
await page.locator('#packIR').focus();
await page.waitForTimeout(260);
check('#brakeFrac clamps 9 to 1 on blur', (await page.inputValue('#brakeFrac')) === '1', await page.inputValue('#brakeFrac'));
await page.fill('#brakeFrac', '0.6');
await page.click(modeWas === 'path' ? '#modePath' : '#modeSprint');
await page.waitForTimeout(350);

// and the clamp must never fight somebody mid-keystroke: an out-of-range value
// still in progress survives every input event until focus actually leaves.
await page.evaluate(() => {
  const el = document.querySelector('#wt');
  el.focus();
  el.value = '4';                       // below the min of 5, but still being typed
  el.dispatchEvent(new Event('input', { bubbles: true }));
});
await page.waitForTimeout(260);
check('a half-typed number survives until blur', (await page.inputValue('#wt')) === '4', await page.inputValue('#wt'));
for (const [id] of FIELD_CLAMPS) await page.fill('#' + id, kept[id]);
await page.locator('#packIR').focus();
await page.waitForTimeout(400);
check('every clamped field goes back where it was',
  (await Promise.all(FIELD_CLAMPS.map(([id]) => page.inputValue('#' + id)))).every((v, i) => v === kept[FIELD_CLAMPS[i][0]]),
  JSON.stringify(kept));
check('the page still computes after all of that', /\d/.test(await page.textContent('#boardN')), await page.textContent('#boardN'));

// 14. RESET = the fresh-visit page, nothing less. Move a dozen things,
// including a stage, a custom cartridge ratio, the fuse and the objective,
// then demand the config come back byte-identical to the one captured on
// arrival. One DEFAULTS object drives both, so they cannot drift.
await page.selectOption('#mPreset', 'gb');
await page.waitForTimeout(500);
await openTune('motorTune');
await page.selectOption('#gbSel', 'custom');
await page.waitForTimeout(300);
await page.fill('#gbCustom', '17.5');
await page.fill('#wt', '44');
await page.fill('#mu', '1.15');
await page.fill('#crr', '0.02');
await page.fill('#cgH', '9');
await page.fill('#cgX', '7.5');
await page.fill('#voc', '12.2');
await page.fill('#packIR', '130');
await page.fill('#ilim', '30');
await page.fill('#tburst', '4');
await page.fill('#brakeFrac', '0.35');
await page.fill('#mFree', '5200');
await page.fill('#dist', '5.5');
await page.click('#modePath');
await page.waitForTimeout(400);
await page.fill('#overhead', '2.4');
await page.click('#modeSprint');
await page.click('#fuseHard');
await page.click('#basisDyno');
await page.click('#addStage');
await page.waitForTimeout(1200);
const cfgDirty = await cfgSnap();
const dirtyMoved = cfgDiff(FRESH, cfgDirty);
check('the mutation actually moved a dozen-plus things', dirtyMoved.length >= 12, `${dirtyMoved.length}: ${dirtyMoved.join(',')}`);
check('the mutation moved a stage, a custom ratio, the fuse and the objective',
  ['stages', 'gbCustom', 'fuse', 'mode', 'basis'].every((k) => dirtyMoved.includes(k)), dirtyMoved.join(','));
await page.click('#resetBtn');
await page.waitForTimeout(1400);
const cfgReset = await cfgSnap();
const resetLeft = cfgDiff(FRESH, cfgReset);
check('reset reproduces the fresh-load config exactly', resetLeft.length === 0, resetLeft.join(','));
check('reset empties the stage list', (await page.locator('#stageList .dt-stage-row').count()) === 0);
check('reset returns the objective to the simulator path', await page.evaluate(() =>
  document.querySelector('#modePath').classList.contains('is-active')));
check('reset returns the default preset chain', (await page.evaluate(() => document.querySelector('#pvSel').value)) === 'preload',
  await page.evaluate(() => document.querySelector('#pvSel').value));
check('reset clears the session banner', await page.evaluate(() => document.querySelector('#sessionNote').hidden));
check('reset returns 13.5 V', (await page.inputValue('#voc')) === '13.5', await page.inputValue('#voc'));
check('reset returns pack 100', (await page.inputValue('#packIR')) === '100', await page.inputValue('#packIR'));
check('reset returns 0.14 Ω', (await page.inputValue('#rint')) === '0.14', await page.inputValue('#rint'));
check('reset returns goBILDA 96 preset', (await page.evaluate(() => document.querySelector('#wPreset').value)) === 'gb96mec');
check('reset returns the stock cartridge', (await page.evaluate(() => document.querySelector('#gbSel').value)) === STOCK_GB,
  await page.evaluate(() => document.querySelector('#gbSel').value));
check('reset keeps the pins, which were explicit saves', (await page.locator('#pinBody tr').count()) > 0,
  String(await page.locator('#pinBody tr').count()));

// 14b. Simulate: the full field, preset chains and the custom path editor
const pvHash = () => page.evaluate(() => {
  const d = document.querySelector('#cPath').toDataURL();
  return d.slice(d.length >> 1, (d.length >> 1) + 220);
});
const pvSet = async (frac) => page.evaluate((f) => {
  const s = document.querySelector('#pvScrub');
  s.value = String(parseFloat(s.max) * f);
  s.dispatchEvent(new Event('input', { bubbles: true }));
}, frac);
const pvRead = (id) => page.evaluate((i) => parseFloat(document.querySelector('#' + i).textContent), id);
// Walk the whole chain and read the speed at each stop. Nothing is taken on
// trust from the page's own summary: these are the numbers a reader sees.
const pvSweep = async (n = 24) => {
  const out = [];
  for (let i = 0; i <= n; i++) {
    await pvSet(i / n);
    out.push({ v: await pvRead('pvV'), ph: (await page.textContent('#pvPhase')).trim() });
  }
  return out;
};

check('the sprint animator strip is gone', await page.evaluate(() => !document.querySelector('#cAnim') && !document.querySelector('#animPlay')));

await page.locator('.dt-sheet-sim').scrollIntoViewIfNeeded();
await page.waitForTimeout(600);
const pvOpts = await page.$$eval('#pvSel option', (o) => o.map((x) => x.value));
check('pvSel offers 3+ paths', pvOpts.length >= 3, `${pvOpts.length}: ${pvOpts.join(',')}`);
check('pvSel offers a custom path', pvOpts.includes('custom'), pvOpts.join(','));
check('the honest one-liner is visible', /real Pedro Pathing/.test(await page.textContent('.dt-honest')), (await page.textContent('.dt-honest')).trim().slice(0, 60));

// the field autoplays once when it scrolls into view, and keeps moving
const rolling = [];
for (let i = 0; i < 3; i++) { rolling.push(await pvRead('pvS')); if (i < 2) await page.waitForTimeout(400); }
check('field autoplays on scroll and keeps moving', rolling.every((v, i) => i === 0 || v > rolling[i - 1]) && rolling[2] > 0.5, `s ${rolling.join(' → ')}`);
await page.click('#pvPlay'); // pause, and hold it paused

// selecting another preset must repaint the field
await page.selectOption('#pvSel', pvOpts[0]);
await page.waitForTimeout(600);
const hash1 = await pvHash();
await page.selectOption('#pvSel', pvOpts[1]);
await page.waitForTimeout(600);
const hash2 = await pvHash();
check('preset 2 repaints the field canvas', hash1 !== hash2);
const code2 = await page.textContent('#pvCode');
check('code fold names a PathChain (preset)', code2.includes('PathChain'), code2.slice(0, 40));
check('code fold names a bezier (preset)', /BezierLine|BezierCurve/.test(code2));

// the fold tracks the selection
await page.selectOption('#pvSel', pvOpts[0]);
await page.waitForTimeout(600);
const code1 = await page.textContent('#pvCode');
check('code fold changes with the preset', code1 !== code2 && code1.includes('PathChain'));
check('total-time readout is live', (await pvRead('pvTotal')) > 0, await page.textContent('#pvTotal'));

// scrubbing moves the distance readout, and heading turns on a curved preset
await page.selectOption('#pvSel', 'motif');
await page.waitForTimeout(600);
await pvSet(0.1);
const s10 = await pvRead('pvS'), h10 = await pvRead('pvH');
await pvSet(0.9);
const s90 = await pvRead('pvS'), h90 = await pvRead('pvH');
check('pvScrub advances distance', s90 > s10, `${s10} -> ${s90}`);
check('heading turns along a curved chain', Math.abs(h90 - h10) > 5, `${h10} deg -> ${h90} deg`);

// The point of the whole rebuild: the chain is NOT one accel and one decel.
// A tight-curvature sample mid-chain must read strictly slower than a
// straight-run sample, and the speed must climb back afterwards.
const sweep = await pvSweep();
const interior = sweep.slice(3, -3).map((p) => p.v);
const vMax = Math.max(...interior);
let dipAt = -1;
for (let i = 1; i < interior.length - 1; i++) {
  if (interior[i] < interior[i - 1] && interior[i] < vMax * 0.75 && Math.max(...interior.slice(i + 1)) > interior[i] * 1.25) { dipAt = i; break; }
}
check('speed drops into a mid-chain corner and recovers', dipAt >= 0, `v ${sweep.map((p) => p.v.toFixed(0)).join(' ')}`);
check('the corner sample is strictly slower than the straight run', dipAt >= 0 && interior[dipAt] < vMax, `${dipAt >= 0 ? interior[dipAt].toFixed(1) : 'n/a'} vs ${vMax.toFixed(1)} in/s`);
check('the badge names the corner, not the motors, as what binds', sweep.slice(2, -2).some((p) => p.ph === 'turn-limited'), sweep.map((p) => p.ph).join(' | '));

// constant-heading preset must hold its heading instead
await page.selectOption('#pvSel', 'lace');
await page.waitForTimeout(600);
await pvSet(0.1);
const lh10 = await pvRead('pvH');
await pvSet(0.9);
const lh90 = await pvRead('pvH');
check('constant heading holds', Math.abs(lh90 - lh10) < 1, `${lh10} deg -> ${lh90} deg`);
check('chain ends at a stop', await page.evaluate(() => {
  const s = document.querySelector('#pvScrub');
  s.value = s.max; s.dispatchEvent(new Event('input', { bubbles: true }));
  return parseFloat(document.querySelector('#pvV').textContent) < 0.5
    && document.querySelector('#pvPhase').textContent === 'stopped';
}));

// play advances the distance readout on its own, and pause freezes it
await page.selectOption('#pvSel', 'decode');
await page.waitForTimeout(600);
check('a deliberate pause survives a preset change', (await pvRead('pvT')) === 0 && (await page.textContent('#pvPlay')).trim() === 'Play', await page.textContent('#pvPlay'));
await page.click('#pvRestart');
await page.waitForTimeout(500);
const play1 = await pvRead('pvS');
await page.waitForTimeout(500);
const play2 = await pvRead('pvS');
check('pvPlay drives the run', play2 > play1 && play1 > 0, `${play1} -> ${play2}`);
check('playing reads as Pause', (await page.textContent('#pvPlay')).trim() === 'Pause', await page.textContent('#pvPlay'));
await page.click('#pvPlay');
await page.waitForTimeout(150);
const froze = await pvRead('pvS');
await page.waitForTimeout(450);
check('pause freezes the chain', Math.abs((await pvRead('pvS')) - froze) < 0.05, `s stayed ${froze}`);
check('pvPlay toggles back to Play', (await page.textContent('#pvPlay')).trim() === 'Play', await page.textContent('#pvPlay'));

// 14b-i. the column leads with what is being watched: the chain's own time,
// length and leg count, not a paragraph.
const lead = await page.evaluate(() => ({
  t: parseFloat(document.querySelector('#pvTotal').textContent),
  len: parseFloat(document.querySelector('#pvLen').textContent),
  segs: parseInt(document.querySelector('#pvSegs').textContent, 10),
  model: document.querySelector('#pvLeadModel').textContent.trim(),
}));
check('the column leads with the chain time, length and leg count',
  lead.t > 0 && lead.len > 10 && lead.segs >= 1, JSON.stringify(lead));
check('the lead names the model it timed on', lead.model === 'grip envelope', lead.model);
// the decode preset is the eight-leg chain, so the leg count is real, not a
// hard-coded 1.
check('the leg count follows the chain', lead.segs === 8, String(lead.segs));

// 14b-ii. the speed strip: same profile, unrolled, with a playhead that
// tracks the animation.
const stripPx = () => page.evaluate(() => {
  const d = document.querySelector('#cSpeed').toDataURL();
  return d.slice(d.length >> 1, (d.length >> 1) + 220);
});
const stripBox = await page.evaluate(() => {
  const b = document.querySelector('#speedBox');
  const c = document.querySelector('#cSpeed');
  return { w: b.clientWidth, h: b.clientHeight, cw: c.width, ch: c.height };
});
check('the speed strip has a sized box and buffer',
  stripBox.h >= 140 && stripBox.w > 200 && stripBox.cw >= stripBox.w && stripBox.ch >= stripBox.h,
  JSON.stringify(stripBox));
await pvSet(0.15);
const strip15 = await stripPx();
await pvSet(0.75);
const strip75 = await stripPx();
check('the speed strip playhead moves with the scrub', strip15 !== strip75);
await page.click('#pvRestart');
await page.waitForTimeout(350);
const strand0 = await stripPx();
await page.waitForTimeout(600);
const strand1 = await stripPx();
check('the speed strip playhead advances during playback', strand0 !== strand1);
await page.click('#pvPlay');
// The caption names both axes and says what the marked stretches mean. It no
// longer names a colour: a mark that is identified by hue alone disappears in
// greyscale and for a colourblind reader, so the caption points at the MARK.
check('the strip caption names both axes and what the marks mean',
  /in\/s/.test(await page.textContent('.dt-strip-cap'))
  && /\(in\)/.test(await page.textContent('.dt-strip-cap'))
  && /marked stretches/.test(await page.textContent('.dt-strip-cap'))
  && /corner, not the motors/.test(await page.textContent('.dt-strip-cap')),
  (await page.textContent('.dt-strip-cap')).trim().slice(0, 70));

// 14b-iii. the badge key replaces the paragraph, and it follows the model.
const keyOf = () => page.$$eval('#pvKey span', (s) => s.map((x) => x.textContent.trim()));
const gripKey = await keyOf();
check('the badge has a compact key, not a paragraph',
  gripKey.length >= 4 && gripKey.some((k) => /turn-limited/.test(k)) && gripKey.some((k) => /at top speed/.test(k)),
  gripKey.join(' | '));
check('no phase paragraph survives in the column',
  await page.evaluate(() => !/The badge names what is binding/.test(document.querySelector('.dt-path-side').textContent)));

// 14b-iv. the two speed models are explained where the toggle lives
const models = await page.evaluate(() => ({
  grip: document.querySelector('#pvModelGrip').textContent.replace(/\s+/g, ' ').trim(),
  follow: document.querySelector('#pvModelFollow').textContent.replace(/\s+/g, ' ').trim(),
  gap: document.querySelector('.dt-models-gap').textContent.replace(/\s+/g, ' ').trim(),
  on: document.querySelector('#pvModelGrip').dataset.on,
  off: document.querySelector('#pvModelFollow').dataset.on,
}));
check('the grip model is explained in plain words',
  /drivetrain can hold/.test(models.grip) && /traction limit/.test(models.grip) && /gearing/.test(models.grip), models.grip);
check('the follower model is explained in plain words',
  /full power/i.test(models.follow) && /stopping distance/.test(models.follow) && /grip exceeded/.test(models.follow), models.follow);
check('the gap between the times is named as the margin', /margin the real follower is spending/.test(models.gap), models.gap);
check('the live model is the lit one', models.on === 'true' && models.off === 'false', `${models.on}/${models.off}`);
check('the model note sits with the toggle, above the field',
  await page.evaluate(() => !!document.querySelector('.dt-path-pick + .dt-models')));

// 14b-v. the reference prose is folded and shut on arrival
check('the simulate reference material ships folded',
  await page.evaluate(() => [...document.querySelectorAll('.dt-sheet-sim details.dt-fold')].every((d) => !d.open)));
check('the Pedro coordinate note lives in a fold', await page.evaluate(() => {
  const f = [...document.querySelectorAll('.dt-sheet-sim details.dt-fold')]
    .find((d) => /Pedro coordinates/.test(d.textContent));
  return !!f && /141\.5/.test(f.textContent);
}));
check('the simulate column carries no loose paragraph', await page.evaluate(() =>
  !document.querySelector('.dt-path-side p.dt-hint')));

// the follower-style model is a different shape, and says so
const gripT = await pvRead('pvTotal');
await page.click('#pvModeFollow');
await page.waitForTimeout(800);
const followT = await pvRead('pvTotal');
check('follower-style finishes sooner than the grip envelope', followT < gripT, `${gripT} s -> ${followT} s`);
check('follower-style summary says so', /follower-style/.test(await page.textContent('#srPath')), (await page.textContent('#srPath')).slice(-40));
const followKey = await keyOf();
check('the badge key follows the model', followKey.some((k) => /zero-power braking/.test(k)) && !followKey.some((k) => /turn-limited/.test(k)), followKey.join(' | '));
check('the lead names the follower model', (await page.textContent('#pvLeadModel')).trim() === 'follower-style');
check('the follower note lights up when it is live', await page.evaluate(() =>
  document.querySelector('#pvModelFollow').dataset.on === 'true'
  && document.querySelector('#pvModelGrip').dataset.on === 'false'));
const followPhases = [];
for (let i = 1; i <= 8; i++) { await pvSet(i / 10); followPhases.push(await page.textContent('#pvPhase')); }
check('follower-style flags where grip runs out', followPhases.some((p) => /grip exceeded/.test(p)), followPhases.join(' | '));
await page.click('#pvModeGrip');
await page.waitForTimeout(700);
check('back on the grip envelope', near(await pvRead('pvTotal'), gripT, 0.02), `${await pvRead('pvTotal')} vs ${gripT}`);

// config changes must re-drive the path numbers
const beforeCfg = await pvRead('pvTotal');
await page.fill('#voc', '11.8');
await page.waitForTimeout(700);
const afterCfg = await pvRead('pvTotal');
check('a flatter battery slows the chain', afterCfg > beforeCfg, `${beforeCfg} s -> ${afterCfg} s`);
await page.fill('#voc', '13.5');
await page.waitForTimeout(600);

// 14c. the custom path editor: real 2.1.2 pathBuilder syntax
await page.selectOption('#pvSel', 'custom');
await page.waitForTimeout(500);
check('choosing custom reveals the editor', !(await page.evaluate(() => document.querySelector('#pvEditor').hidden)));

const CUSTOM = `private final Pose start = new Pose(12, 24, Math.toRadians(0));
private final Pose corner = new Pose(72, 96, Math.toRadians(90));
private final Pose finish = new Pose(132, 36, Math.toRadians(-45));

follower.pathBuilder()
        .addPath(new BezierCurve(start, new Pose(20, 108), corner))
        .setLinearHeadingInterpolation(start.getHeading(), corner.getHeading())
        .addPath(new BezierLine(corner, finish))
        .setLinearHeadingInterpolation(corner.getHeading(), finish.getHeading())
        .build();`;
await page.fill('#pvSrcText', CUSTOM);
await page.click('#pvLoad');
await page.waitForTimeout(800);
check('custom chain parses', /2 paths parsed/.test(await page.textContent('#pvMsg')), await page.textContent('#pvMsg'));
check('custom chain has a time', (await pvRead('pvTotal')) > 0.5, await page.textContent('#pvTotal'));
const cCode = await page.textContent('#pvCode');
check('code fold names a PathChain (custom)', cCode.includes('PathChain'), cCode.slice(0, 40));
check('code fold names a bezier (custom)', /BezierLine/.test(cCode) && /BezierCurve/.test(cCode));
check('custom export is 2.x Pose syntax, never Point', /new Pose\(/.test(cCode) && !/new Point\(/.test(cCode));
await pvSet(0);
const cs0 = await pvRead('pvS');
await page.click('#pvPlay');
await page.waitForTimeout(900);
const cs1 = await pvRead('pvS');
await page.waitForTimeout(500);
const cs2 = await pvRead('pvS');
await page.click('#pvPlay');
check('custom chain drives the robot forward', cs1 > cs0 && cs2 > cs1, `${cs0} → ${cs1} → ${cs2}`);

// the error path has to name the line and say what was expected
await page.fill('#pvSrcText', CUSTOM.replace('new BezierLine(corner, finish)', 'new BezierLine(corner)'));
await page.waitForTimeout(800);
const errMsg = await page.textContent('#pvMsg');
check('a syntax error names its line', /^line \d+:/.test(errMsg.trim()), errMsg);
check('a syntax error says what was expected', /BezierLine takes exactly 2 poses/.test(errMsg), errMsg);
check('a broken paste leaves the last good chain up', (await pvRead('pvTotal')) > 0.5, await page.textContent('#pvTotal'));
await page.fill('#pvSrcText', 'not a chain at all');
await page.waitForTimeout(800);
check('unreadable text gets a readable message', /^line 1: no Pedro chain here/.test((await page.textContent('#pvMsg')).trim()), await page.textContent('#pvMsg'));

// a .pp save file from the official visualiser loads directly
const PP = JSON.stringify({
  startPoint: { x: 20, y: 20, heading: 'linear', startDeg: 0, endDeg: 90 },
  lines: [
    { id: 'a', endPoint: { x: 70, y: 96, heading: 'linear', startDeg: 0, endDeg: 90 }, controlPoints: [{ x: 64, y: 20 }], color: '#22c55e' },
    { id: 'b', endPoint: { x: 124, y: 40, heading: 'constant', degrees: 45 }, controlPoints: [], color: '#22c55e' },
  ],
});
await page.fill('#pvSrcText', PP);
await page.waitForTimeout(800);
check('a .pp file loads', /2 paths parsed/.test(await page.textContent('#pvMsg')), await page.textContent('#pvMsg'));
check('.pp degrees come back out as radians', /Math\.toRadians\(90\.0\)/.test(await page.textContent('#pvCode')), (await page.textContent('#pvCode')).slice(0, 200));

// custom chains persist across reloads, and never ride in a pin or a share link
await page.fill('#pvSrcText', CUSTOM);
await page.waitForTimeout(800);
const persistedT = await pvRead('pvTotal');
const payloads = await page.evaluate(() => {
  document.querySelector('#pinBtn').click();
  const cfg = localStorage.getItem('dt-cfg') || '';
  const share = document.querySelector('[data-share]');
  return { cfg, share: share ? share.outerHTML : '', custom: localStorage.getItem('dt-sim-path') || '' };
});
check('the custom chain is saved under its own key', /BezierCurve/.test(payloads.custom), payloads.custom.slice(0, 60));
check('the custom chain never enters the pin/config payload', !/BezierCurve|pathBuilder|pvSrcText/.test(payloads.cfg));
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1400);
check('custom chain survives a reload', (await page.evaluate(() => document.querySelector('#pvSel').value)) === 'custom'
  && near(await pvRead('pvTotal'), persistedT, 0.05), `${await page.textContent('#pvTotal')} vs ${persistedT}`);
check('the editor comes back with the text in it', /BezierCurve/.test(await page.inputValue('#pvSrcText')));
await page.evaluate(() => localStorage.removeItem('dt-sim-path'));

// 14d. reduced motion never autoplays, but the controls still drive the chain
{
  const rmCtx = await browser.newContext({ viewport: { width: 1366, height: 950 }, reducedMotion: 'reduce' });
  const rm = await rmCtx.newPage();
  await rm.goto(BASE + '/drivetrain/', { waitUntil: 'networkidle' });
  await rm.waitForTimeout(900);
  await rm.locator('.dt-sheet-sim').scrollIntoViewIfNeeded();
  await rm.waitForTimeout(1300);
  check('reduced motion does not autoplay', parseFloat(await rm.textContent('#pvT')) === 0 && (await rm.textContent('#pvPlay')).trim() === 'Play', `t=${await rm.textContent('#pvT')}`);
  await rm.click('#pvPlay');
  const rmS = [];
  for (let i = 0; i < 3; i++) { if (i) await rm.waitForTimeout(400); rmS.push(parseFloat(await rm.textContent('#pvS'))); }
  check('reduced motion click-to-play drives the chain', rmS.every((v, i) => i === 0 || v > rmS[i - 1]), `s ${rmS.join(' → ')}`);
  await rmCtx.close();
}
// a config edit must not strand the robot on the start line
{
  const reCtx = await browser.newContext({ viewport: { width: 1366, height: 950 } });
  const re = await reCtx.newPage();
  await re.goto(BASE + '/drivetrain/', { waitUntil: 'networkidle' });
  await re.waitForTimeout(900);
  await re.locator('.dt-sheet-sim').scrollIntoViewIfNeeded();
  await re.waitForTimeout(3600); // let the first run finish
  check('the chain finishes and offers a replay', (await re.textContent('#pvPlay')).trim() === 'Replay', await re.textContent('#pvPlay'));
  await re.evaluate(() => { const w = document.querySelector('#wt'); w.value = '30'; w.dispatchEvent(new Event('input', { bubbles: true })); });
  await re.waitForTimeout(500);
  const edited = [];
  for (let i = 0; i < 3; i++) { if (i) await re.waitForTimeout(400); edited.push(parseFloat(await re.textContent('#pvS'))); }
  check('editing after a finished run replays it', edited.every((v, i) => i === 0 || v > edited[i - 1]), `s ${edited.join(' → ')}`);
  await reCtx.close();
}

// 14d. THE FIGURE HOUSE STYLE, read off the actual pixels.
// Every canvas on this page is drawn to one set of rules, and the rules that
// matter to a reader are checkable: both axes carry a spelled-out quantity
// with its unit, the frame is an L with no tick marks and no surrounding box,
// a measured point is OPEN where a modelled point is FILLED so the pair
// survives a greyscale printout, and none of it disturbs the layout.
{
  const fp = await browser.newPage({ viewport: { width: 1366, height: 950 } });
  await fp.goto(BASE + '/drivetrain/', { waitUntil: 'networkidle' });
  await fp.waitForTimeout(1200);
  // An encoder log, deliberately well below the modelled curve so the two
  // kinds of mark can be probed without one sitting on the other.
  await fp.evaluate(() => {
    const rows = [];
    for (let i = 0; i <= 22; i++) {
      const t = i * 0.06;
      rows.push(`${t.toFixed(2)},${(3.3 * (1 - Math.exp(-t / 0.34)) * 0.62).toFixed(3)}`);
    }
    const ta = document.querySelector('#csvText');
    ta.value = 't,v\n' + rows.join('\n');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await fp.waitForTimeout(900);
  await fp.locator('.dt-sheet-sim').scrollIntoViewIfNeeded();
  await fp.waitForTimeout(1400);

  // The five x-y plots share the L-frame. The field is a scale drawing whose
  // outer rule IS the field wall, so it is checked separately below.
  const PLOTS = ['cSweep', 'cProfile', 'cForce', 'cAmp', 'cSpeed'];
  // One readback per canvas: the axis titles it drew, its plot rectangle, its
  // buffer scale, and ink counts in the four places the house style says
  // something must or must not be.
  const readFigure = (id) => fp.evaluate((i) => {
    const cv = document.querySelector('#' + i);
    if (!cv || !cv.dataset.plot) return null;
    const dpr = cv.width / cv.clientWidth;
    const g = cv.getContext('2d');
    const [l, t, w, h] = cv.dataset.plot.split(',').map(Number);
    const px = (x, y) => {
      const d = g.getImageData(Math.round(x * dpr), Math.round(y * dpr), 1, 1).data;
      return [d[0], d[1], d[2]];
    };
    // The figure paints its own surface, so the top-left corner IS the
    // background every other pixel is compared against.
    const bg = px(2, 2);
    const diff = (c) => Math.max(Math.abs(c[0] - bg[0]), Math.abs(c[1] - bg[1]), Math.abs(c[2] - bg[2]));
    const inked = (x, y) => diff(px(x, y)) > 60;
    const countCol = (x, y0, y1) => { let n = 0, tot = 0; for (let y = y0; y <= y1; y++) { tot++; if (inked(x, y)) n++; } return { n, tot }; };
    const countRow = (y, x0, x1) => { let n = 0, tot = 0; for (let x = x0; x <= x1; x++) { tot++; if (inked(x, y)) n++; } return { n, tot }; };
    // The gutter between an axis line and its labels. On a plot the tick
    // labels are right-aligned ending 9 px out and the tick row starts 10 px
    // down; on the field the coordinates clear the wall by 6 px. Either way
    // the band below holds a tick mark and nothing else.
    const near = i === 'cPath' ? 2 : 3;
    const far = i === 'cPath' ? 4 : 8;
    let gutterY = 0;
    for (let x = Math.round(l) - far; x <= Math.round(l) - near; x++) gutterY += countCol(x, Math.round(t) + 2, Math.round(t + h) - 2).n;
    let gutterX = 0;
    for (let y = Math.round(t + h) + near; y <= Math.round(t + h) + far; y++) gutterX += countRow(y, Math.round(l) + 2, Math.round(l + w) - 2).n;
    return {
      axisX: cv.dataset.axisX || '', axisY: cv.dataset.axisY || '',
      coords: cv.dataset.coords || '', scaleBar: cv.dataset.scaleBar || '',
      dpr, plot: [l, t, w, h],
      box: [cv.clientWidth, cv.clientHeight],
      axisLeft: countCol(Math.round(l), Math.round(t) + 4, Math.round(t + h) - 4),
      axisBottom: countRow(Math.round(t + h), Math.round(l) + 4, Math.round(l + w) - 4),
      rightEdge: countCol(Math.round(l + w), Math.round(t) + 4, Math.round(t + h) - 4),
      topEdge: countRow(Math.round(t), Math.round(l) + 4, Math.round(l + w) - 4),
      gutterY, gutterX,
    };
  }, id);

  const axesOk = (f, id) => {
    // Axis titles: a spelled-out quantity with its unit in brackets. A bare
    // symbol or a bare unit is not enough for a judge reading alone.
    check(`#${id}: x axis is a named quantity with a unit`,
      /^[a-z][a-z µ-]+\([^()]+\)$/.test(f.axisX), f.axisX);
    check(`#${id}: y axis is a named quantity with a unit`,
      /^[a-z][a-z µ/-]+\([^()]+\)$/.test(f.axisY), f.axisY);
    check(`#${id}: the y axis line is drawn`, f.axisLeft.n > f.axisLeft.tot * 0.8, JSON.stringify(f.axisLeft));
    check(`#${id}: the x axis line is drawn`, f.axisBottom.n > f.axisBottom.tot * 0.8, JSON.stringify(f.axisBottom));
    check(`#${id}: no tick marks outside the y axis`, f.gutterY === 0, `${f.gutterY} inked px`);
    check(`#${id}: no tick marks under the x axis`, f.gutterX === 0, `${f.gutterX} inked px`);
    check(`#${id}: the buffer is capped at 2x`, f.dpr > 0 && f.dpr <= 2.001, String(f.dpr));
  };

  for (const id of PLOTS) {
    const f = await readFigure(id);
    check(`figure #${id} reports what it drew`, !!f, String(f));
    if (!f) continue;
    axesOk(f, id);
    // The L: two axis lines and nothing else. The box that used to surround
    // the plot carried no data and is gone.
    check(`#${id}: no box rule down the right of the plot`,
      f.rightEdge.n < f.rightEdge.tot * 0.25, JSON.stringify(f.rightEdge));
    check(`#${id}: no box rule across the top of the plot`,
      f.topEdge.n < f.topEdge.tot * 0.25, JSON.stringify(f.topEdge));
  }

  // The field is a dimensioned plan view: its outer rule is the 144 in wall,
  // which is data, so it keeps all four sides. What it owes a reader instead
  // is a coordinate on each axis and a scale bar.
  {
    const f = await readFigure('cPath');
    check('figure #cPath reports what it drew', !!f, String(f));
    if (f) {
      axesOk(f, 'cPath');
      check('#cPath: the field wall is closed on all four sides',
        f.rightEdge.n > f.rightEdge.tot * 0.8 && f.topEdge.n > f.topEdge.tot * 0.8,
        JSON.stringify({ right: f.rightEdge, top: f.topEdge }));
      check('#cPath: the plan view is square, as the field is', Math.abs(f.plot[2] - f.plot[3]) <= 1, f.plot.join(','));
      check('#cPath: it labels a coordinate at each end and the middle', f.coords === '0 72 144', f.coords);
      check('#cPath: it carries a scale bar', f.scaleBar === '24 in', f.scaleBar);
    }
  }

  // (4) measured versus modelled, by SHAPE. A measured point is an open
  // circle and a modelled one is filled, so the centre of the first is the
  // figure's own background and the centre of the second is not. This is the
  // distinction that survives greyscale, and it is read here off pixels.
  const shapeProbe = await fp.evaluate(() => {
    const read = (id, key) => {
      const cv = document.querySelector('#' + id);
      const raw = cv && cv.dataset[key];
      if (!raw) return null;
      const dpr = cv.width / cv.clientWidth;
      const g = cv.getContext('2d');
      const [cx, cy, r] = raw.split(',').map(Number);
      const at = (x, y) => { const d = g.getImageData(Math.round(x * dpr), Math.round(y * dpr), 1, 1).data; return [d[0], d[1], d[2]]; };
      const bg = at(2, 2);
      const dif = (c) => Math.max(Math.abs(c[0] - bg[0]), Math.abs(c[1] - bg[1]), Math.abs(c[2] - bg[2]));
      let ring = 0;
      for (let k = 0; k < 8; k++) ring += dif(at(cx + r * Math.cos(k * Math.PI / 4), cy + r * Math.sin(k * Math.PI / 4))) > 60 ? 1 : 0;
      return { centre: dif(at(cx, cy)), ring, r };
    };
    return { meas: read('cProfile', 'probeMeasured'), model: read('cSweep', 'probeModelled') };
  });
  check('a measured point is drawn as an OPEN circle',
    !!shapeProbe.meas && shapeProbe.meas.centre <= 60 && shapeProbe.meas.ring >= 5, JSON.stringify(shapeProbe.meas));
  check('a modelled point is drawn as a FILLED mark',
    !!shapeProbe.model && shapeProbe.model.centre > 60, JSON.stringify(shapeProbe.model));
  check('measured and modelled marks differ in the one place a reader looks',
    !!shapeProbe.meas && !!shapeProbe.model && (shapeProbe.model.centre > 60) !== (shapeProbe.meas.centre > 60),
    JSON.stringify(shapeProbe));

  // (5) chart size stability. The fixed-height boxes are the fix for an old
  // shrink bug: a redraw resizes a BUFFER, never a box, so nothing a reader
  // can do may move one.
  const boxes = () => fp.evaluate(() => [...document.querySelectorAll('.dt-chartbox')]
    .map((b) => `${b.clientWidth}x${b.clientHeight}`).join(' '));
  const before = await boxes();
  await fp.click('#modeSprint'); await fp.waitForTimeout(400);
  await fp.click('#modePath'); await fp.waitForTimeout(400);
  await fp.selectOption('#pvSel', 'decode'); await fp.waitForTimeout(900);
  await fp.evaluate(() => {
    const s = document.querySelector('#pvScrub');
    s.value = String(parseFloat(s.max) * 0.6);
    s.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await fp.waitForTimeout(500);
  await fp.selectOption('#pvSel', 'preload'); await fp.waitForTimeout(900);
  const after = await boxes();
  check('no redraw ever moves a chart box', before === after, `${before} → ${after}`);
  const buffers = await fp.evaluate(() => [...document.querySelectorAll('.dt-chartbox canvas')]
    .filter((c) => c.clientWidth > 0)
    .map((c) => ({ id: c.id, sx: +(c.width / c.clientWidth).toFixed(3), sy: +(c.height / c.clientHeight).toFixed(3) })));
  check('every buffer matches its box at a capped ratio',
    buffers.length >= 5 && buffers.every((b) => b.sx > 0 && b.sx <= 2.001 && b.sy > 0 && b.sy <= 2.001),
    JSON.stringify(buffers));
  await fp.close();
}

// 15. overflow + mobile
for (const w of [320, 375, 390, 768, 1366]) {
  const p2 = await browser.newPage({ viewport: { width: w, height: 900 } });
  await p2.goto(BASE + '/drivetrain/', { waitUntil: 'networkidle' });
  await p2.waitForTimeout(800);
  const over = await p2.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(`no h-overflow at ${w}px`, over <= 1, `overflow ${over}px`);
  if (w === 375) await p2.screenshot({ path: OUT + '/dt-mobile.png', fullPage: false });
  if (w === 390) {
    // Phone: the row stacks, and every block takes the whole column.
    // Measured border-box to border-box: a figure is defined by a 1px rule
    // now, not by a shadow, so its CONTENT box is 2px narrower than the row it
    // fills. "Full width" is the outer edge landing on the row's edge.
    const stacked = await p2.evaluate(() => {
      const figs = [...document.querySelectorAll('.dt-two > figure')];
      return {
        row: document.querySelector('.dt-two').clientWidth,
        cards: figs.map((f) => f.offsetWidth),
        boxes: figs.map((f) => f.querySelector('.dt-chartbox').clientWidth),
        heights: figs.map((f) => f.querySelector('.dt-chartbox').clientHeight),
      };
    });
    check('mobile stacks the chart blocks full width',
      new Set(stacked.cards).size === 1 && stacked.cards[0] === stacked.row, JSON.stringify(stacked));
    check('mobile chart boxes stay equal',
      new Set(stacked.boxes).size === 1 && new Set(stacked.heights).size === 1, JSON.stringify(stacked));
    // The simulate column stacks under the field and stays inside it: nothing
    // in there may push its own scrollbar or spill past the sheet.
    const col = await p2.evaluate(() => {
      const side = document.querySelector('.dt-path-side');
      const main = document.querySelector('.dt-path-main');
      const sheet = document.querySelector('.dt-sheet-sim');
      const sr = side.getBoundingClientRect(), fr = sheet.getBoundingClientRect();
      const wide = [...side.querySelectorAll('*')]
        .filter((e) => e.scrollWidth - e.clientWidth > 1)
        .map((e) => e.className || e.tagName);
      return {
        stacked: side.getBoundingClientRect().top > main.getBoundingClientRect().top,
        spill: Math.round(Math.max(sr.right - fr.right, fr.left - sr.left)),
        strip: document.querySelector('#speedBox').clientHeight,
        wide,
      };
    });
    check('the simulate column stacks under the field at 390', col.stacked, JSON.stringify(col));
    check('the simulate column has no overflow at 390',
      col.spill <= 1 && col.wide.length === 0, JSON.stringify(col));
    check('the speed strip keeps a readable height at 390', col.strip >= 140, String(col.strip));
  }
  await p2.close();
}

// 16. LAYOUT. The results ledger as one squared grid, the board's leading with
// its fold open, and the whole page across every screen size it has to work
// at. Every claim here is a measured box, never an eyeballed one.
{
  const layoutPage = async (w, h = 950) => {
    const p = await browser.newPage({ viewport: { width: w, height: h } });
    await p.goto(BASE + '/drivetrain/', { waitUntil: 'networkidle' });
    await p.evaluate(() => localStorage.clear());
    await p.reload({ waitUntil: 'networkidle' });
    await p.waitForTimeout(1100);
    // [data-reveal] blocks sit at opacity 0 until they are scrolled past, and
    // an unrevealed block still lays out, but scrolling first keeps the shot
    // and the measurement describing the same page.
    await p.evaluate(async () => {
      const H = document.body.scrollHeight;
      for (let y = 0; y < H; y += 400) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 8)); }
      window.scrollTo(0, 0);
    });
    await p.waitForTimeout(350);
    return p;
  };

  // 16a. THE SQUARED LEDGER. Equal widths across a row, equal heights within
  // one, headers on a single rule, and the same internal rhythm whether a
  // cluster holds two rows or three. Stopping is present only when the leg
  // ends at a stop, so both states are measured.
  for (const w of [1366, 768]) {
    for (const stop of [true, false]) {
      const p = await layoutPage(w);
      await p.click('#modeSprint');
      await p.waitForTimeout(900);
      if (!stop) { await p.uncheck('#stopEnd'); await p.waitForTimeout(900); }
      const g = await p.evaluate(() => {
        const R = (el) => { const b = el.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, w: b.width, h: b.height }; };
        const cards = [...document.querySelectorAll('#stats .dt-cluster')].map((c) => {
          const b = R(c);
          const rows = [...c.querySelectorAll('.dt-stat')].map((s) => s.getBoundingClientRect().top - b.t);
          return {
            name: c.querySelector('.dt-cluster-h').textContent.trim(),
            l: Math.round(b.l), r: Math.round(b.r), t: Math.round(b.t),
            w: Math.round(b.w), h: Math.round(b.h),
            hdr: Math.round(c.querySelector('.dt-cluster-h').getBoundingClientRect().top - b.t),
            n: rows.length,
            first: Math.round(rows[0]),
            pitch: rows.length > 1 ? Math.round(rows[1] - rows[0]) : null,
            keys: [...c.querySelectorAll('.dt-stat .k')].map((k) => k.textContent.trim().toLowerCase()),
          };
        });
        const stats = R(document.querySelector('#stats'));
        const groups = [...document.querySelectorAll('#stats .dt-grouph')].map((h) => ({
          name: h.querySelector('b').textContent.trim().toLowerCase(),
          sub: h.querySelector('span').textContent.trim(),
          t: Math.round(R(h).t), l: Math.round(R(h).l), r: Math.round(R(h).r),
        }));
        return { cards, groups, lead: R(document.querySelector('.dt-stat-lead')), stats };
      });
      const at = `${w}, stopping ${stop ? 'present' : 'absent'}`;
      const span = (xs) => Math.max(...xs) - Math.min(...xs);
      // rows of the rank, keyed on the top edge the cards share
      const rows = [...new Set(g.cards.map((c) => c.t))].sort((a, b) => a - b)
        .map((t) => g.cards.filter((c) => Math.abs(c.t - t) <= 1));

      // THE DATASHEET SPLIT. Two groups, in this order, and every card in the
      // one its number belongs to: a hard limit is a boundary the robot must
      // not cross, an operating figure is what it does inside them.
      check(`ledger: two labelled groups, limits before operation at ${at}`,
        g.groups.length === 2 && /hard limits/.test(g.groups[0].name)
        && /expected operation/.test(g.groups[1].name) && g.groups[0].t < g.groups[1].t,
        g.groups.map((x) => x.name).join(' | '));
      check(`ledger: each group says in words what kind of number it holds at ${at}`,
        /cross one/i.test(g.groups[0].sub) && /stays inside/i.test(g.groups[1].sub),
        g.groups.map((x) => x.sub).join(' | '));
      check(`ledger: a group band spans the whole ledger at ${at}`,
        g.groups.every((x) => Math.abs(x.l - g.stats.l) <= 1 && Math.abs(x.r - g.stats.r) <= 1),
        g.groups.map((x) => `${x.l}-${x.r}`).join(' ') + ` vs ${Math.round(g.stats.l)}-${Math.round(g.stats.r)}`);
      // the three ceilings, and nothing else, sit above the second band
      const limitCards = g.cards.filter((c) => c.t < g.groups[1].t).flatMap((c) => c.keys);
      const runCards = g.cards.filter((c) => c.t > g.groups[1].t).flatMap((c) => c.keys);
      check(`ledger: the limits group holds the traction, fuse and tipping rows at ${at}`,
        limitCards.length === 3
        && limitCards.some((k) => k.includes('push force'))
        && limitCards.some((k) => k.includes('launch draw'))
        && limitCards.some((k) => k.includes('tip margin')),
        limitCards.join(','));
      check(`ledger: no operating figure is filed as a limit at ${at}`,
        ['launch accel', '90%', 'top speed', 'free speed', 'accel tax']
          .every((k) => runCards.some((r) => r.includes(k)))
        && (!stop || ['stopping distance', 'cost of stopping'].every((k) => runCards.some((r) => r.includes(k)))),
        runCards.join(','));

      check(`ledger: the rank holds ${stop ? 4 : 3} clusters at ${at}`,
        g.cards.length === (stop ? 4 : 3), g.cards.map((c) => c.name).join(','));
      check(`ledger: every card in a row is the same height at ${at}`,
        rows.every((r) => span(r.map((c) => c.h)) <= 1),
        rows.map((r) => r.map((c) => `${c.name} ${c.h}`).join(' ')).join(' / '));
      check(`ledger: every card in a row is the same width at ${at}`,
        rows.every((r) => span(r.map((c) => c.w)) <= 1),
        rows.map((r) => r.map((c) => `${c.name} ${c.w}`).join(' ')).join(' / '));
      check(`ledger: every cluster header sits on the same rule of its card at ${at}`,
        span(g.cards.map((c) => c.hdr)) <= 1, g.cards.map((c) => c.hdr).join(','));
      // the whole point of squaring: a two-row cluster is as tall as a
      // three-row one beside it, and gets there without stretching its rows.
      check(`ledger: a short cluster keeps the tall one's internal rhythm at ${at}`,
        span(g.cards.map((c) => c.first)) <= 1
        && span(g.cards.map((c) => c.pitch).filter((v) => v !== null)) <= 1,
        g.cards.map((c) => `${c.name} ${c.first}/${c.pitch}`).join(' '));
      // no orphan: the last row of the rank finishes on the ledger's own edge
      check(`ledger: the rank never ends on a stranded cell at ${at}`,
        rows.every((r) => Math.abs(Math.max(...r.map((c) => c.r)) - g.stats.r) <= 1),
        rows.map((r) => Math.round(Math.max(...r.map((c) => c.r)))).join(',') + ` vs ${Math.round(g.stats.r)}`);
      // the lead plate and its gauge are in the same grid, not bolted beside it
      check(`ledger: the lead plate spans the ledger at ${at}`,
        Math.abs(g.lead.w - g.stats.w) <= 1 && Math.abs(g.lead.l - g.stats.l) <= 1,
        `${Math.round(g.lead.l)}+${Math.round(g.lead.w)} vs ${Math.round(g.stats.l)}+${Math.round(g.stats.w)}`);
      check(`ledger: the rank sits square under the lead plate at ${at}`,
        Math.abs(Math.min(...g.cards.map((c) => c.l)) - g.stats.l) <= 1
        && Math.abs(Math.max(...g.cards.map((c) => c.r)) - g.stats.r) <= 1);
      if (w === 1366 && stop) await p.locator('#stats').screenshot({ path: OUT + '/dt11-stats.png' });
      if (w === 1366 && !stop) await p.locator('#stats').screenshot({ path: OUT + '/dt11-stats-nostop.png' });
      await p.close();
    }
  }

  // 16b. THE BOARD'S LEADING. The scoring fold spans the whole left column, so
  // opening it used to hand its extra height to the four rows beside it and
  // space the verdict out. Gaps are compared shut against open, in the REV
  // same-size-swap state, which is where the fold runs three paragraphs.
  {
    const p = await layoutPage(1366);
    await p.selectOption('#mPreset', 'rev');
    await p.waitForTimeout(1300);
    const IDS = ['boardN', 'boardRecipe', 'boardS', 'boardProv', 'boardIdeal'];
    const lines = () => p.evaluate((ids) => {
      const out = {};
      ids.forEach((i) => { const b = document.querySelector('#' + i).getBoundingClientRect(); out[i] = { t: b.top, b: b.bottom }; });
      const board = document.querySelector('#board');
      const cs = getComputedStyle(board);
      const why = document.querySelector('#boardWhy');
      const ideal = document.querySelector('#boardIdeal');
      const alt = document.querySelector('#boardAlt');
      // The board is a card of paper tilted a fraction of a degree, and a
      // rotated box reports an inflated client rect, so vertical extents are
      // read off the untransformed layout boxes instead.
      // A rotated element is its own offset parent in this engine, so the
      // children measure from the board when it is tilted and from the shared
      // ancestor when the tilt is flattened.
      const inBoard = (el) => (el.offsetParent === board ? el.offsetTop : el.offsetTop - board.offsetTop);
      const r = why.getBoundingClientRect();
      return {
        rows: out,
        why: { t: r.top, b: r.bottom },
        foldFoot: inBoard(why) + why.offsetHeight,
        idealFoot: inBoard(ideal) + ideal.offsetHeight,
        foot: board.offsetHeight - parseFloat(cs.paddingBottom),
        altHidden: alt.hidden,
      };
    }, IDS);
    const gaps = (m) => IDS.slice(1).map((id, k) => Math.round(m.rows[id].t - m.rows[IDS[k]].b));
    const shut = await lines();
    await p.click('#boardWhy summary');
    await p.waitForTimeout(500);
    const open = await lines();
    const gShut = gaps(shut), gOpen = gaps(open);
    check('board: the verdict keeps its leading when the fold opens at 1366',
      gOpen.every((v, k) => Math.abs(v - gShut[k]) <= 1), `shut ${gShut} open ${gOpen}`);
    check('board: the open fold is genuinely taller than the shut one',
      open.why.b - open.why.t > (shut.why.b - shut.why.t) + 40,
      `${Math.round(shut.why.b - shut.why.t)} → ${Math.round(open.why.b - open.why.t)}`);
    // (3c) REV has no paired torque source, so the alternative line is absent.
    // Nothing may be left reserved for it: the fold's rule runs to the foot of
    // the board instead of stopping above the ideal line.
    check('board: the REV state has no alternative basis line', open.altHidden);
    check('board: the fold rule runs to the foot of the board at 1366',
      open.foldFoot >= open.foot - 1.5 && open.foldFoot >= open.idealFoot - 1,
      `fold ${Math.round(open.foldFoot)} foot ${Math.round(open.foot)} ideal ${Math.round(open.idealFoot)}`);
    check('board: the shut fold reaches the same foot, so nothing is reserved beside the ideal',
      shut.foldFoot >= shut.foot - 1.5 && shut.foldFoot >= shut.idealFoot - 1,
      `fold ${Math.round(shut.foldFoot)} foot ${Math.round(shut.foot)} ideal ${Math.round(shut.idealFoot)}`);
    await p.locator('#board').screenshot({ path: OUT + '/dt11-board-fold.png' });
    await p.close();
  }

  // 16c. THE RECIPE LINE AT 390. A part list and the ratio it produces are one
  // statement; a narrow column may break inside the parts but never leave the
  // ratio alone on a line of its own.
  {
    const p = await layoutPage(390);
    const r = await p.evaluate(() => {
      const el = document.querySelector('#boardRecipe');
      const node = el.firstChild;
      const text = el.textContent;
      const arrow = text.lastIndexOf('→');
      if (arrow < 0 || !node || node.nodeType !== 3) return null;
      const pre = text.lastIndexOf(' ', arrow - 2) + 1;
      const rangeOf = (a, b) => { const rg = document.createRange(); rg.setStart(node, a); rg.setEnd(node, b); return rg; };
      const whole = rangeOf(0, text.length).getClientRects();
      return {
        text,
        lines: whole.length,
        lastWord: Math.round(rangeOf(pre, arrow).getBoundingClientRect().top),
        ratio: Math.round(rangeOf(arrow, text.length).getBoundingClientRect().top),
        firstLineW: Math.round(whole[0].width),
        lastLineW: Math.round(whole[whole.length - 1].width),
        boxW: Math.round(el.getBoundingClientRect().width),
      };
    });
    check('recipe: the line is measurable at 390', !!r && r.lines >= 1, JSON.stringify(r));
    check('recipe: the ratio never sits alone on a second line at 390',
      !!r && r.lastWord === r.ratio, JSON.stringify(r));
    check('recipe: the line still fits its column at 390',
      !!r && r.firstLineW <= r.boxW + 1 && r.lastLineW <= r.boxW + 1, JSON.stringify(r));
    await p.close();
  }

  // 16d. EVERY SCREEN SIZE. A page-overflow and own-box-overflow sweep across
  // every width the page has to work at, plus a phone held sideways.
  const SIZES = [[320, 900], [360, 900], [375, 900], [390, 900], [414, 900],
    [768, 1024], [834, 1112], [1024, 900], [1280, 900], [1366, 950], [844, 390]];
  for (const [w, h] of SIZES) {
    const p = await layoutPage(w, h);
    const res = await p.evaluate(() => {
      const name = (e) => (typeof e.className === 'string' && e.className ? e.className : e.tagName);
      // A card of paper is tilted a fraction of a degree on purpose, and a
      // rotated child always reaches a pixel or two past its parent's box, so
      // a container that holds one is not evidence of a layout fault.
      const tilted = (e) => [...e.children].some((c) => {
        const r = getComputedStyle(c).rotate;
        return r && r !== 'none' && r !== '0deg';
      });
      const bad = [...document.querySelectorAll('.dt-shell *')].filter((e) => {
        if (e.scrollWidth - e.clientWidth <= 1) return false;
        const cs = getComputedStyle(e);
        if (cs.overflowX === 'auto' || cs.overflowX === 'scroll') return false;
        if (e.classList.contains('dt-srsum') || e.classList.contains('dt-visually-hidden')) return false;
        if (cs.position === 'absolute' && e.clientWidth === 0) return false;
        return !tilted(e);
      }).map((e) => name(e) + ' +' + (e.scrollWidth - e.clientWidth));
      // nothing may be drawn past either edge of the window either
      const spill = [...document.querySelectorAll('.dt-shell *')].filter((e) => {
        const b = e.getBoundingClientRect();
        return b.width > 0 && (b.right > window.innerWidth + 2 || b.left < -2);
      }).map((e) => name(e));
      return {
        over: document.documentElement.scrollWidth - window.innerWidth,
        bad: bad.slice(0, 6),
        spill: spill.slice(0, 6),
        chart: Math.min(...[...document.querySelectorAll('.dt-chartbox')].map((b) => b.clientHeight)),
      };
    });
    const at = w === 844 ? '844x390 landscape' : `${w}px`;
    check(`sweep: no horizontal page overflow at ${at}`, res.over <= 1, `${res.over}px`);
    check(`sweep: nothing overflows its own box at ${at}`, res.bad.length === 0, res.bad.join(' | '));
    check(`sweep: nothing is drawn past the window edge at ${at}`, res.spill.length === 0, res.spill.join(' | '));
    check(`sweep: no chart falls below a legible height at ${at}`, res.chart >= 140, `${res.chart}px`);
    if (w === 320) await p.screenshot({ path: OUT + '/dt11-320.png', fullPage: true });
    if (w === 390) await p.screenshot({ path: OUT + '/dt11-390.png', fullPage: true });
    if (w === 768) await p.screenshot({ path: OUT + '/dt11-768.png', fullPage: true });
    if (w === 844) await p.screenshot({ path: OUT + '/dt11-landscape.png', fullPage: true });
    await p.close();
  }

  // 16e. TOUCH TARGETS. Everything a driver actually drives clears 44px on a
  // phone: the chips, the segmented buttons, the run buttons, play, restart
  // and both sliders.
  {
    const p = await layoutPage(390);
    await p.click('#modeSprint');
    await p.waitForTimeout(900);
    const small = await p.evaluate(() => {
      const sel = '.dt-chip, .dt-seg button, .dt-btn, #pvPlay, #pvRestart, #pvScrub, #pvSpeed, #dist, #addStage';
      return [...document.querySelectorAll(sel)]
        .filter((e) => e.offsetParent !== null)
        .map((e) => ({ id: e.id || (typeof e.className === 'string' ? e.className : e.tagName), h: Math.round(e.getBoundingClientRect().height) }))
        .filter((d) => d.h < 44);
    });
    check('touch: every control a driver drives clears 44px at 390',
      small.length === 0, small.map((d) => `${d.id}:${d.h}`).join(' '));
    await p.close();
  }

  // 16f. THE DUPLICATED FOLD IS GONE. Real testing moved into section 03, so
  // the prose fold that used to repeat it in the results is deleted, and every
  // instruction it carried is reachable in the section that replaced it.
  {
    const p = await layoutPage(1366);
    check('the duplicated pit-session fold is gone from the results',
      await p.evaluate(() => ![...document.querySelectorAll('.dt-results details.dt-fold summary')]
        .some((s) => /pit session|measure your real constants/i.test(s.textContent))));
    const reach = await p.evaluate(() => {
      const t = document.querySelector('#measure').innerText.toLowerCase();
      return {
        session: /pit session/.test(t),
        grip: /luggage scale/.test(t),
        coast: /cut the power to zero/.test(t),
        loop: /against a wall/.test(t) && /voltage and total current/.test(t),
        log: /full-throttle/.test(t) && /paste it/.test(t),
        fields: ['msPull', 'msAfwd', 'msVidle', 'msVload', 'msIload', 'csvText'].every((i) => !!document.querySelector('#' + i)),
      };
    });
    check('section 03 still calls itself the pit session', reach.session);
    check('the grip instruction lives in section 03', reach.grip);
    check('the coast-down instruction lives in section 03', reach.coast);
    check('the loop-resistance instruction lives in section 03', reach.loop);
    check('the encoder-log instruction lives in section 03', reach.log);
    check('and every one of them has a field behind it', reach.fields, JSON.stringify(reach));
    await p.close();
  }
}

// 17. THE DESIGN SYSTEM ITSELF. The page is a printed engineering document:
// one token set, self-hosted type, no rotation, no shadow, no rounding, and
// every text/background pair clearing AA at the size it is set at. These are
// asserted at runtime because a token that fails to resolve, or a face that
// fails to load, looks fine in the source and wrong on the projector.
{
  const p = await browser.newPage({ viewport: { width: 1366, height: 950 } });
  await p.goto(BASE + '/drivetrain/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1100);

  // 17a. THE TOKEN SET. Every name the sheet and the canvas renderers read
  // resolves to the literal value it was measured at. Flat hex, never a
  // color-mix: canvas 2D cannot resolve one.
  const TOKENS = {
    '--s-canvas': '#C9CFDD', '--s-panel': '#D9DDE7', '--s-inset': '#BDC4D4', '--s-ink': '#10254F',
    '--ink-1': '#10254F', '--ink-2': '#303D6A', '--ink-3': '#44506F',
    '--rule-hair': '#B9C0D0', '--rule': '#A8B1C5', '--rule-strong': '#8A94AF', '--rule-axis': '#44506F',
    '--accent': '#75346F', '--accent-wash': '#CDC8D8', '--accent-ink': '#632B61',
    '--warn-line': '#B84E00', '--warn-text': '#843900', '--warn-wash': '#D6CFCF', '--ok-text': '#00523E',
    '--sr-1': '#75346F', '--sr-2': '#B84E00', '--sr-3': '#44506F', '--sr-4': '#00523E',
    '--sr-band-flat': '#CDC8D8', '--sr-grid': '#B9C0D0',
    '--on-ink-1': '#EDF0F6', '--on-ink-2': '#C9CFDD', '--on-ink-3': '#97A2BC',
    '--on-ink-accent': '#C99BC7', '--on-ink-warn': '#E8833A', '--on-ink-rule': '#303D6A',
  };
  const tok = await p.evaluate((names) => {
    const root = getComputedStyle(document.documentElement);
    const shell = getComputedStyle(document.querySelector('.dt-shell'));
    const out = {};
    for (const n of names) out[n] = [root.getPropertyValue(n).trim(), shell.getPropertyValue(n).trim()];
    return out;
  }, Object.keys(TOKENS));
  // The build minifies hex to lowercase; the contract is about the value.
  const wrongTok = Object.entries(TOKENS).filter(([n, want]) => tok[n][0].toLowerCase() !== want.toLowerCase());
  check('tokens: every token resolves to its measured value at the root',
    wrongTok.length === 0, wrongTok.map(([n, w]) => `${n} ${tok[n][0]} want ${w}`).join(' | '));
  // The canvas renderers read the palette off document.documentElement, so a
  // token that only resolves on .dt-shell would leave the charts unpainted.
  check('tokens: the canvas bridge sees the same values on the shell',
    Object.keys(TOKENS).every((n) => tok[n][0].toLowerCase() === tok[n][1].toLowerCase()),
    Object.keys(TOKENS).filter((n) => tok[n][0] !== tok[n][1]).join(' '));
  check('tokens: no token is a color-mix, which canvas 2D cannot resolve',
    !Object.values(tok).some(([v]) => /color-mix|var\(/.test(v)));

  // 17b. THE TYPE. The page is set in the site's own faces: Ubuntu for
  // words, Uncial Antiqua for the masthead, the system mono stack for
  // figures. The webfonts are self-hosted (Fontsource, bundled by Astro)
  // and actually loaded, not swapped in from a fallback, and nothing on the
  // page is set in a banned face.
  const type = await p.evaluate(async () => {
    await document.fonts.ready;
    const faces = [...document.fonts].map((f) => ({ f: f.family, w: f.weight, s: f.status }));
    const srcs = [...document.styleSheets].flatMap((ss) => {
      try { return [...ss.cssRules]; } catch { return []; }
    }).filter((r) => r.constructor.name === 'CSSFontFaceRule')
      .map((r) => r.style.getPropertyValue('src'));
    const fams = new Set();
    for (const el of document.querySelectorAll('.dt-shell, .dt-shell *')) {
      const ff = getComputedStyle(el).fontFamily;
      if (ff) fams.add(ff.split(',')[0].trim().replace(/^["']|["']$/g, ''));
    }
    return {
      faces,
      srcs,
      fams: [...fams],
      sansLoaded: document.fonts.check('400 16px "Ubuntu"'),
      sansBold: document.fonts.check('700 16px "Ubuntu"'),
      displayLoaded: document.fonts.check('400 16px "Uncial Antiqua"'),
      h1: getComputedStyle(document.querySelector('.page-title')).fontFamily,
      num: getComputedStyle(document.querySelector('.dt-stat .u')).fontFamily,
    };
  });
  check('type: Ubuntu 400 is loaded, not substituted', type.sansLoaded);
  check('type: Ubuntu 700 is loaded', type.sansBold);
  check('type: Uncial Antiqua is loaded for the masthead', type.displayLoaded);
  check('type: the site faces report loaded to document.fonts',
    type.faces.filter((f) => /Ubuntu|Uncial/.test(f.f) && f.s === 'loaded').length >= 3,
    JSON.stringify(type.faces.filter((f) => /Ubuntu|Uncial/.test(f.f) && f.s === 'loaded')));
  check('type: every webfont is self-hosted, none hotlinked',
    type.srcs.length > 0 && !type.srcs.some((s) => /https?:/.test(s)),
    type.srcs.filter((s) => /https?:/.test(s)).join(' | '));
  check('type: words in Uncial/Ubuntu, figures in the mono stack, no banned face',
    type.fams.every((f) => !/^(Inter|Roboto|system-ui|-apple-system)$/i.test(f))
    && /Uncial Antiqua/.test(type.h1) && /ui-monospace|SFMono|Menlo|monospace/i.test(type.num),
    type.fams.join(' | ') + ' h1=' + type.h1 + ' num=' + type.num);
  // The site's script face (Grey Qo) never appears inside the report.
  check('type: the script face is not used anywhere on this page',
    !type.fams.some((f) => /Grey Qo|Delafield|script/i.test(f)), type.fams.join(' | '));

  // 17c. NO ORNAMENT. Nothing on the page rotates, casts a shadow, is rounded,
  // or runs a filter, in any state. The range thumb is the single documented
  // exception to the radius rule, and the gauge's "best" mark is a square
  // turned 45 degrees, which is a diamond, not a tilted card.
  const orn = await p.evaluate(() => {
    const bad = { rotate: [], shadow: [], radius: [], filter: [], blur: [] };
    const name = (e) => (typeof e.className === 'string' && e.className ? e.className : e.tagName);
    for (const el of document.querySelectorAll('.dt-shell, .dt-shell *')) {
      const s = getComputedStyle(el);
      if (s.rotate && s.rotate !== 'none' && s.rotate !== '0deg'
          && !el.classList.contains('dt-gauge-best') && !el.classList.contains('dt-dia')) {
        bad.rotate.push(name(el) + ' ' + s.rotate);
      }
      if (s.boxShadow && s.boxShadow !== 'none') bad.shadow.push(name(el) + ' ' + s.boxShadow);
      if (s.filter && s.filter !== 'none') bad.filter.push(name(el) + ' ' + s.filter);
      if (/blur/.test(s.backdropFilter || '')) bad.blur.push(name(el));
      const r = s.borderRadius;
      if (r && r !== '0px' && el.type !== 'range'
          && !el.classList.contains('dt-dot') && !el.classList.contains('dt-ring')
          && !el.classList.contains('dt-gauge-you')) bad.radius.push(name(el) + ' ' + r);
    }
    // exactly one inverted block: the verdict
    const dark = [...document.querySelectorAll('.dt-shell, .dt-shell *')].filter((el) => {
      const bg = getComputedStyle(el).backgroundColor.match(/\d+/g);
      if (!bg || (bg[3] !== undefined && +bg[3] === 0)) return false;
      return (+bg[0] * 0.299 + +bg[1] * 0.587 + +bg[2] * 0.114) < 90 && el.getBoundingClientRect().height > 60;
    }).map(name);
    return { ...bad, dark };
  });
  check('ornament: nothing on the page is rotated', orn.rotate.length === 0, orn.rotate.slice(0, 4).join(' | '));
  check('ornament: nothing on the page casts a shadow', orn.shadow.length === 0, orn.shadow.slice(0, 4).join(' | '));
  check('ornament: nothing on the page is rounded', orn.radius.length === 0, orn.radius.slice(0, 4).join(' | '));
  check('ornament: no filter or backdrop blur anywhere',
    orn.filter.length === 0 && orn.blur.length === 0, orn.filter.slice(0, 4).join(' | '));
  check('ornament: exactly one inverted block, and it is the verdict board',
    orn.dark.length === 1 && /dt-board/.test(orn.dark[0]), orn.dark.join(' | '));

  // 17d. CONTRAST, computed at runtime with the WCAG relative-luminance
  // formula against what the browser actually painted. AA is 4.5:1 under
  // 18.66px (or 24px non-bold), 3:1 at or above it.
  const contrast = await p.evaluate(() => {
    const lum = (c) => {
      const [r, g, b] = c.map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const px = (s) => (s.match(/\d+(\.\d+)?/g) || [0, 0, 0]).slice(0, 3).map(Number);
    const bgOf = (el) => {
      // The segmented control's selected option sits on the sliding ink thumb,
      // which is the track's ::before rather than the option's own background,
      // so the painted ground behind that label is --ink-1.
      if (el.closest('.dt-seg') && el.closest('button')?.classList.contains('is-active')) {
        return px(getComputedStyle(document.documentElement).getPropertyValue('--ink-1').trim()
          .replace(/^#(..)(..)(..)$/, (m, r, g, b) => `${parseInt(r, 16)} ${parseInt(g, 16)} ${parseInt(b, 16)}`));
      }
      for (let n = el; n; n = n.parentElement) {
        const c = getComputedStyle(n).backgroundColor;
        const m = c.match(/[\d.]+/g);
        if (m && (m[3] === undefined || +m[3] > 0.9)) return px(c);
      }
      return [255, 255, 255];
    };
    const ratio = (a, b) => {
      const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
      return (x + 0.05) / (y + 0.05);
    };
    const out = [];
    const seen = new Set();
    const walk = document.createTreeWalker(document.querySelector('.dt-shell'), NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walk.nextNode())) {
      if (!n.nodeValue.trim()) continue;
      const el = n.parentElement;
      const s = getComputedStyle(el);
      if (s.visibility === 'hidden' || s.display === 'none' || +s.opacity === 0) continue;
      if (!el.getClientRects().length) continue;
      const key = (typeof el.className === 'string' ? el.className : el.tagName) + '|' + s.color + '|' + s.fontSize + '|' + s.fontWeight;
      if (seen.has(key)) continue;
      seen.add(key);
      const size = parseFloat(s.fontSize);
      const large = size >= 24 || (size >= 18.66 && +s.fontWeight >= 700);
      const r = ratio(px(s.color), bgOf(el));
      out.push({ key, r: Math.round(r * 100) / 100, need: large ? 3 : 4.5 });
    }
    return out;
  });
  const failsAA = contrast.filter((c) => c.r < c.need);
  check('contrast: every visible text pair on the page clears AA at its size',
    failsAA.length === 0,
    failsAA.slice(0, 5).map((c) => `${c.key.split('|')[0]} ${c.r}:1 need ${c.need}`).join(' | '));
  check('contrast: the check actually inspected the page', contrast.length > 40, String(contrast.length));

  // 17e. MOTION. One easing curve, transform and opacity only, and nothing
  // over 200ms. A transition on a layout property is what makes a page feel
  // like a website rather than an instrument.
  const motion = await p.evaluate(() => {
    const LAYOUT = /^(width|height|margin|padding|top|left|right|bottom|inset|font-size|line-height|filter|box-shadow|rotate)/;
    const bad = [];
    const curves = new Set();
    const overs = [];
    for (const el of document.querySelectorAll('.dt-shell, .dt-shell *, .dt-shell *::before')) {
      const s = getComputedStyle(el);
      const props = s.transitionProperty.split(',').map((x) => x.trim());
      const durs = s.transitionDuration.split(',').map((x) => parseFloat(x) * 1000);
      const fns = s.transitionTimingFunction.split(/,(?![^(]*\))/).map((x) => x.trim());
      props.forEach((pr, i) => {
        if (pr === 'none' || pr === 'all') return;
        const d = durs[i % durs.length] || 0;
        if (d === 0) return;
        if (LAYOUT.test(pr)) bad.push(pr);
        if (d > 200) overs.push(pr + ' ' + d);
        curves.add(fns[i % fns.length]);
      });
      const ad = s.animationDuration.split(',').map((x) => parseFloat(x) * 1000);
      ad.forEach((d) => { if (d > 200) overs.push('animation ' + d); });
    }
    return { bad: [...new Set(bad)], curves: [...curves], overs: [...new Set(overs)] };
  });
  check('motion: nothing transitions a layout property', motion.bad.length === 0, motion.bad.join(' | '));
  check('motion: nothing runs longer than 200ms', motion.overs.length === 0, motion.overs.join(' | '));
  check('motion: one easing curve on the whole page',
    motion.curves.length <= 1, motion.curves.join(' | '));

  // 17f. THE REVEAL CONTRACT. The blurred scroll reveal is gone from this
  // page, and it is gone cleanly: no element asks for it, so the shared
  // observer in the layout finds nothing to attach here.
  const reveal = await p.evaluate(() => ({
    attrs: document.querySelectorAll('.dt-shell [data-reveal], .dt-shell [data-reveal-group]').length,
    classes: document.querySelectorAll('.dt-shell .reveal, .dt-shell .reveal-rise').length,
    hidden: [...document.querySelectorAll('.dt-shell *')].filter((e) => +getComputedStyle(e).opacity === 0
      && e.getBoundingClientRect().height > 40).length,
  }));
  check('reveal: no element on this page asks for the scroll reveal',
    reveal.attrs === 0 && reveal.classes === 0, JSON.stringify(reveal));
  check('reveal: nothing is left sitting at zero opacity', reveal.hidden === 0, String(reveal.hidden));

  // 17g. KEYBOARD. Tabbed for real, because :focus-visible is a keyboard
  // heuristic and a scripted .focus() does not satisfy it. Every stop draws
  // the outline ring, and the ring clears 3:1 against the ground it sits on.
  {
    const surface = await p.evaluate(() =>
      document.querySelectorAll('.dt-shell a[href], .dt-shell button, .dt-shell input, .dt-shell select, .dt-shell textarea, .dt-shell summary').length);
    check('keyboard: the page has a real control surface', surface > 30, String(surface));
    await p.evaluate(() => window.scrollTo(0, 0));
    await p.locator('.dt-shell .back-link').focus();
    const stops = [];
    for (let i = 0; i < 45; i++) {
      const s = await p.evaluate(() => {
        const e = document.activeElement;
        if (!e || e === document.body) return null;
        const cs = getComputedStyle(e);
        return {
          tag: e.tagName,
          cls: (typeof e.className === 'string' && e.className) || '',
          inShell: !!e.closest('.dt-shell'),
          ring: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 1,
          w: cs.outlineWidth,
          colour: cs.outlineColor,
        };
      });
      if (s && s.inShell) stops.push(s);
      await p.keyboard.press('Tab');
    }
    const noRing = stops.filter((s) => !s.ring);
    check('keyboard: tabbing reaches the page controls in order', stops.length > 20, String(stops.length));
    check('keyboard: every tab stop draws an outline ring',
      noRing.length === 0, noRing.slice(0, 5).map((s) => `${s.tag}.${s.cls}`).join(' | '));
    check('keyboard: the ring is the accent, two pixels, on every stop',
      stops.every((s) => s.colour === 'rgb(117, 52, 111)' && parseFloat(s.w) === 2),
      [...new Set(stops.map((s) => `${s.colour} ${s.w}`))].join(' | '));
  }

  await p.close();
}

// ── 18. THE DATASHEET PASS ────────────────────────────────────────────────
// The pit protocol, the written display philosophy, the quantity-symbol
// italic, one percent everywhere, and the four defects the integrator
// measured: print folds that never opened, a site nav sitting on the section
// rail, a three-up figure row that wrapped 2+1, and per-glyph label halos.
{
  const p = await browser.newPage({ viewport: { width: 1366, height: 950 } });
  const perr = [];
  p.on('pageerror', (e) => perr.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') perr.push('console: ' + m.text()); });
  await p.goto(BASE + '/drivetrain/', { waitUntil: 'networkidle' });
  await p.evaluate(async () => {
    const H = document.body.scrollHeight;
    for (let y = 0; y < H; y += 400) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 8)); }
    window.scrollTo(0, 0);
  });
  await p.waitForTimeout(500);

  // 18a. FIVE CARDS, ONE PROTOCOL. Same five questions, same order, same
  // places, so the section reads as one procedure rather than five forms.
  const proto = await p.evaluate(() => {
    const tests = [...document.querySelectorAll('#measure .dt-test')];
    return tests.map((t) => {
      const dl = t.querySelector('.dt-proto');
      if (!dl) return null;
      const terms = [...dl.children].filter((n) => n.tagName === 'DT');
      const defs = [...dl.children].filter((n) => n.tagName === 'DD');
      return {
        terms: terms.map((d) => d.textContent.trim().toLowerCase()),
        termX: terms.map((d) => Math.round(d.getBoundingClientRect().left)),
        defX: Math.round(defs[0].getBoundingClientRect().left),
        eq: !!dl.querySelector('.dt-proto-eq'),
        sets: (dl.querySelector('.dt-proto-sets') || {}).textContent?.trim() || '',
        time: (dl.querySelector('.dt-proto-t') || {}).textContent?.trim() || '',
      };
    });
  });
  const WANT = ['sets', 'method', 'arithmetic', 'result', 'time'];
  check('protocol: every test is one of these cards', proto.length === 5 && proto.every(Boolean),
    JSON.stringify(proto.map((x) => (x ? x.terms.length : 'none'))));
  check('protocol: all five ask the same five questions in the same order',
    proto.every((t) => t && t.terms.join(',') === WANT.join(',')),
    proto.map((t) => (t ? t.terms.join('/') : '-')).join(' | '));
  check('protocol: every card states what it pins and what it costs in time',
    proto.every((t) => t.sets.length > 10 && /\bmin\b/.test(t.time)),
    proto.map((t) => t.time).join(' | '));
  check('protocol: every card shows its own arithmetic', proto.every((t) => t.eq));
  // one shape means one measure: within a card the terms share a left edge,
  // and the answers all start on the same one.
  check('protocol: the questions line up inside every card',
    proto.every((t) => new Set(t.termX).size === 1),
    proto.map((t) => t.termX.join('/')).join(' | '));
  check('protocol: the answers start on the same rule as the questions end',
    proto.every((t) => t.defX > t.termX[0]),
    proto.map((t) => `${t.termX[0]}->${t.defX}`).join(' '));
  // the five times add up to the half hour the section's own lede promises
  const mins = proto.map((t) => parseInt(t.time.match(/(\d+)\s*min/)[1], 10));
  check('protocol: the five tests add up to about the half hour promised',
    mins.reduce((a, b) => a + b, 0) >= 20 && mins.reduce((a, b) => a + b, 0) <= 40,
    mins.join('+') + ' = ' + mins.reduce((a, b) => a + b, 0));

  // 18b. THE WRITTEN DISPLAY PHILOSOPHY, and every claim in it checked
  // against what the page actually does. A philosophy that is not true of the
  // page is worse than none.
  const philo = await p.evaluate(() => {
    const sec = document.querySelector('#reading');
    if (!sec) return null;
    const rules = [...sec.querySelectorAll('.dt-philo-list > dt')].map((d) => d.textContent.trim());
    return {
      rules,
      text: sec.textContent.replace(/\s+/g, ' ').toLowerCase(),
      folded: !!sec.querySelector('details'),
      beforeMethod: !!(sec.compareDocumentPosition(document.querySelector('#method')) & Node.DOCUMENT_POSITION_FOLLOWING),
      words: sec.textContent.trim().split(/\s+/).length,
      firstPerson: /\bi wrote\b|\bi chose\b|\bi do not\b/.test(sec.textContent.toLowerCase()),
    };
  });
  check('philosophy: the page states its own display rules, unfolded',
    !!philo && philo.rules.length === 5 && !philo.folded, philo ? philo.rules.join(' | ') : 'missing');
  check('philosophy: it is written in the owner\'s voice, like the rest of the site',
    philo.firstPerson);
  check('philosophy: it sits before the method section, where a judge reaches it',
    philo.beforeMethod);
  check('philosophy: it is short enough to read standing up', philo.words < 500, String(philo.words));
  // NOTHING EXTERNAL IS CITED. No standard number, no organisation, no claim
  // of conformance: every primary document behind these conventions was
  // unreachable, and a fabricated citation is worse than none.
  check('philosophy: it cites no standard and claims conformance to nothing',
    !/\b(iso|ieee|astm|ansi|nasa|faa|mil-std|isa-\d|si brochure|per clause|conform)/.test(philo.text),
    philo.text.slice(0, 120));

  const claims = await p.evaluate(() => {
    const shell = document.querySelector('.dt-shell');
    // "every number is set in tabular figures"
    const nums = [...shell.querySelectorAll('#stats .dt-stat .v, .dt-prov-v, .dt-num')];
    const notTab = nums.filter((n) => !/tabular-nums/.test(getComputedStyle(n).fontVariantNumeric));
    // "quantity symbols italic, unit symbols upright"
    const qs = [...shell.querySelectorAll('.dt-q')];
    const notItalic = qs.filter((q) => getComputedStyle(q).fontStyle !== 'italic');
    const units = [...shell.querySelectorAll('#stats .dt-stat .u, .dt-q sub')];
    const slantedUnits = units.filter((u) => getComputedStyle(u).fontStyle !== 'normal');
    // a real face for every italic run, never a synthesised oblique: the
    // family a .dt-q resolves to must actually declare an italic at its weight
    const faces = [...document.fonts].filter((f) => f.style === 'italic')
      .map((f) => f.family + '|' + f.weight);
    const fake = qs.map((q) => {
      const cs = getComputedStyle(q);
      const fam = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim();
      const w = parseInt(cs.fontWeight, 10);
      // The figure stack resolves to a platform face (ui-monospace and its
      // fallbacks), and document.fonts only lists webfonts, so a system
      // face's real italic is invisible here: exempt the stack rather than
      // fail it for a face this check cannot see.
      if (/^(ui-monospace|SFMono-Regular|Menlo|Consolas|monospace)$/i.test(fam)) return null;
      const ok = faces.some((f) => {
        const [ff, fw] = f.split('|');
        if (ff !== fam) return false;
        const [lo, hi] = fw.split(' ').map(Number);
        // A 500 run matches the 400 face with no synthesis (browsers only
        // fake bold from 600 up), so a 400 italic covers the 400-500 band.
        return hi === undefined ? (lo === w || (lo === 400 && w > 400 && w < 600)) : w >= lo && w <= hi;
      });
      // Only the SLANTED part of the run needs an italic face: a descriptive
      // subscript is reset upright, so its letters are set from the normal
      // face and cannot be synthesised. And Greek falls through the mono
      // stack to Plex Sans by design, so a run carrying no Latin at all is
      // matched against that fallback rather than against Plex Mono.
      const slanted = [...q.childNodes]
        .filter((n) => n.nodeType === 3 || !/^(SUB|SUP)$/.test(n.tagName))
        .map((n) => n.textContent).join('');
      return ok || !/[A-Za-z]/.test(slanted) ? null : `${slanted}@${fam} ${w}`;
    }).filter(Boolean);
    // "nothing loops"
    const looping = [...shell.querySelectorAll('*')].filter((e) => {
      const cs = getComputedStyle(e);
      return cs.animationName !== 'none' && cs.animationIterationCount === 'infinite';
    }).length;
    // "no chart redraws itself": the figures carry no CSS animation at all
    const movingFigs = [...shell.querySelectorAll('canvas')].filter((e) =>
      getComputedStyle(e).animationName !== 'none').length;
    // "it says it has never met a robot, at the top"
    const status = document.querySelector('.dt-status li[data-state="none"]');
    return {
      notTab: notTab.length, nums: nums.length,
      notItalic: notItalic.length, qs: qs.length,
      slantedUnits: slantedUnits.length, units: units.length,
      fake, looping, movingFigs,
      validation: status ? status.textContent.replace(/\s+/g, ' ').trim() : '',
    };
  });
  check('philosophy holds: every figure is set in tabular figures',
    claims.nums > 20 && claims.notTab === 0, `${claims.notTab} of ${claims.nums}`);
  check('philosophy holds: quantity symbols are italic',
    claims.qs > 30 && claims.notItalic === 0, `${claims.notItalic} of ${claims.qs}`);
  check('philosophy holds: no unit or descriptive subscript inherits the slant',
    claims.units > 5 && claims.slantedUnits === 0, `${claims.slantedUnits} of ${claims.units}`);
  check('philosophy holds: every italic run has a real face, none is a synthesised oblique',
    claims.fake.length === 0, claims.fake.slice(0, 4).join(', '));
  check('philosophy holds: nothing on the page loops', claims.looping === 0, String(claims.looping));
  check('philosophy holds: no figure animates itself', claims.movingFigs === 0, String(claims.movingFigs));
  check('philosophy holds: the page says at the top that it has never met a robot',
    /validation/i.test(claims.validation) && /none/i.test(claims.validation), claims.validation);

  // 18c. ONE PERCENT, EVERYWHERE. The readout used to space it while the
  // provenance ledger closed it up. Closed wins: spaced reads as a typo.
  const pct = await p.evaluate(() => {
    const bad = [];
    const walk = document.createTreeWalker(document.querySelector('.dt-shell'), NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const t = n.nodeValue;
      if (/\d\s+%/.test(t)) bad.push(t.replace(/\s+/g, ' ').trim().slice(0, 60));
    }
    return bad;
  });
  check('percent: no rendered figure spaces its percent sign', pct.length === 0, pct.slice(0, 3).join(' | '));
  check('percent: the efficiency readout closes it up like the ledger does',
    /^\d+%$/.test((await p.textContent('#roEta')).trim()), await p.textContent('#roEta'));

  // 18d. THE LABEL KNOCK-OUT IS CONTINUOUS. A stroked outline follows each
  // glyph's own contour, so a dashed rule shows through the gaps between
  // letters; one measured box behind the whole string does not. Checked at
  // the source, because whether a given label happens to sit on a rule
  // depends on the configuration, and the mechanism must not.
  const figSrc = await p.evaluate(async () => {
    const s = [...document.scripts].map((x) => x.src).find((x) => /drivetrain/.test(x));
    return s ? await (await fetch(s)).text() : '';
  });
  check('halo: the figure code no longer knocks labels out glyph by glyph',
    figSrc.length > 1000 && !/strokeText/.test(figSrc), String(figSrc.length));
  check('halo: it measures the whole string and fills one box behind it',
    /actualBoundingBoxAscent/.test(figSrc) && /fillRect/.test(figSrc));
  // and the labels still render: a knock-out that ate its own text would pass
  // every structural check above
  const inked = await p.evaluate(() => {
    const cv = document.querySelector('#cSpeed');
    const g = cv.getContext('2d');
    const d = g.getImageData(0, 0, cv.width, Math.round(cv.height * 0.25)).data;
    let ink = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] < 200 && d[i + 3] > 200) ink++;
    return ink;
  });
  check('halo: the reference label is still painted after the knock-out', inked > 150, String(inked));


  // 18f. THE THREE-UP FIGURE ROW NEVER LEAVES AN ORPHAN. Two tracks and three
  // figures stranded the third beside a hole through the whole tablet band.
  for (const w of [768, 900, 1100, 1280]) {
    await p.setViewportSize({ width: w, height: 950 });
    await p.waitForTimeout(400);
    const row = await p.evaluate(() => {
      const box = document.querySelector('.dt-two');
      const b = box.getBoundingClientRect();
      const kids = [...box.children].map((k) => k.getBoundingClientRect());
      const tops = [...new Set(kids.map((k) => Math.round(k.top)))].sort((a, c) => a - c);
      return {
        rows: tops.map((t) => kids.filter((k) => Math.abs(k.top - t) <= 1)
          .map((k) => [Math.round(k.left), Math.round(k.right)])),
        l: Math.round(b.left), r: Math.round(b.right),
      };
    });
    const lastRow = row.rows[row.rows.length - 1];
    check(`figures: the three-up row ends flush, no half-empty rank at ${w}`,
      Math.abs(lastRow[0][0] - row.l) <= 1
      && Math.abs(lastRow[lastRow.length - 1][1] - row.r) <= 1,
      JSON.stringify(row.rows) + ` in ${row.l}-${row.r}`);
  }
  await p.setViewportSize({ width: 1366, height: 950 });
  await p.waitForTimeout(400);

  // 18g. THE PRINT PATH IS THE PORTFOLIO ARTIFACT. A closed <details> hides
  // its body through ::details-content, which no rule aimed at the children
  // can reach, so the print sheet used to render a page of headings with
  // nothing under them. Measured in print emulation, not asserted from CSS.
  await p.emulateMedia({ media: 'print' });
  await p.waitForTimeout(500);
  const folds = await p.evaluate(() => {
    const out = [];
    for (const d of document.querySelectorAll('.dt-shell details')) {
      const sum = d.querySelector('summary');
      const body = [...d.children].find((c) => c.tagName !== 'SUMMARY');
      if (!sum || !body) continue;
      // the custom-path editor is hidden until that path is chosen, and a fold
      // inside a hidden block is meant to have no box on the printed sheet
      if (d.closest('[hidden]')) continue;
      const db = d.getBoundingClientRect(), sb = sum.getBoundingClientRect(), bb = body.getBoundingClientRect();
      out.push({
        open: d.open,
        id: d.id || (sum.textContent.trim().slice(0, 28)),
        dh: Math.round(db.height), sh: Math.round(sb.height), bh: Math.round(bb.height),
        // the body has to lay out INSIDE the details box, not merely exist
        inside: bb.height > 4 && db.height >= sb.height + bb.height - 4,
      });
    }
    return out;
  });
  const shut = folds.filter((f) => !f.inside);
  check('print: every fold prints its body, not just its heading',
    folds.length >= 12 && shut.length === 0,
    `${shut.length} of ${folds.length} closed: ` + shut.slice(0, 3).map((f) => `${f.id} ${f.dh}=${f.sh}+${f.bh}`).join(' | '));
  check('print: the folds carry real content, not a collapsed box',
    folds.every((f) => f.bh > 4) && folds.some((f) => f.bh > 100),
    `min body ${Math.min(...folds.map((f) => f.bh))}, max ${Math.max(...folds.map((f) => f.bh))}`);
  // and the philosophy prints with the rest of the report
  check('print: the display philosophy is on the printed sheet',
    await p.evaluate(() => {
      const s = document.querySelector('#reading');
      return !!s && s.getBoundingClientRect().height > 100 && getComputedStyle(s).display !== 'none';
    }));
  await p.screenshot({ path: OUT + '/dt14-print.png', fullPage: false });
  await p.emulateMedia({ media: 'screen' });
  await p.waitForTimeout(300);

  check('datasheet pass: zero console/page errors', perr.length === 0, perr.slice(0, 3).join(' | '));
  await p.close();
}

await page.screenshot({ path: OUT + '/dt-final-top.png' });
check('zero console/page errors', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
console.log(fails.length ? `\n${fails.length} FAILURE(S): ${fails.join(', ')}` : '\nALL PASS');
process.exit(fails.length ? 1 : 0);
