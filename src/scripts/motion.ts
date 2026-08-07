/**
 * motion — the site's motion engine.
 *
 * One GSAP + ScrollTrigger layer wired to Lenis so smooth scroll and
 * scroll-driven animation share a single clock. Everything is:
 *   - motivated (each effect communicates hierarchy, story, or feedback)
 *   - crisp and scroll-locked (clip-path wipes and masked rises, no fades)
 *   - reduced-motion safe (the module bows out; static CSS stands in)
 *   - transform / opacity / clip-path only (GPU, no layout thrash)
 *
 * Structure: generic primitives ([data-*] attributes) + named scenes that
 * only run when their element is on the page. See DESIGN.md.
 */
import Lenis from 'lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const root = document.documentElement;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const FINE = matchMedia('(hover: hover) and (pointer: fine)').matches;

/** Reveal everything immediately — the reduced-motion / failure path.
 *  Clears the transforms too: an element parked at its pre-reveal offset is
 *  as broken as one still clipped, and split headings hide by pushing their
 *  characters below the mask rather than by touching the heading itself. */
function showEverything() {
  root.classList.remove('will-animate');
  document
    .querySelectorAll<HTMLElement>('[data-split],[data-reveal],[data-reveal-scrub]')
    .forEach((el) => {
      el.style.opacity = '1';
      el.style.clipPath = 'none';
      el.style.filter = 'none';
      el.style.transform = '';
      el.style.willChange = '';
      if (el.hasAttribute('data-reveal')) el.dataset.revealed = '1';
    });
  document
    .querySelectorAll<HTMLElement>('.split-char')
    .forEach((c) => (c.style.transform = ''));
}

if (REDUCED) {
  showEverything();
} else {
  try {
    boot();
  } catch (err) {
    showEverything();
  }
}

function boot() {
  // The class the home page's cover-wipe and curtain geometry is gated
  // behind: adding it pulls the roster 2.6 viewports up and hands the
  // hero a sticky box. Nothing may measure the page until that has been
  // applied, so we flush the layout here, before a single trigger exists.
  root.classList.add('gsap');
  void root.offsetHeight;

  const lenis = new Lenis({ lerp: 0.1, wheelMultiplier: 1, anchors: true });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
  (window as any).__motion = { lenis, ScrollTrigger, gsap, refresh: scheduleRefresh };

  // The intro load meter (BaseLayout) owns the cover: it counts up with
  // real font loading, then lifts it and fires `intro:done`. When it is
  // active we sync the hero entrance to that lift instead of a fixed timer.
  const introActive = root.classList.contains('loading');
  const startDelay = introActive ? 120 : 60;

  const run = () => {
    try {
      // primitives
      initReveals();
      initScrubReveals();
      initSplits();
      initParallax();
      if (FINE) {
        initHoverPreview();
        initCursorCards();
      }
      // scenes (each no-ops if its element is absent)
      initCoverWipe();
      initHashLand();
      initJourney();
      initHorizontalReveal();
      initHScroll();
      initScreens();
      initDriftCols();
      initFloatCards();
      if (FINE) initTilt();
      initFlip();
      initTierLadder();
      initProgress();
      initRoster(); // async (dynamic Swiper import)
      root.classList.add('motion-booted');
      root.classList.remove('will-animate');
      ScrollTrigger.refresh();
      watchLayout();
    } catch (err) {
      showEverything();
    }
  };

  const fontsReady = (document as any).fonts?.ready ?? new Promise((r) => setTimeout(r, 0));
  let started = false;
  const kick = () => {
    if (started) return;
    started = true;
    setTimeout(run, startDelay);
  };
  if (introActive) {
    // Enter as the cover lifts. Fall back if the meter never signals.
    if ((window as any).__introDone) kick();
    else document.addEventListener('intro:done', kick, { once: true });
    setTimeout(kick, 4600);
  } else {
    fontsReady.then(kick);
    setTimeout(kick, 1400);
  }
  const revealFailsafe = introActive ? 6800 : startDelay + 2800;
  setTimeout(() => {
    if (!root.classList.contains('motion-booted')) showEverything();
  }, revealFailsafe);

  // Re-split headings on width change so masked lines stay correct.
  // WIDTH change only: on a phone the URL bar collapsing mid-scroll fires
  // resize with the width untouched, and re-splitting plus a full trigger
  // refresh in the middle of a live scroll is a visible stutter. Nothing
  // about the line boxes changes when only the height does.
  let lastW = window.innerWidth;
  let rz: number | undefined;
  addEventListener(
    'resize',
    () => {
      if (window.innerWidth === lastW) return;
      clearTimeout(rz);
      rz = window.setTimeout(() => {
        lastW = window.innerWidth;
        if (root.classList.contains('motion-booted')) {
          resplitAll();
          ScrollTrigger.refresh();
        }
      }, 250);
    },
    { passive: true }
  );
}

/* ================================================================== */
/* Keeping the measurements honest.                                    */
/*                                                                     */
/* Every scrubbed scene caches the scroll offsets of its start and end  */
/* when it is built. Anything that changes the height of the document   */
/* afterwards moves the content without moving those offsets, and the   */
/* scene then plays against a page that is no longer there.            */
/*                                                                     */
/* Reveals sidestep the whole problem (they watch the viewport rather   */
/* than a remembered offset), so what is left is the scrubbed work,     */
/* and it has exactly two blind spots: the fonts, which land after the  */
/* first measurement on a slow line, and a component resizing itself.   */
/* The first is handled here. The second is left to the component: it   */
/* knows when its own move is finished and the poster it is flying has  */
/* landed, which is more than a height watcher could ever tell.         */
/* ================================================================== */
let refreshQueued: number | undefined;

/** Coalesce refresh requests: they arrive in bursts (a transition running,
 *  font faces landing one after another) and a refresh is worth doing once
 *  at the end of one, not on every frame of it. Published on `__motion`.
 *  Lenis re-measures in the same beat: its cached limit lags layout growth
 *  otherwise, and a stale limit clamps every trip it drives. */
function scheduleRefresh() {
  clearTimeout(refreshQueued);
  refreshQueued = window.setTimeout(() => {
    (window as any).__motion?.lenis?.resize?.();
    ScrollTrigger.refresh();
  }, 180);
}

function watchLayout() {
  // The display face is far wider than its fallback, so every heading
  // reflows as it swaps in and everything under it slides. On the home page
  // the intro meter usually holds the boot back until the fonts are in, but
  // it gives up after 3.4s and lets the page start without them.
  (document as any).fonts?.ready?.then?.(scheduleRefresh, () => {});
  // A public knock for anything that changes its own height and knows when
  // it has finished doing so: document.dispatchEvent(new Event('motion:refresh')).
  document.addEventListener('motion:refresh', scheduleRefresh);
}

/* ================================================================== */
/* Split text into masked lines of characters.                        */
/* ================================================================== */
function splitToLines(el: HTMLElement): HTMLElement[] {
  const text = el.dataset.splitText ?? (el.textContent ?? '').replace(/\s+/g, ' ').trim();
  el.dataset.splitText = text;
  el.setAttribute('aria-label', text);
  el.textContent = '';

  const words = text.split(' ').map((word) => {
    const w = document.createElement('span');
    w.className = 'split-word';
    w.setAttribute('aria-hidden', 'true');
    for (const ch of word) {
      const c = document.createElement('span');
      c.className = 'split-char';
      c.textContent = ch;
      w.appendChild(c);
    }
    return w;
  });
  words.forEach((w, i) => {
    el.appendChild(w);
    if (i < words.length - 1) el.appendChild(document.createTextNode(' '));
  });

  const groups: HTMLElement[][] = [];
  let top: number | null = null;
  words.forEach((w) => {
    const t = w.offsetTop;
    if (top === null || Math.abs(t - top) > 4) {
      groups.push([]);
      top = t;
    }
    groups[groups.length - 1].push(w);
  });

  el.textContent = '';
  const chars: HTMLElement[] = [];
  groups.forEach((line) => {
    const wrap = document.createElement('span');
    wrap.className = 'split-line';
    wrap.setAttribute('aria-hidden', 'true');
    const inner = document.createElement('span');
    inner.className = 'split-line-inner';
    line.forEach((w, i) => {
      inner.appendChild(w);
      if (i < line.length - 1) inner.appendChild(document.createTextNode(' '));
      w.querySelectorAll<HTMLElement>('.split-char').forEach((c) => chars.push(c));
    });
    wrap.appendChild(inner);
    el.appendChild(wrap);
  });
  return chars;
}

function buildSplit(el: HTMLElement) {
  el.dataset.splitDone = '1';
  const chars = splitToLines(el);
  el.style.opacity = '1';
  gsap.set(chars, { yPercent: 115 });

  // Above-the-fold headings (data-split="intro") cascade once on load, timed
  // to land as the intro cover lifts. Everything else is scrubbed to scroll.
  if (el.dataset.split === 'intro') {
    gsap.to(chars, {
      yPercent: 0,
      ease: 'power3.out',
      duration: 1.25,
      delay: 0.12,
      stagger: { each: 0.035, from: 'start' },
    });
    return;
  }

  const tween = gsap.to(chars, {
    yPercent: 0,
    ease: 'power4.out',
    stagger: { each: 0.018, from: 'start' },
    scrollTrigger: { trigger: el, start: 'top 90%', end: 'top 50%', scrub: 0.6 },
  });
  (el as any)._st = tween.scrollTrigger;
}

function initSplits() {
  document.querySelectorAll<HTMLElement>('[data-split]').forEach((el) => {
    if (!el.dataset.splitDone) buildSplit(el);
  });
}

function resplitAll() {
  document.querySelectorAll<HTMLElement>('[data-split]').forEach((el) => {
    (el as any)._st?.kill();
    (el as any)._hover?.kill(); // the characters it was holding are about to go
    delete el.dataset.splitDone;
    buildSplit(el);
  });
}

/* ================================================================== */
/* [data-reveal] — crisp clip-path wipes, opacity held at 1.          */
/*                                                                    */
/* Entrances are watched with IntersectionObserver, not ScrollTrigger. */
/* A reveal only ever asks one question — has this arrived yet — and   */
/* an observer answers it against the layout as it stands, every       */
/* frame, with nothing cached to fall out of date. The sweep at the    */
/* bottom of this block is the hard backstop under both.               */
/* ================================================================== */

/** Fully open. Every slot of every inset here carries a unit, in the from
 *  AND the to, and that is not cosmetic: GSAP tweens a clip-path by pulling
 *  the NUMBERS out of the two strings and reprinting them inside the target
 *  string's punctuation. Animate `100%` toward a bare `0` and the frames in
 *  between read `inset(0% 50 0% 0)` — not valid CSS, so the browser throws
 *  the whole declaration away and the element keeps the last value that did
 *  parse: the fully clipped one. It sits there invisible for the length of
 *  the tween and snaps open on the final frame, which is exactly the flicker
 *  this block used to produce on every left/right/diag reveal. */
const REVEAL_OPEN = 'inset(0% 0% 0% 0%)';
const REVEAL_DUR = 1.15;
const REVEAL_STEP = 0.09; // cascade spacing inside a group
const GROUP_LINE = 0.8; // a group starts when its top passes 80% of the viewport
const SOLO_LINE = 0.86; // a lone reveal waits a little longer
/** How long a reveal may sit past its own line, still clipped, before the
 *  sweep opens it outright. Twice the length of the tween, plus whatever
 *  cascade the element is owed on top (see guardReveal), so a healthy
 *  entrance never races it. */
const REVEAL_GRACE = 2600;

/** Pre-reveal state for a variant: clipped and offset, opacity forced to 1
 *  (global.css holds every reveal at 0 until we get here) so nothing ever
 *  cross-fades. The will-change belongs to the tween, not to this: a reveal
 *  can sit armed for the whole life of the page, and a page of permanently
 *  promoted layers costs real frames. */
function revealFrom(v: string): gsap.TweenVars {
  const from: gsap.TweenVars = { opacity: 1 };
  if (v === 'left') {
    from.clipPath = 'inset(0% 100% 0% 0%)';
    from.x = -42;
  } else if (v === 'right') {
    from.clipPath = 'inset(0% 0% 0% 100%)';
    from.x = 42;
  } else if (v === 'scale') {
    from.clipPath = 'inset(100% 0% 0% 0%)';
    from.scale = 0.9;
    from.y = 26;
  } else if (v === 'diag') {
    // Corner wipe: opens from the top-left, drifting in from the same corner.
    from.clipPath = 'inset(0% 100% 100% 0%)';
    from.x = -30;
    from.y = -30;
  } else {
    // up (default)
    from.clipPath = 'inset(100% 0% 0% 0%)';
    from.y = 36;
    from.scale = 0.99;
  }
  return from;
}

/** Landed: drop the clip and the promotion entirely rather than leaving an
 *  identity transform and a no-op inset behind, so a hovered row can push
 *  past its own box afterwards and a fixed child inside one is still
 *  positioned against the viewport. (filter stays in the clearProps list to
 *  scrub anything an older visit's inline style left behind.) */
function revealDone(el: HTMLElement) {
  el.dataset.revealed = '1';
  gsap.set(el, { clearProps: 'clipPath,filter,willChange,transform' });
}

/** The buttery settle: clip opens and the offset resolves over a long
 *  gentle decel, never a snap. No blur anywhere in it: the wipe and the
 *  drift are the whole entrance, and content is sharp from its first
 *  painted frame. */
function revealIn(el: HTMLElement, delay: number) {
  if (el.dataset.revealed) return;
  el.dataset.revealed = 'run';
  gsap.fromTo(
    el,
    { willChange: 'clip-path, transform' },
    {
      clipPath: REVEAL_OPEN,
      x: 0,
      y: 0,
      scale: 1,
      duration: REVEAL_DUR,
      delay,
      ease: 'power2.out',
      overwrite: 'auto',
      onComplete: () => revealDone(el),
    }
  );
}

/** Open with no entrance: for reveals the reader has already scrolled past,
 *  and for the sweep. Idempotent. */
function revealNow(el: HTMLElement) {
  if (el.dataset.revealed === '1') return;
  gsap.killTweensOf(el);
  el.style.opacity = '1';
  revealDone(el);
}

/* --- the entrance watcher ----------------------------------------- */
/* One observer per line. The negative bottom margin shrinks the root so
   that "intersecting" means "this element's top has climbed past that
   fraction of the viewport": the same moment the old ScrollTrigger start
   described, minus the cached offset it described it with. */
const enterWatchers = new Map<number, IntersectionObserver>();
const enterJobs = new WeakMap<Element, () => void>();

function onEnter(el: HTMLElement, line: number, fire: () => void) {
  enterJobs.set(el, fire);
  let io = enterWatchers.get(line);
  if (!io) {
    io = new IntersectionObserver(
      (entries, obs) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          obs.unobserve(entry.target);
          const job = enterJobs.get(entry.target);
          enterJobs.delete(entry.target);
          job?.();
        }
      },
      { rootMargin: `0px 0px -${Math.round((1 - line) * 100)}% 0px` }
    );
    enterWatchers.set(line, io);
  }
  io.observe(el);
}

/* --- the hard backstop -------------------------------------------- */
/* Whatever the watcher does or fails to do, nothing stays hidden once it
   has been on screen. Built out of a timer and getBoundingClientRect and
   nothing else, on purpose: if the observer, GSAP, ScrollTrigger or Lenis
   is the thing that broke, this still runs. It stops itself the moment the
   last reveal has landed, so the steady-state cost is zero. */
const guarded = new Map<HTMLElement, { line: number; grace: number; since: number }>();
let sweep: number | undefined;

/** `owed` is whatever this element legitimately waits out before its own
 *  tween starts (its place in a cascade, its authored delay), so a long list
 *  can never outrun its own backstop. */
function guardReveal(el: HTMLElement, line: number, owed = 0) {
  guarded.set(el, { line, grace: REVEAL_GRACE + owed * 1000, since: 0 });
}

function startRevealSweep() {
  if (sweep || !guarded.size) return;
  sweep = window.setInterval(() => {
    const now = performance.now();
    const vh = window.innerHeight || 1;
    guarded.forEach((state, el) => {
      if (el.dataset.revealed === '1' || !el.isConnected) {
        guarded.delete(el);
        return;
      }
      const r = el.getBoundingClientRect();
      // Collapsed or display:none: not on screen at all, so its entrance is
      // still owed to it. Restart the clock when it comes back.
      if (!r.width && !r.height) {
        state.since = 0;
        return;
      }
      if (r.top > vh * state.line) {
        state.since = 0; // hasn't reached its own line yet: nothing is wrong
        return;
      }
      if (!state.since) {
        state.since = now;
        return;
      }
      if (now - state.since < state.grace) return;
      revealNow(el);
      guarded.delete(el);
    });
    if (!guarded.size) {
      clearInterval(sweep);
      sweep = undefined;
    }
  }, 400);
}

function initReveals() {
  const bound = new WeakSet<HTMLElement>();
  const passed = (el: HTMLElement) => el.getBoundingClientRect().bottom <= 0;

  // Grouped reveals cascade off the GROUP's line, so siblings stagger as one
  // wave instead of each racing its own (which reads as a flash). Each item
  // is guarded against its own line, not the group's, so a long list can
  // never trip the backstop on the rows it has not reached yet.
  document.querySelectorAll<HTMLElement>('[data-reveal-group]').forEach((group) => {
    const items = gsap.utils
      .toArray<HTMLElement>('[data-reveal]', group)
      .filter((el) => !bound.has(el)); // nested groups: the outer one doesn't re-claim
    if (!items.length) return;
    items.forEach((el) => {
      bound.add(el);
      gsap.set(el, revealFrom(el.getAttribute('data-reveal') || 'up'));
    });
    if (passed(group)) {
      // Already scrolled by: play nothing, just be there.
      items.forEach(revealNow);
      return;
    }
    onEnter(group, GROUP_LINE, () => items.forEach((el, i) => revealIn(el, i * REVEAL_STEP)));
    items.forEach((el, i) => guardReveal(el, GROUP_LINE, i * REVEAL_STEP));
  });

  // Standalone reveals.
  gsap.utils.toArray<HTMLElement>('[data-reveal]').forEach((el) => {
    if (bound.has(el)) return;
    bound.add(el);
    gsap.set(el, revealFrom(el.getAttribute('data-reveal') || 'up'));
    if (passed(el)) {
      revealNow(el);
      return;
    }
    const delay = (parseFloat(el.dataset.revealDelay || '0') || 0) / 1000;
    onEnter(el, SOLO_LINE, () => revealIn(el, delay));
    guardReveal(el, SOLO_LINE, delay);
  });

  startRevealSweep();
}

/* [data-reveal-scrub] — the same wipe, but locked to scroll progress.
   Units in every slot, for the reason spelled out at REVEAL_OPEN. */
function initScrubReveals() {
  gsap.utils.toArray<HTMLElement>('[data-reveal-scrub]').forEach((el) => {
    const v = el.getAttribute('data-reveal-scrub') || 'up';
    const hidden =
      v === 'left'
        ? 'inset(0% 100% 0% 0%)'
        : v === 'right'
          ? 'inset(0% 0% 0% 100%)'
          : 'inset(100% 0% 0% 0%)';
    gsap.fromTo(
      el,
      { clipPath: hidden, opacity: 1 },
      {
        clipPath: REVEAL_OPEN,
        ease: 'none',
        scrollTrigger: { trigger: el, start: 'top 90%', end: 'top 55%', scrub: 0.5 },
      }
    );
  });
}

/* ================================================================== */
/* [data-parallax="±px"] — depth via scrubbed y shift.                */
/* ================================================================== */
function initParallax() {
  document.querySelectorAll<HTMLElement>('[data-parallax]').forEach((el) => {
    const s = parseFloat(el.dataset.parallax || '-60');
    gsap.fromTo(
      el,
      { y: -s },
      {
        y: s,
        ease: 'none',
        scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: true },
      }
    );
  });
}

/* ================================================================== */
/* [data-hover-preview] — a row reveals its image beside the cursor.  */
/* Wrapper [data-preview-root] holds one shared floating <img>.        */
/* ================================================================== */
function initHoverPreview() {
  const rootEl = document.querySelector<HTMLElement>('[data-preview-root]');
  const img = rootEl?.querySelector<HTMLImageElement>('[data-preview-img]');
  if (!rootEl || !img) return;
  const xTo = gsap.quickTo(img, 'x', { duration: 0.5, ease: 'power3.out' });
  const yTo = gsap.quickTo(img, 'y', { duration: 0.5, ease: 'power3.out' });
  let raf = 0;
  rootEl.addEventListener('pointermove', (e) => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const r = rootEl.getBoundingClientRect();
      xTo(e.clientX - r.left);
      yTo(e.clientY - r.top);
    });
  });
  rootEl.querySelectorAll<HTMLElement>('[data-hover-preview]').forEach((rowEl) => {
    rowEl.addEventListener('pointerenter', () => {
      const src = rowEl.dataset.hoverPreview;
      if (src) img.src = src;
      gsap.to(img, { autoAlpha: 1, scale: 1, duration: 0.35, ease: 'power3.out' });
    });
    rowEl.addEventListener('pointerleave', () =>
      gsap.to(img, { autoAlpha: 0, scale: 0.9, duration: 0.3, ease: 'power2.out' })
    );
  });
}

/* ================================================================== */
/* [data-cursor-card="id"] — hover detail rides the pointer.          */
/* The card is #id (.cursor-card): parked fixed at 0,0 and moved by    */
/* transform only, so hovering never touches layout. Any number of     */
/* triggers may share one card; the last pointer in owns it.           */
/* Pointer-fine only (coarse pointers keep the static fallback).       */
/* ================================================================== */
function initCursorCards() {
  const OFF_X = 20; // the card rides off the pointer's shoulder,
  const OFF_Y = 16; // never under the arrow itself
  const EDGE = 12; // and never touching the viewport rim

  type Rig = {
    card: HTMLElement;
    owner: HTMLElement | null; // which trigger currently holds the card
    shown: boolean;
    /** `data-cursor-cut`: appear and vanish outright, never fade. A card
     *  carrying a picture wants this. Fading one out while its neighbour
     *  fades in leaves two half-transparent images crossing on the pointer,
     *  which smears into each other when the hand moves down a list fast. */
    cut: boolean;
    w: number;
    h: number;
    xTo?: (v: number) => void;
    yTo?: (v: number) => void;
  };

  const rigs = new Map<string, Rig>();
  const rigFor = (id: string): Rig | null => {
    const known = rigs.get(id);
    if (known) return known;
    const card = document.getElementById(id);
    if (!card) return null;
    // The card duplicates information the trigger already carries: it is
    // decoration to a screen reader.
    if (!card.hasAttribute('aria-hidden')) card.setAttribute('aria-hidden', 'true');
    const cut = card.hasAttribute('data-cursor-cut');
    // A cut card keeps its size: scaling it up from 0.92 on every appearance
    // is the same smear by another route.
    gsap.set(card, { autoAlpha: 0, scale: cut ? 1 : 0.92 }); // the resting state
    const rig: Rig = { card, owner: null, shown: false, cut, w: 0, h: 0 };
    rigs.set(id, rig);
    return rig;
  };

  // Beside the cursor, flipped to the other side when that edge is close,
  // then clamped so a corner hover can still never push the card off screen.
  const place = (rig: Rig, cx: number, cy: number) => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const x = cx + OFF_X + rig.w > vw - EDGE ? cx - OFF_X - rig.w : cx + OFF_X;
    const y = cy + OFF_Y + rig.h > vh - EDGE ? cy - OFF_Y - rig.h : cy + OFF_Y;
    return {
      x: gsap.utils.clamp(EDGE, Math.max(EDGE, vw - rig.w - EDGE), x),
      y: gsap.utils.clamp(EDGE, Math.max(EDGE, vh - rig.h - EDGE), y),
    };
  };

  // A card that is fully hidden starts its next life AT the pointer: drop the
  // old followers, set the transform outright, then rebuild the quickTos so
  // they lerp from here instead of flying across the page (or in from 0,0).
  const snap = (rig: Rig, x: number, y: number) => {
    gsap.killTweensOf(rig.card, 'x,y');
    gsap.set(rig.card, { x, y });
    rig.xTo = gsap.quickTo(rig.card, 'x', { duration: 0.45, ease: 'power3.out' });
    rig.yTo = gsap.quickTo(rig.card, 'y', { duration: 0.45, ease: 'power3.out' });
  };

  document.querySelectorAll<HTMLElement>('[data-cursor-card]').forEach((trigger) => {
    const id = trigger.dataset.cursorCard;
    const rig = id ? rigFor(id) : null;
    if (!rig) return;
    let raf = 0;

    trigger.addEventListener('pointerenter', (e) => {
      rig.owner = trigger;
      // Measured once per hover, never per move. The card is hidden, not
      // display:none, so its box is real.
      rig.w = rig.card.offsetWidth;
      rig.h = rig.card.offsetHeight;
      const p = place(rig, e.clientX, e.clientY);
      if (rig.shown) {
        // Handed straight from a sibling trigger: glide, don't teleport.
        rig.xTo?.(p.x);
        rig.yTo?.(p.y);
      } else {
        snap(rig, p.x, p.y);
      }
      rig.shown = true;
      if (rig.cut) {
        gsap.killTweensOf(rig.card, 'autoAlpha,opacity,visibility,scale');
        gsap.set(rig.card, { autoAlpha: 1, scale: 1 });
      } else {
        gsap.to(rig.card, {
          autoAlpha: 1,
          scale: 1,
          duration: 0.3,
          ease: 'power3.out',
          overwrite: 'auto',
        });
      }
    });

    // One follow per frame: pointermove fires far faster than we can paint.
    trigger.addEventListener('pointermove', (e) => {
      if (rig.owner !== trigger || raf) return;
      const cx = e.clientX;
      const cy = e.clientY;
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (rig.owner !== trigger) return;
        const p = place(rig, cx, cy);
        rig.xTo?.(p.x);
        rig.yTo?.(p.y);
      });
    });

    trigger.addEventListener('pointerleave', () => {
      if (rig.owner !== trigger) return; // a sibling already took the card over
      rig.owner = null;
      if (rig.cut) {
        gsap.killTweensOf(rig.card, 'autoAlpha,opacity,visibility,scale');
        gsap.set(rig.card, { autoAlpha: 0 });
        rig.shown = false; // gone this frame: the next hover snaps
        return;
      }
      gsap.to(rig.card, {
        autoAlpha: 0,
        scale: 0.92,
        duration: 0.25,
        ease: 'power2.out',
        overwrite: 'auto',
        onComplete: () => {
          if (!rig.owner) rig.shown = false; // fully gone: next hover snaps
        },
      });
    });
  });
}

/* ================================================================== */
/* SCENE: cover wipe (home). [data-cover-wipe]'s hero pins at the top   */
/* and slides off to the LEFT, scroll-locked, while the section beneath */
/* sits already pinned in place (geometry in index.astro). Transform    */
/* only; the sticky release does the rest.                              */
/* ================================================================== */
function initCoverWipe() {
  // A desktop scene: on touch the page scrolls straight through instead.
  // index.astro withholds the pin geometry behind the same media query, so
  // the two can never disagree about whether the wipe exists.
  if (!FINE) return;
  const wrap = document.querySelector<HTMLElement>('[data-cover-wipe]');
  const cover = wrap?.firstElementChild as HTMLElement | null;
  if (!wrap || !cover) return;
  // [data-cover-deep] is the cover's far plane (the hero's wordmark). It
  // travels well behind the sheet, so the sheet's own trailing edge crops it
  // on the way out and the exit reads as two planes at two speeds instead of
  // one flat slab. Both planes ride ONE timeline: on separate triggers a
  // stray refresh could leave them scrubbing against slightly different
  // offsets.
  const deep = cover.querySelector<HTMLElement>('[data-cover-deep]');
  // 1.6 viewports of scroll for one viewport of travel: the hero takes its
  // time leaving. The distance is measured off the wrapper's own spacer
  // (wrapper height minus the hero) rather than recomputed from
  // innerHeight, so the trigger's end and index.astro's svh-authored
  // geometry can never disagree, URL bars included.
  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: wrap,
      start: 'top top',
      end: () => `+=${wrap.offsetHeight - cover.offsetHeight}`,
      scrub: 0.4,
      invalidateOnRefresh: true,
    },
  });
  tl.to(cover, { xPercent: -100, ease: 'none' }, 0);
  // 42, not a subtle lag: the word gives up almost half the sheet's travel,
  // so the two planes visibly shear apart while the wipe runs.
  if (deep) tl.to(deep, { xPercent: 42, ease: 'none' }, 0);

  // A /#team deep link was resolved by the browser before html.gsap pulled
  // the roster to the document top, which leaves the page parked mid-wipe.
  // Re-land it at the wipe's end unless the reader has already taken over.
  if (location.hash === '#team') {
    let landing = true;
    const stop = () => (landing = false);
    addEventListener('wheel', stop, { passive: true, once: true });
    addEventListener('touchstart', stop, { passive: true, once: true });
    addEventListener('keydown', stop, { once: true });
    const land = () => {
      if (!landing) return;
      const end = wrap.offsetHeight - cover.offsetHeight;
      const lenis = (window as any).__motion?.lenis;
      if (lenis?.scrollTo) lenis.scrollTo(end, { immediate: true, force: true });
      else window.scrollTo(0, end);
    };
    requestAnimationFrame(land);
    addEventListener('load', land, { once: true });
    setTimeout(stop, 1400);
  }
}

/* ================================================================== */
/* Deep-link landings. The browser resolves a fragment while this module */
/* is still booting, and its own smooth-scroll animation then fights the */
/* Lenis instance that has just taken the page over: the two animators   */
/* trade the scroll position and the landing dies wherever the fight     */
/* ends (coming back from a blog post to /#outreach landed at the top).  */
/* So once the engine owns the page, the landing is re-done here, once,  */
/* immediately, unless the reader has already started driving. #team and */
/* #contact keep their own smarter landings (the wipe end and the REACH  */
/* level); this covers every other section.                              */
/* ================================================================== */
function initHashLand() {
  const hash = location.hash;
  if (!hash || hash === '#team' || hash === '#contact') return;
  let target: HTMLElement | null = null;
  try {
    target = document.querySelector<HTMLElement>(hash);
  } catch {
    return; // not a selector-safe fragment: nothing to land on
  }
  if (!target) return;
  let landing = true;
  const stop = () => (landing = false);
  addEventListener('wheel', stop, { passive: true, once: true });
  addEventListener('touchstart', stop, { passive: true, once: true });
  addEventListener('keydown', stop, { once: true });
  const land = () => {
    if (!landing) return;
    const y = target!.getBoundingClientRect().top + window.scrollY;
    const lenis = (window as any).__motion?.lenis;
    if (lenis?.scrollTo) lenis.scrollTo(y, { immediate: true, force: true });
    else window.scrollTo(0, y);
  };
  requestAnimationFrame(land);
  addEventListener('load', land, { once: true });
  setTimeout(stop, 1400);
}

/* ================================================================== */
/* SCENE: the immersive ONYX journey (home). One continuous take: the   */
/* camera tracks across the big 3D word left to right, and as each       */
/* letter fills the frame its content is born from inside it and runs    */
/* around it. The word is rendered large and only ever scaled DOWN, so   */
/* the letters stay razor-crisp at every step (no upscaled-texture blur).*/
/* ================================================================== */
/**
 * Per-letter personality.
 *   dx/dy   — assemble scatter, as a fraction of the word's own size
 *   iz..isc — assemble depth / rotation / scale
 *   iy..izF — idle float amplitudes (px, or degrees for rotation)
 *   depth/tilt — cursor-lean strength (px of slide, deg of turn)
 */
type LetterProfile = {
  dx: number; dy: number; iz: number; iry: number; irz: number; irx: number; isc: number;
  iy: number; irzF: number; irxF: number; izF: number; dur: number;
  depth: number; tilt: number;
};

// Direction each letter's content flows: in from `i*`, out toward `o*`.
// Echoes the letter's geometry (N diagonal, Y vertical, X cross, O bloom).
const FLOW = [
  { ix: 0, iy: 34, ox: 0, oy: -48 },
  { ix: -60, iy: 54, ox: 84, oy: -70 },
  { ix: 0, iy: -52, ox: 0, oy: 66 },
  { ix: -64, iy: -46, ox: 82, oy: 58 },
];

const SHOWN = 'inset(-6% -6% -12% -6%)'; // fully revealed, room for descenders
const HID_BELOW = 'inset(100% -6% -12% -6%)'; // clipped from the top: rises up
const HID_ABOVE = 'inset(-6% -6% 100% -6%)'; // clipped from the bottom: exits up

function initJourney() {
  const journey = document.querySelector<HTMLElement>('.journey');
  const stage = journey?.querySelector<HTMLElement>('.journey-stage');
  const world = document.querySelector<HTMLElement>('[data-world]');
  if (!journey || !stage || !world) return;
  const letters = gsap.utils.toArray<HTMLElement>('.station-letter', world);
  const groups = gsap.utils.toArray<HTMLElement>('[data-flow]');
  const cue = document.querySelector<HTMLElement>('[data-journey-cue]');
  if (!letters.length) return;

  const SF = 1; // focus scale: never above 1, so text is never upscaled
  const Ww = world.scrollWidth;
  const Wh = world.offsetHeight;

  // Overview: the whole word, scaled DOWN to fit with margins.
  const fit = Math.min((window.innerWidth * 0.9) / Ww, (window.innerHeight * 0.82) / Wh);
  const overX = () => window.innerWidth / 2 - fit * (Ww / 2);
  const overY = () => window.innerHeight / 2 - fit * (Wh / 2);

  gsap.set(world, { transformOrigin: '0 0', x: overX(), y: overY(), scale: fit, force3D: true });
  gsap.set(letters, { opacity: 1 }); // inline beats html.will-animate pre-hide

  const lines = groups.flatMap((g) => gsap.utils.toArray<HTMLElement>('.flow-line', g));
  gsap.set(groups, { opacity: 1, visibility: 'hidden' });
  gsap.set(lines, { clipPath: HID_BELOW });

  const P: LetterProfile[] = [
    { dx: -1, dy: -0.18, iz: -600, iry: 120, irz: -16, irx: 0, isc: 0.5,
      iy: -10, irzF: 2.2, irxF: 0, izF: 30, dur: 5.4, depth: 22, tilt: 8 },
    { dx: 0, dy: -1, iz: -320, iry: 0, irz: 0, irx: -80, isc: 0.6,
      iy: 9, irzF: 0, irxF: 4, izF: 22, dur: 4.7, depth: 14, tilt: 6 },
    { dx: 0, dy: 1, iz: -560, iry: 0, irz: 90, irx: 0, isc: 0.5,
      iy: -12, irzF: -3, irxF: 0, izF: 44, dur: 6.1, depth: 18, tilt: 7 },
    { dx: 1, dy: 0.18, iz: -820, iry: -120, irz: 24, irx: 0, isc: 0.5,
      iy: 8, irzF: 3.2, irxF: 3, izF: 26, dur: 5.0, depth: 26, tilt: 9 },
  ];

  let calm = 0; // 0 at the top, -> 1 once the camera starts tracking
  let alive = false; // idle float + cursor lean run only after the assemble

  // Center letter i at scale s. Measured from the letter's untransformed box
  // (world transform-origin 0 0 => screen = translate + scale*pos); the idle /
  // lean transforms don't move offsetLeft, so this stays exact.
  const camFor = (i: number) => {
    const L = letters[i];
    const cx = L.offsetLeft + L.offsetWidth / 2;
    const cy = L.offsetTop + L.offsetHeight / 2;
    return { x: window.innerWidth / 2 - SF * cx, y: window.innerHeight / 2 - SF * cy };
  };

  // Idle float: desynced sine oscillations; y/rz/rx/z belong to the letter,
  // cursor owns x + rotationY, so nothing fights over a property.
  const startIdle = (L: HTMLElement, p: LetterProfile, i: number) => {
    const f = (prop: string, amp: number, mult: number) =>
      gsap.to(L, { [prop]: amp, duration: p.dur * mult, ease: 'sine.inOut', repeat: -1, yoyo: true, delay: i * 0.18 });
    if (p.iy) f('y', p.iy, 1);
    if (p.irzF) f('rotationZ', p.irzF, 1.35);
    if (p.irxF) f('rotationX', p.irxF, 1.1);
    if (p.izF) f('z', p.izF, 0.85);
  };

  const startAlive = () => {
    if (alive) return;
    alive = true;
    letters.forEach((L, i) => startIdle(L, P[i], i));
  };

  // Assemble: the letters fly in from their scattered starts to build the
  // word. Only at the very top; a mid-page reload skips it.
  if (window.scrollY < 12) {
    const intro = gsap.timeline({ delay: 0.15, onComplete: startAlive });
    letters.forEach((L, i) => {
      const p = P[i];
      intro.from(
        L,
        { opacity: 0, x: p.dx * Ww * 0.55, y: p.dy * Wh * 0.55, z: p.iz, rotationY: p.iry, rotationZ: p.irz, rotationX: p.irx, scale: p.isc, ease: 'expo.out', duration: 1.5 },
        i * 0.13
      );
    });
  } else {
    startAlive();
  }

  // Cursor lean: each letter turns and slides toward the pointer by its own
  // depth, fading out (k = 1 - calm) as tracking begins. Pointer-fine only.
  if (FINE) {
    let px = 0;
    const setX = letters.map((L) => gsap.quickTo(L, 'x', { duration: 0.7, ease: 'power3.out' }));
    const setRY = letters.map((L) => gsap.quickTo(L, 'rotationY', { duration: 0.7, ease: 'power3.out' }));
    stage.addEventListener('pointermove', (e) => {
      const r = stage.getBoundingClientRect();
      px = ((e.clientX - r.left) / r.width - 0.5) * 2;
    });
    stage.addEventListener('pointerleave', () => (px = 0));
    gsap.ticker.add(() => {
      if (!alive) return;
      const k = 1 - calm;
      for (let i = 0; i < letters.length; i++) {
        setX[i](px * P[i].depth * k);
        setRY[i](px * P[i].tilt * k);
      }
    });
  }

  // Content born from a letter: lines rise out of it, staggered, drifting in
  // from the letter's flow direction. Crisp clip reveal, opacity stays 1.
  const flowIn = (i: number) => {
    const t = gsap.timeline();
    const ln = gsap.utils.toArray<HTMLElement>('.flow-line', groups[i]);
    t.set(groups[i], { visibility: 'visible' });
    t.fromTo(
      ln,
      { clipPath: HID_BELOW, x: FLOW[i].ix, y: FLOW[i].iy },
      { clipPath: SHOWN, x: 0, y: 0, ease: 'power3.out', duration: 0.85, stagger: 0.08 }
    );
    return t;
  };

  // Content clears out, sweeping along the letter's flow direction.
  const flowOut = (i: number) => {
    const t = gsap.timeline();
    const ln = gsap.utils.toArray<HTMLElement>('.flow-line', groups[i]);
    t.to(ln, { clipPath: HID_ABOVE, x: FLOW[i].ox, y: FLOW[i].oy, ease: 'power2.in', duration: 0.6, stagger: 0.05 });
    t.set(groups[i], { visibility: 'hidden' });
    return t;
  };

  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: journey,
      start: 'top top',
      end: '+=720%',
      pin: true,
      scrub: 0.9,
      anticipatePin: 1,
      invalidateOnRefresh: true,
      onUpdate: (self) => (calm = Math.min(1, self.progress / 0.05)),
    },
  });

  if (cue) tl.to(cue, { autoAlpha: 0, duration: 0.3 }, 0);

  groups.forEach((_, i) => {
    tl.to(world, {
      x: () => camFor(i).x,
      y: () => camFor(i).y,
      scale: SF,
      ease: 'power1.inOut',
      duration: 1.5,
    });
    tl.add(flowIn(i), '<0.55'); // content arrives as the letter settles
    tl.to({}, { duration: 0.95 }); // read
    if (i < groups.length - 1) tl.add(flowOut(i));
  });

  // Close: pull back to the whole word as a sign-off.
  tl.to(world, { x: () => overX(), y: () => overY(), scale: fit, ease: 'power1.inOut', duration: 1.6 });
}

/* SCENE: horizontal text reveal (mission). [data-hreveal] chars wipe   */
/* brighter across on scrub. */
function initHorizontalReveal() {
  const el = document.querySelector<HTMLElement>('[data-hreveal]');
  if (!el) return;
  const chars = splitToLines(el);
  el.style.opacity = '1';
  gsap.set(chars, { opacity: 0.14 });
  gsap.to(chars, {
    opacity: 1,
    ease: 'none',
    stagger: 0.02,
    scrollTrigger: { trigger: el, start: 'top 80%', end: 'bottom 55%', scrub: 0.5 },
  });
}

/* SCENE: build-log drift (season). [data-hscroll] pins and pans its      */
/* [data-hscroll-track] on a shallow DIAGONAL — the log climbs as the     */
/* season advances — while panels counter-drift vertically in alternation */
/* (a cross-current inside the pan) and the whole track skews with scroll */
/* velocity, springing straight as it settles. */
function initHScroll() {
  const wrap = document.querySelector<HTMLElement>('[data-hscroll]');
  const track = wrap?.querySelector<HTMLElement>('[data-hscroll-track]');
  if (!wrap || !track) return;
  const distance = () => track.scrollWidth - window.innerWidth;
  const skewTo = gsap.quickTo(track, 'skewX', { duration: 0.45, ease: 'power2.out' });
  gsap.fromTo(track,
    { y: () => window.innerHeight * 0.055 },
    {
      x: () => -distance(),
      y: () => -window.innerHeight * 0.055,
      ease: 'none',
      scrollTrigger: {
        trigger: wrap,
        start: 'top top',
        end: () => `+=${distance()}`,
        pin: true,
        scrub: 0.6,
        invalidateOnRefresh: true,
        onUpdate: (self) => skewTo(gsap.utils.clamp(-3.5, 3.5, self.getVelocity() / 260)),
      },
    });
  // The cross-current: odd panels ride up while even panels sink, so
  // neighbours pass each other mid-pan.
  gsap.utils.toArray<HTMLElement>('.hscroll-panel', track).forEach((panel, i) => {
    gsap.fromTo(panel, { y: i % 2 ? -42 : 42 }, {
      y: i % 2 ? 42 : -42,
      ease: 'none',
      scrollTrigger: {
        trigger: wrap,
        start: 'top top',
        end: () => `+=${distance()}`,
        scrub: 0.9,
        invalidateOnRefresh: true,
      },
    });
  });
}

/* SCENE: screen-on (season highlight match). [data-screen] opens like a  */
/* cinema screen: the letterbox bars part from the centre, locked to      */
/* scroll, so the match slot literally powers on as it enters. */
function initScreens() {
  gsap.utils.toArray<HTMLElement>('[data-screen]').forEach((el) => {
    gsap.fromTo(
      el,
      { clipPath: 'inset(50% 0% 50% 0%)', opacity: 1 },
      {
        clipPath: REVEAL_OPEN,
        ease: 'none',
        scrollTrigger: { trigger: el, start: 'top 88%', end: 'top 38%', scrub: 0.5 },
      }
    );
  });
}

/* SCENE: gallery cross-drift (season). Sibling [data-drift="±px"]        */
/* columns scrub in opposite directions, so the photo grid shears and     */
/* crosses as it passes — depth without cards. */
function initDriftCols() {
  gsap.utils.toArray<HTMLElement>('[data-drift]').forEach((col) => {
    const d = parseFloat(col.dataset.drift || '40');
    gsap.fromTo(col, { y: d }, {
      y: -d,
      ease: 'none',
      scrollTrigger: {
        trigger: col.parentElement,
        start: 'top bottom',
        end: 'bottom top',
        scrub: true,
      },
    });
  });
}

/* [data-tilt] — glass panels lean toward the cursor (contact). The one   */
/* pointer-depth effect outside the hero. Pointer-fine only. */
/* -------------------------------------------------------------------- */
/* SCENE: floating cards. [data-float] tracks the pointer; each          */
/* [data-float-card] drifts by its own depth and tilts toward the        */
/* cursor, over a slow idle bob. Masked rise on entry, then the clip is  */
/* released so the tilt is never cropped. Reduced motion skips all of it */
/* (this whole module bows out); coarse pointers keep just the idle bob. */
function initFloatCards() {
  const wrap = document.querySelector<HTMLElement>('[data-float]');
  if (!wrap) return;
  const cards = gsap.utils.toArray<HTMLElement>('[data-float-card]', wrap);
  if (!cards.length) return;

  // Masked rise on entry, staggered; release the clip once open so the
  // pointer tilt below can push a card past its box without being cropped.
  gsap.set(cards, { clipPath: 'inset(100% 0% 0% 0%)', y: 28 });
  ScrollTrigger.create({
    trigger: wrap,
    start: 'top 82%',
    once: true,
    onEnter: () =>
      gsap.to(cards, {
        clipPath: REVEAL_OPEN,
        y: 0,
        duration: 1.05,
        ease: 'expo.out',
        stagger: 0.09,
        onComplete: () => gsap.set(cards, { clipPath: 'none' }),
      }),
  });

  // Slow idle bob on an inner wrapper (kept off the pointer transforms).
  cards.forEach((card, i) => {
    const inner = card.querySelector<HTMLElement>('.float-inner') ?? card;
    gsap.to(inner, {
      y: '+=9',
      duration: 3.2 + i * 0.5,
      ease: 'sine.inOut',
      repeat: -1,
      yoyo: true,
      delay: i * 0.3,
    });
  });

  if (!FINE) return;

  gsap.set(cards, { transformPerspective: 950, transformOrigin: 'center' });
  const rig = cards.map((card) => ({
    depth: parseFloat(card.dataset.depth || '20'),
    x: gsap.quickTo(card, 'x', { duration: 0.8, ease: 'power3.out' }),
    y: gsap.quickTo(card, 'y', { duration: 0.8, ease: 'power3.out' }),
    rx: gsap.quickTo(card, 'rotationX', { duration: 0.6, ease: 'power3.out' }),
    ry: gsap.quickTo(card, 'rotationY', { duration: 0.6, ease: 'power3.out' }),
    card,
  }));

  // Pointer position over the whole group drifts every card by its depth.
  wrap.addEventListener('pointermove', (e) => {
    const r = wrap.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    rig.forEach((c) => {
      c.x(px * c.depth);
      c.y(py * c.depth);
    });
  });
  wrap.addEventListener('pointerleave', () => rig.forEach((c) => (c.x(0), c.y(0))));

  // Hovering a single card tilts it toward the cursor.
  rig.forEach((c) => {
    c.card.addEventListener('pointermove', (e) => {
      const r = c.card.getBoundingClientRect();
      c.rx(((e.clientY - r.top) / r.height - 0.5) * -11);
      c.ry(((e.clientX - r.left) / r.width - 0.5) * 11);
    });
    c.card.addEventListener('pointerleave', () => (c.rx(0), c.ry(0)));
  });
}

function initTilt() {
  document.querySelectorAll<HTMLElement>('[data-tilt]').forEach((el) => {
    gsap.set(el, { transformPerspective: 900 });
    const rx = gsap.quickTo(el, 'rotationX', { duration: 0.5, ease: 'power3.out' });
    const ry = gsap.quickTo(el, 'rotationY', { duration: 0.5, ease: 'power3.out' });
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      rx(((e.clientY - r.top) / r.height - 0.5) * -6);
      ry(((e.clientX - r.left) / r.width - 0.5) * 6);
    });
    el.addEventListener('pointerleave', () => {
      rx(0);
      ry(0);
    });
  });
}

/* SCENE: flip cards (season awards). [data-flip] turns in on enter.    */
function initFlip() {
  const cards = gsap.utils.toArray<HTMLElement>('[data-flip]');
  if (!cards.length) return;
  cards.forEach((card) => {
    gsap.set(card, { rotationY: -100, transformPerspective: 800, transformOrigin: '50% 50%' });
    ScrollTrigger.create({
      trigger: card,
      start: 'top 84%',
      once: true,
      onEnter: () =>
        gsap.to(card, {
          rotationY: 0,
          duration: 0.9,
          ease: 'power3.out',
          delay: (parseFloat(card.dataset.flipDelay || '0') || 0) / 1000,
        }),
    });
  });
}

/* SCENE: tier ladder (contact). [data-ladder] > [data-rung] lock in    */
/* one at a time on scrub via a left-to-right clip. */
function initTierLadder() {
  const ladder = document.querySelector<HTMLElement>('[data-ladder]');
  if (!ladder) return;
  gsap.utils.toArray<HTMLElement>('[data-rung]', ladder).forEach((r) => {
    gsap.fromTo(
      r,
      { clipPath: 'inset(0% 100% 0% 0%)', opacity: 1 },
      {
        clipPath: REVEAL_OPEN,
        ease: 'none',
        scrollTrigger: { trigger: r, start: 'top 88%', end: 'top 62%', scrub: 0.5 },
      }
    );
  });
}

/* SCENE: reading progress bar (blog post). [data-progress] fills.      */
function initProgress() {
  const bar = document.querySelector<HTMLElement>('[data-progress]');
  const article = document.querySelector<HTMLElement>('article');
  if (!bar || !article) return;
  gsap.fromTo(
    bar,
    { scaleX: 0 },
    {
      scaleX: 1,
      ease: 'none',
      transformOrigin: '0 0',
      scrollTrigger: { trigger: article, start: 'top top', end: 'bottom bottom', scrub: 0.3 },
    }
  );
}

/* SCENE: roster coverflow (home). [data-coverflow] via Swiper.         */
async function initRoster() {
  const el = document.querySelector<HTMLElement>('[data-coverflow]');
  if (!el) return;
  try {
    const [{ default: Swiper }, mods] = await Promise.all([
      import('swiper'),
      import('swiper/modules'),
    ]);
    await import('swiper/css');
    await import('swiper/css/effect-coverflow');
    new Swiper(el, {
      modules: [mods.EffectCoverflow, mods.Keyboard, mods.A11y],
      effect: 'coverflow',
      grabCursor: true,
      centeredSlides: true,
      slidesPerView: 'auto',
      loop: true,
      keyboard: { enabled: true },
      coverflowEffect: { rotate: 28, stretch: 0, depth: 160, modifier: 1, slideShadows: false },
    });
  } catch (e) {
    /* carousel degrades to a plain scrollable row if Swiper fails */
  }
}
