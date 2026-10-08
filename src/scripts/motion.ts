/**
 * motion — the site's motion engine.
 *
 * One GSAP + ScrollTrigger layer wired to Lenis so smooth scroll and
 * scroll-driven animation share a single clock. Everything is:
 *   - motivated (each effect communicates hierarchy, story, or feedback)
 *   - scroll-locked (the page's own travel drives it, never a timer)
 *   - reduced-motion safe (the module bows out; the page is already whole)
 *   - transform / opacity / clip-path only (GPU, no layout thrash)
 *
 * Nothing here animates text into place: headings, body copy and buttons
 * are printed and finished on the first frame. What is left is the
 * pointer-following cards plus the named scroll scenes, each of which only
 * runs when its element is on the page. See DESIGN.md.
 */
import Lenis from 'lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const root = document.documentElement;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const FINE = matchMedia('(hover: hover) and (pointer: fine)').matches;

/* Nothing on the page is hidden waiting for this module, so there is no
   rescue path to run: under reduced motion, or if the engine throws on the
   way up, the page simply stands as authored. */
if (!REDUCED) {
  try {
    boot();
  } catch (err) {
    root.classList.remove('gsap');
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
  // The cover is down: hold the page still under it. global.css locks the
  // document's own overflow; this is the same instruction to Lenis, which
  // scrolls by script and would otherwise keep its own wheel momentum and
  // spend it the moment the lock came off.
  if (root.classList.contains('loading')) lenis.stop();
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
      if (FINE) initCursorCards();
      // scenes (each no-ops if its element is absent)
      initCoverWipe();
      initAnchorGlide();
      initHashLand();
      initDriftCols();
      initTierLadder();
      initProgress();
      root.classList.add('motion-booted');
      ScrollTrigger.refresh();
      watchLayout();
    } catch (err) {
      /* a scene failed to build; the rest of the page is unaffected */
    }
  };

  const fontsReady = (document as any).fonts?.ready ?? new Promise((r) => setTimeout(r, 0));
  let started = false;
  const kick = () => {
    if (started) return;
    started = true;
    lenis.start();
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
  // Hard floor under the scroll lock: if the meter script never signals and
  // the head's own 4.5s failsafe is the thing that lifts the cover, Lenis
  // still has to be told. Idempotent with kick().
  setTimeout(() => lenis.start(), 5000);

  // Re-measure on width change so the scrubbed scenes stay honest.
  // WIDTH change only: on a phone the URL bar collapsing mid-scroll fires
  // resize with the width untouched, and a full trigger refresh in the
  // middle of a live scroll is a visible stutter. Nothing about the
  // geometry changes when only the height does.
  let lastW = window.innerWidth;
  let rz: number | undefined;
  addEventListener(
    'resize',
    () => {
      if (window.innerWidth === lastW) return;
      clearTimeout(rz);
      rz = window.setTimeout(() => {
        lastW = window.innerWidth;
        if (root.classList.contains('motion-booted')) ScrollTrigger.refresh();
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
  const LANE = 24; // and keeps this much clear of anything it must not cover

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

  /* A trigger can give the card a lane to ride in. `data-cursor-lane` names
     the parts the card must never sit on: everything left of the middle
     pushes the lane's near edge right, everything right of it pulls the far
     edge left, and what is left over is clear ground.

     Measured across the whole group, not per row. `[data-cursor-lane-root]`
     marks the common ancestor, and every matching part inside it counts, so
     the lane is ONE line down the section: the longest name in the list is
     what the near edge clears. Measured per row instead, the edge would sit
     at a different place under every row and the poster would step sideways
     each time the hand moved down one, which reads as the card twitching
     rather than tracking. Returns null when a trigger asks for nothing, and
     that card keeps riding off the pointer's shoulder. */
  const laneFor = (trigger: HTMLElement | null) => {
    const sel = trigger?.dataset.cursorLane;
    if (!trigger || !sel) return null;
    const root = trigger.closest<HTMLElement>('[data-cursor-lane-root]') ?? trigger;
    const box = root.getBoundingClientRect();
    const mid = box.left + box.width / 2;
    let min = box.left;
    let max = box.right;
    root.querySelectorAll<HTMLElement>(sel).forEach((part) => {
      const r = part.getBoundingClientRect();
      if (!r.width) return;
      if (r.left + r.width / 2 < mid) min = Math.max(min, r.right);
      else max = Math.min(max, r.left);
    });
    return { min, max };
  };

  // Beside the cursor, flipped to the other side when that edge is close,
  // then clamped so a corner hover can still never push the card off screen.
  const place = (rig: Rig, cx: number, cy: number, trigger: HTMLElement | null) => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const lane = laneFor(trigger);
    let x: number;
    let y: number;

    if (lane) {
      /* In a lane the card never flips sides: it hangs off the pointer's
         left, held inside the clear ground, and rides level with the pointer
         rather than below it. Reading down a list of rows then walks the
         poster straight down beside the hand instead of stepping it
         diagonally across the words. A lane too narrow to hold the card is
         no lane at all: centre it on what there is and let the viewport
         clamp below have the last word. */
      const room = lane.max - lane.min - LANE * 2;
      x =
        room >= rig.w
          ? gsap.utils.clamp(lane.min + LANE, lane.max - LANE - rig.w, cx - OFF_X - rig.w)
          : lane.min + (lane.max - lane.min - rig.w) / 2;
      y = cy - rig.h / 2;
    } else {
      x = cx + OFF_X + rig.w > vw - EDGE ? cx - OFF_X - rig.w : cx + OFF_X;
      y = cy + OFF_Y + rig.h > vh - EDGE ? cy - OFF_Y - rig.h : cy + OFF_Y;
    }

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

  /* Where the card that just left the pointer was standing. Neighbouring
     triggers own SEPARATE card elements, so a hand moving down a list is one
     card hiding and a different one appearing: started at its own mark, the
     artwork teleports the height of a row every time. Handed the outgoing
     card's position instead, the incoming one picks up exactly where the
     last left off and glides to its mark, and the swap reads as one object
     continuing rather than two objects blinking. Only honoured for a
     moment, so a hover a minute later still starts at the pointer. */
  let handoff: { x: number; y: number; at: number } | null = null;
  const HANDOFF_MS = 260;
  const remember = (rig: Rig) => {
    handoff = {
      x: Number(gsap.getProperty(rig.card, 'x')) || 0,
      y: Number(gsap.getProperty(rig.card, 'y')) || 0,
      at: performance.now(),
    };
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
      const p = place(rig, e.clientX, e.clientY, trigger);
      if (rig.shown) {
        // Handed straight from a sibling trigger: glide, don't teleport.
        rig.xTo?.(p.x);
        rig.yTo?.(p.y);
      } else if (handoff && performance.now() - handoff.at < HANDOFF_MS) {
        // A sibling's card was on the pointer a frame ago. Take over where it
        // stood and travel to this row's mark, so the list hands the poster
        // along instead of blinking it from row to row.
        snap(rig, handoff.x, handoff.y);
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
        const p = place(rig, cx, cy, trigger);
        rig.xTo?.(p.x);
        rig.yTo?.(p.y);
      });
    });

    trigger.addEventListener('pointerleave', () => {
      if (rig.owner !== trigger) return; // a sibling already took the card over
      rig.owner = null;
      remember(rig); // in case the next row is about to ask for it
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
  // 42% of the plane's own width, and not a subtle lag: the word gives up
  // almost half the sheet's travel, so the two visibly shear apart while the
  // wipe runs.
  if (deep) tl.to(deep, { xPercent: 42, ease: 'none' }, 0);
  // [data-cover-fast] is the near plane (the team number): on top of the
  // sheet's travel it spends most of a viewport of its own, so it launches
  // off the far right edge and is fully gone before the sheet is halfway.
  // Three speeds in all.
  const fast = cover.querySelector<HTMLElement>('[data-cover-fast]');
  if (fast) tl.to(fast, { x: () => -window.innerWidth, ease: 'none' }, 0);

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
/* In-page anchors glide instead of jumping.                          */
/* ================================================================== */
/* A plain <a href="#contact"> is a native jump, and under Lenis that   */
/* lands hard and in the wrong place: the finale is pinned beneath the  */
/* curtain, so the browser scrolls to where the section sits in flow    */
/* rather than to the level it actually rests at. The drawer's links    */
/* already went through GearNav's glideTo for exactly this reason; the  */
/* buttons in the middle of the page never did, so "Invite us" and      */
/* "Get in touch" teleported past the sponsor wall while every link in  */
/* the nav eased into place.                                            */
/*                                                                      */
/* Neither this nor GearNav decides where a covered section rests: both */
/* ask the section, which is the only thing that can measure its own    */
/* cover. #contact publishes `__finale.reachLevel()` and the wipe's end  */
/* is the cover spacer's own height, so the two paths cannot drift.      */
/* The drawer is skipped: its own handler runs first and is smarter      */
/* about focus and closing itself.                                       */
function initAnchorGlide() {
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
      return;
    }
    const link = (e.target as HTMLElement | null)?.closest?.<HTMLAnchorElement>('a[href]');
    if (!link || link.closest('#site-nav') || link.target === '_blank') return;
    if (link.hasAttribute('data-no-glide')) return;

    // Same document only: a hash on another page is a real navigation.
    const url = new URL(link.href, location.href);
    if (url.pathname !== location.pathname || url.origin !== location.origin || !url.hash) return;

    let target: HTMLElement | null = null;
    try {
      target = document.querySelector<HTMLElement>(url.hash);
    } catch {
      return;
    }
    if (!target) return;

    const lenis = (window as any).__motion?.lenis;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const behavior: ScrollBehavior = reduced ? 'auto' : 'smooth';
    const reach = url.hash === '#contact' ? (window as any).__finale?.reachLevel?.() : undefined;

    e.preventDefault();
    if (typeof reach === 'number') {
      if (lenis?.scrollTo) lenis.scrollTo(reach, { immediate: reduced });
      else window.scrollTo({ top: reach, behavior });
    } else if (lenis?.scrollTo) {
      lenis.scrollTo(target, { immediate: reduced });
    } else {
      target.scrollIntoView({ behavior });
    }

    // The hash still belongs in the URL, but assigning location.hash would
    // undo the glide with a jump of its own.
    history.pushState(null, '', url.hash);

    // Keyboard users land on the section rather than carrying on from the
    // button they just left.
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  });
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

/* SCENE: tier ladder (sponsors). [data-ladder] > [data-rung] lock in   */
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
