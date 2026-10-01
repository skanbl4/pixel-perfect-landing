// Effects for the live version. Everything added to the DOM is removed afterwards,
// so between animations the page matches landing/.
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

const root = document.documentElement;
const wait = ms => new Promise(r => setTimeout(r, ms));
const EASE_OUT = 'cubic-bezier(.2, .7, .2, 1)';
const EASE_IN = 'cubic-bezier(.6, 0, .8, .3)';
const EASE_SPRING = 'cubic-bezier(.34, 1.5, .64, 1)';
const random = (min, max) => min + Math.random() * (max - min);

// Timings in ms, in one place to tune the feel.
const FX = {
  startDelay: 500,                    // pause after the first paint
  appear: 900,                        // illustration fade and slide in
  cycleMin: 8000, cycleMax: 14000,    // one cycle of card motion; every card moves once per cycle
  loop: true,                         // keep the cards moving while the picture is in view
};

// Effects start only when the visitor can see them: markup parsed, fonts ready,
// first frame painted, then a short pause. Images are not awaited: on a slow
// line the page would stand still for seconds with the title hidden.
const pageReady = new Promise(resolve => {
  const go = () => requestAnimationFrame(() => document.fonts.ready.then(() =>
    requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, FX.startDelay)))));
  if (document.readyState !== 'loading') go();
  else addEventListener('DOMContentLoaded', go, { once: true });
});

let lampOn;
const lampDone = new Promise(r => { lampOn = r; });

const bbox = p => p.getBBox();

// Illustrations: fade and slide in once with a small story inside the SVG, then
// the cards keep living while the picture is in view, in cycles of 8-14 s with
// fresh random timing each cycle, so the order never repeats.
// The SVG is inlined over the <img> for the animation, then removed.
// Numbers are path indices in the visible copy of each file: card frames
// (a card is its frame and every path inside it) and a few single details.
const CARDS = { lamp: [38, 23, 19], dots: [6, 39, 42], cards: [40, 65, 57, 53] };

const groupCache = new WeakMap();
function cardGroups(svg, frames) {
  const key = frames.join();
  const cached = groupCache.get(svg)?.[key];
  if (cached) return cached;
  const paths = [...svg.querySelectorAll('path')];
  const groups = frames.map(frameIndex => {
    const f = bbox(paths[frameIndex]);
    const cx = f.x + f.width / 2, cy = f.y + f.height / 2;
    const inside = paths.filter(p => {
      const b = bbox(p);
      return b.x >= f.x - 2 && b.y >= f.y - 2 && b.x + b.width <= f.x + f.width + 2 && b.y + b.height <= f.y + f.height + 2;
    });
    // The pivot is the centre of the card, set relative to each path's own box:
    // fill-box means the same in every browser, view-box does not.
    for (const p of inside) {
      const b = bbox(p);
      p.style.transformBox = 'fill-box';
      p.style.transformOrigin = `${cx - b.x}px ${cy - b.y}px`;
    }
    return { cx, cy, inside };
  });
  groupCache.set(svg, { ...groupCache.get(svg), [key]: groups });
  return groups;
}

// Same keyframes on every path of a card, so the card moves as one piece
// without regrouping paths (that would change what is drawn on top of what).
const animateCard = (card, frames, options) =>
  Promise.all(card.inside.map(p => p.animate(frames, options).finished));

const sign = () => (Math.random() < .5 ? -1 : 1);

// One sway of a card: the card rises (or dips), swings past its place to the
// other side and settles. The rock passes through zero exactly at both ends
// of the rise, so the card is level at its highest and lowest points.
const EASE = { both: 'cubic-bezier(.37, 0, .63, 1)', in: 'cubic-bezier(.12, 0, .39, 0)', out: 'cubic-bezier(.61, 1, .88, 1)' };
function swayCard(card, duration, delay) {
  const lift = random(3, 6) * sign(), tilt = random(1, 2) * sign();
  const options = { duration, delay };
  const rise = [0, -1, .5, 0].map(k => ({ translate: `0 ${lift * k}px`, easing: EASE.both }));
  // Fast through zero, slow at the peaks: ease-out towards a peak, ease-in back to zero
  const rock = [0, .5, 0, -1, 0, .5, 0].map((k, i) => ({
    rotate: `${tilt * k}deg`,
    easing: i === 0 || i === 5 ? EASE.both : k ? EASE.in : EASE.out,
  }));
  return Promise.all([animateCard(card, rise, options), animateCard(card, rock, options)]);
}

const shuffle = list => list.map(v => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map(([, v]) => v);

// One cycle in bands 1 and 3: every card sways once, never two at a time.
// Order, pauses between them, lift, tilt and direction are random each cycle.
function swayCycle(svg, frames, T) {
  const cards = shuffle(cardGroups(svg, frames));
  let durations = cards.map(() => 1000);
  // Sways take at most 75% of the cycle, so there are always pauses between them
  const busy = durations.reduce((a, b) => a + b, 0);
  if (busy > T * .75) durations = durations.map(d => d * T * .75 / busy);
  const free = T - durations.reduce((a, b) => a + b, 0);
  const gaps = [...cards, null].map(() => Math.random());
  const gapSum = gaps.reduce((a, b) => a + b, 0);
  let t = 0;
  return Promise.all([wait(T), ...cards.map((card, i) => {
    t += free * gaps[i] / gapSum;
    const delay = t;
    t += durations[i];
    return swayCard(card, durations[i], delay);
  })]);
}

// One cycle in the hero: all cards are visible at the start, then each card
// hides once, at a random moment and for a random while, and comes back
function hideCycle(svg, frames, T) {
  const hold = random(900, 1500), fade = 400;
  const at = t => t / T;
  const shown = { opacity: 1, transform: 'none', easing: 'ease-in-out' };
  const gone = { opacity: 0, transform: 'scale(.9)', easing: 'ease-in-out' };
  return Promise.all([wait(T), ...cardGroups(svg, frames).map(card => {
    const hidden = random(1200, 2600);
    const start = random(hold, T - hidden - 2 * fade);
    return animateCard(card, [
      { ...shown, offset: 0 },
      { ...shown, offset: at(start) },
      { ...gone, offset: at(start + fade) },
      { ...gone, offset: at(start + fade + hidden) },
      { ...shown, offset: at(start + 2 * fade + hidden) },
      { ...shown, offset: 1 },
    ], { duration: T });
  })]);
}

function lampFlicker(svg) {
  return svg.querySelectorAll('path')[0].animate(
    { opacity: [1, .15, .9, .25, 1], offset: [0, .2, .4, .6, 1] },
    { duration: 700, easing: 'linear' }).finished;
}

function dotsWave(svg, times, delay) {
  const paths = svg.querySelectorAll('path');
  return Promise.all([35, 36, 37].map((n, i) => paths[n].animate(
    [{ translate: '0 0' }, { translate: '0 -12px', offset: .4 }, { translate: '0 0' }],
    { duration: 520, delay: delay + i * 150, iterations: times, easing: 'ease-in-out' }).finished));
}

const DETAILS = {
  // Hero: the lamp flickers on, the cards come in one by one. Cycles: the cards
  // hide and come back at random, now and then the lamp flickers.
  lamp: {
    intro(svg) {
      const cone = svg.querySelectorAll('path')[0];
      const run = cone.animate(
        { opacity: [0, 0, .9, .1, .8, .05, 1, .4, 1], offset: [0, .3, .4, .46, .55, .6, .72, .8, 1] },
        { duration: 1700, easing: 'linear', fill: 'backwards' });
      setTimeout(lampOn, 1250);
      const cards = cardGroups(svg, CARDS.lamp).map((card, i) => animateCard(card,
        [{ opacity: 0, transform: 'scale(.85)' }, { opacity: 1, transform: 'none' }],
        { duration: 600, delay: 1400 + i * 450, easing: EASE_SPRING, fill: 'backwards' }));
      return Promise.all([run.finished, ...cards]);
    },
    cycle(svg, T) {
      const jobs = [hideCycle(svg, CARDS.lamp, T)];
      if (Math.random() < .3) jobs.push(wait(random(0, T - 700)).then(() => lampFlicker(svg)));
      return Promise.all(jobs);
    },
  },

  // Band 1: the chat dots type, the cards sway one at a time.
  dots: {
    intro(svg) { return dotsWave(svg, 3, FX.appear * .8); },
    cycle(svg, T) { return Promise.all([swayCycle(svg, CARDS.dots, T), dotsWave(svg, 2, random(0, T - 2000))]); },
  },

  // Band 3: the cards pop out from behind the character, then sway one at a time.
  cards: {
    intro(svg) {
      const hub = { x: 358, y: 390 };
      const start = FX.appear * .7;
      const pops = cardGroups(svg, CARDS.cards).map(({ cx, cy, ...card }, order) => {
        const dx = (hub.x - cx) * .7, dy = (hub.y - cy) * .7;
        return animateCard(card,
          [{ opacity: 0, transform: `translate(${dx}px, ${dy}px) scale(.3)` },
           { opacity: 1, transform: 'none' }],
          { duration: 900, delay: start + order * 180, easing: EASE_SPRING, fill: 'backwards' });
      });
      return Promise.all(pops);
    },
    cycle(svg, T) { return swayCycle(svg, CARDS.cards, T); },
  },
};

const arts = [
  { img: document.querySelector('.hero__art'), detail: 'lamp', now: true },
  { img: document.querySelector('.intro__art'), detail: 'dots' },
  { img: document.querySelector('.benefits__art'), detail: 'cards' },
].filter(a => a.img);

function showArt(a) {
  a.state = 'done';
  if (a.detail === 'lamp') lampOn();
  a.img.classList.add('art-shown');
  if (arts.every(x => x.state === 'done')) {
    root.classList.remove('fx-art');
    for (const x of arts) x.img.classList.remove('art-shown');
  }
}

// Inline copy of the SVG exactly over the <img>
async function mountCopy(a) {
  a.source ??= fetch(a.img.getAttribute('src')).then(r => r.text());
  const svg = new DOMParser().parseFromString(await a.source, 'image/svg+xml').documentElement;
  if (svg.nodeName !== 'svg') throw new Error('not an SVG');
  svg.classList.add('art-fx');
  svg.setAttribute('aria-hidden', 'true');
  a.img.after(svg);
  placeCopy(a, svg);
  return svg;
}

// Placed by the difference of the two boxes, not by offsets: .page is a
// container and the hero picture has a translate. A running slide-in is
// subtracted, so a re-place mid-animation lands right.
function placeCopy(a, svg = a.svg) {
  const target = a.img.getBoundingClientRect();
  Object.assign(svg.style, { left: '0px', top: '0px', width: `${target.width}px`, height: `${target.height}px` });
  const at = svg.getBoundingClientRect();
  const [tx = 0, ty = 0] = (getComputedStyle(svg).translate.match(/-?[\d.]+/g) || []).map(Number);
  Object.assign(svg.style, { left: `${target.left - at.left + tx}px`, top: `${target.top - at.top + ty}px` });
}

async function playArt(a) {
  a.state = 'playing';
  // The <img> takes over when the copy goes: it must be decoded by then
  await Promise.race([a.img.decode().catch(() => {}), wait(3000)]);
  let svg;
  try {
    svg = await mountCopy(a);
  } catch {
    a.img.classList.add('art-shown');
    await a.img.animate(
      [{ opacity: 0, translate: '0 24px' }, { opacity: 1, translate: '0 0' }],
      { duration: FX.appear, easing: EASE_OUT }).finished.catch(() => {});
    return showArt(a);
  }
  a.svg = svg;
  a.img.classList.add('art-hidden');
  const appear = svg.animate(
    [{ opacity: 0, translate: '0 24px' }, { opacity: 1, translate: '0 0' }],
    { duration: FX.appear, easing: EASE_OUT, fill: 'backwards' }).finished;
  await Promise.all([appear, DETAILS[a.detail].intro(svg)]);
  showArt(a);
  keepAlive(a);
}

// Scrolled past before it could play (e.g. after a reload further down):
// shown as is, the cards start moving when it comes into view.
function skipArt(a) {
  showArt(a);
  keepAlive(a);
}

const shareVisible = el => {
  const r = el.getBoundingClientRect();
  return Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0)) / r.height;
};
let lastScroll = 0;
addEventListener('scroll', () => { lastScroll = performance.now(); }, { passive: true });
const pageIsStill = () => !glideFrame && performance.now() - lastScroll > 300;

// Runs after a scroll has settled: on scrollend, or 150 ms after the last
// scroll event where the browser lacks it (not while a finger holds the page).
let touching = false;
function onScrollSettled(fn) {
  if ('onscrollend' in window) return addEventListener('scrollend', fn);
  let t;
  const later = () => { clearTimeout(t); t = setTimeout(() => { if (!touching) fn(); }, 150); };
  addEventListener('scroll', later, { passive: true });
  addEventListener('touchend', later, { passive: true });
}

// Back to the plain <img>: when the picture is off screen, in a background tab
// or after the layout changed (the copy was placed for the old one).
function unmountCopy(a) {
  a.svg?.remove();
  a.svg = null;
  a.img.classList.remove('art-hidden');
}

// Cycles of card motion while the picture is in view. Between cycles the loop
// sleeps until something changes: visibility, the tab, the layout.
const wanted = a => FX.loop && !document.hidden && a.visible;
async function keepAlive(a) {
  if (reduceMotion.matches || a.alive) return;
  a.alive = true;
  a.visible = shareVisible(a.img) >= .3;
  new IntersectionObserver(([e]) => { a.visible = e.intersectionRatio >= .3; a.wake?.(); }, { threshold: .3 }).observe(a.img);
  for (;;) {
    if (!wanted(a)) {
      unmountCopy(a);
      await new Promise(r => { a.wake = r; });
      continue;
    }
    if (!a.svg) {
      try { a.svg = await mountCopy(a); } catch { return; }
      a.img.classList.add('art-hidden');
    }
    // A cycle runs to its end unless the picture leaves the screen: then the
    // copy goes away at once, and a fresh cycle starts when it comes back.
    const cycle = DETAILS[a.detail].cycle(a.svg, random(FX.cycleMin, FX.cycleMax)).catch(() => {});
    const woken = new Promise(r => { a.wake = r; });
    if (await Promise.race([cycle.then(() => false), woken.then(() => true)])) unmountCopy(a);
  }
}
addEventListener('visibilitychange', () => arts.forEach(a => a.wake?.()));

// Only a new width changes the layout (a phone hides its address bar often):
// then the copy is re-placed while its story plays, otherwise removed and put
// back by keepAlive.
let lastWidth = innerWidth;
addEventListener('resize', () => {
  if (innerWidth === lastWidth) return;
  lastWidth = innerWidth;
  for (const a of arts) {
    if (!a.svg) continue;
    if (a.state === 'playing') placeCopy(a); else { unmountCopy(a); a.wake?.(); }
  }
});

// Bands 1 and 3 play once the centre of the picture has passed the middle
// of the screen and scrolling has stopped, so the visitor is looking at it.
function checkArts() {
  const H = innerHeight;
  for (const a of arts) {
    if (a.state) continue;
    const r = a.img.getBoundingClientRect();
    if (r.bottom < 0) { skipArt(a); continue; }
    const centerUp = r.top + r.height / 2 <= H / 2;
    const whole = r.top >= 0 && r.bottom <= H;
    if ((centerUp || whole) && pageIsStill()) playArt(a);
  }
}

if (root.classList.contains('fx-art')) {
  pageReady.then(() => {
    root.dataset.art = 'on';
    // The hero plays right away only if it is on screen (after a reload further
    // down the page it is not; then it is simply shown, like the title).
    for (const a of arts) if (a.now) shareVisible(a.img) > 0 ? playArt(a) : skipArt(a);
    checkArts();
    onScrollSettled(() => setTimeout(checkArts, 350));
    addEventListener('resize', checkArts);
  });
} else {
  lampOn();
}

// Hero title typing. The text never moves: the typed part is revealed with
// the CSS Custom Highlight API, and a copy of the caret follows it.
const title = document.querySelector('.hero__title');
const titleCaret = title.querySelector('.caret');

function keyDelay(ch) {
  let t = 45 + Math.random() * 95;
  if (ch === ' ') t += 60 + Math.random() * 120;
  if (ch === '.') t += 120 + Math.random() * 120;
  if (Math.random() < .08) t += 150 + Math.random() * 250;
  return t;
}

// The caret keeps blinking while the title is on screen and rests
// (solid, as in the mockup) when it scrolls away.
function keepCaretBlinking() {
  if (reduceMotion.matches) return;
  new IntersectionObserver(([entry]) => {
    titleCaret.classList.toggle('caret--blink', entry.isIntersecting);
  }).observe(title);
}

async function typeTitle() {
  if (!root.classList.contains('is-typing')) return keepCaretBlinking();
  await pageReady;
  // The failsafe may have shown the title by now: then it is not typed
  if (!root.classList.contains('is-typing')) return keepCaretBlinking();
  root.dataset.typing = 'on';
  let ghost = null;
  const finish = () => {
    CSS.highlights.delete('typed');
    ghost?.remove();
    root.classList.remove('is-typing');
  };

  if (title.getBoundingClientRect().bottom < 0) { finish(); return keepCaretBlinking(); }

  const chars = [];
  const walker = document.createTreeWalker(title, NodeFilter.SHOW_TEXT);
  for (let n; (n = walker.nextNode());) for (let i = 0; i < n.length; i++) chars.push([n, i]);
  const N = chars.length;
  const rectOf = k => {
    const r = new Range();
    r.setStart(chars[k][0], chars[k][1]);
    r.setEnd(chars[k][0], chars[k][1] + 1);
    const list = r.getClientRects();
    return list[list.length - 1];
  };

  const end = titleCaret.getBoundingClientRect();
  const last = rectOf(N - 1);
  const dy = end.top - last.top, gap = end.left - last.right;

  ghost = titleCaret.cloneNode();
  ghost.classList.add('caret--ghost', 'caret--wait');
  ghost.setAttribute('aria-hidden', 'true');
  title.append(ghost);
  const place = k => {
    const box = title.getBoundingClientRect();
    let x, r;
    if (k === N) { x = end.left; r = null; }
    else if (k === 0 || /\s/.test(chars[k - 1][0].data[chars[k - 1][1]])) {
      r = rectOf(k); x = r.left;
    } else { r = rectOf(k - 1); x = r.right + gap; }
    const s = r ? r.height / last.height : 1;
    const top = r ? r.top + dy * s : end.top;
    Object.assign(ghost.style, {
      left: `${x - box.left}px`, top: `${top - box.top}px`,
      width: `${end.width}px`, height: `${end.height * s}px`,
    });
  };

  const typed = new Range();
  typed.setStart(chars[0][0], chars[0][1]);
  typed.setEnd(chars[0][0], chars[0][1]);
  CSS.highlights.set('typed', new Highlight(typed));   // the range is live: setEnd moves the highlight
  place(0);

  await Promise.all([wait(900), Promise.race([lampDone, wait(4000)])]);
  ghost.classList.remove('caret--wait');
  for (let k = 1; k <= N; k++) {
    await wait(keyDelay(chars[k - 1][0].data[chars[k - 1][1]]));
    typed.setEnd(chars[k - 1][0], chars[k - 1][1] + 1);
    place(k);
  }
  await wait(120);
  finish();

  keepCaretBlinking();
}
typeTitle();

// Scroll docking. After scrolling stops, the page eases to the next stop ahead
// once its section is visible enough (thresholds differ for down and up), or back
// to a stop it overshot. It never pulls back to a stop it has just left, and
// tall sections scroll freely. Values: % of the viewport, bounce and glide in ms.
const DOCK_DEFAULTS = { down: 25, up: 50, over: 10, bounce: 200, glide: 450 };
const dock = { ...DOCK_DEFAULTS };
const dockTargets = document.querySelectorAll(
  '.intro__inner, .steps__inner, .quote, .benefits__inner, .faq__inner');

function dockPlan() {
  const H = innerHeight;
  const m = Math.min(64, Math.max(24, H * .06));
  const maxY = document.documentElement.scrollHeight - H;
  const clamp = p => Math.min(maxY, Math.max(0, p));
  const box = el => {
    const r = el.getBoundingClientRect();
    return { top: r.top + scrollY, bottom: r.bottom + scrollY };
  };

  const stops = [
    { p: 0, ...box(document.querySelector('.hero__inner')) },
    { p: maxY, ...box(document.querySelector('.footer')) },
  ];
  const ranges = [];
  for (const el of dockTargets) {
    const r = el.getBoundingClientRect();
    const top = r.top + scrollY;
    const own = { top, bottom: top + r.height };

    if (r.height + 2 * 24 <= H) stops.push({ p: clamp(top + r.height / 2 - H / 2), ...own });
    else {
      const range = [clamp(top - m), clamp(top + r.height + m - H)];
      stops.push({ p: range[0], ...own }, { p: range[1], ...own });
      ranges.push(range);
    }
  }
  stops.sort((a, b) => a.p - b.p);
  return { stops, points: stops.map(st => st.p), ranges };
}

function seen(st, y) {
  const H = innerHeight;
  const vis = Math.min(st.bottom, y + H) - Math.max(st.top, y);
  return Math.max(0, vis) / Math.min(st.bottom - st.top, H);
}

// Only scrolls made by hand are docked: not keyboard focus, not scroll restoration.
let rest = scrollY;
let glideFrame = 0;
let lastInput = '';

const NAV_KEYS = new Set(['Tab', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown', ' ']);
const onScrollbar = e => e.target === root && e.clientX >= root.clientWidth;
addEventListener('wheel', () => { lastInput = 'wheel'; }, { capture: true, passive: true });
addEventListener('touchstart', () => { lastInput = 'touch'; touching = true; }, { capture: true, passive: true });
for (const type of ['touchend', 'touchcancel']) addEventListener(type, e => { touching = e.touches.length > 0; }, { capture: true, passive: true });
addEventListener('keydown', e => { if (NAV_KEYS.has(e.key)) lastInput = 'key'; }, { capture: true, passive: true });
addEventListener('pointerdown', e => { if (onScrollbar(e)) lastInput = 'scrollbar'; }, { capture: true, passive: true });

function glide(target) {
  stopGlide();
  const from = scrollY, dist = Math.abs(target - from);
  rest = target;
  if (dist < 1) return;
  if (reduceMotion.matches) { scrollTo({ top: target, behavior: 'instant' }); return; }

  const dur = Math.max(1, dock.glide * Math.min(1.5, Math.max(.6, Math.sqrt(dist / 300))));
  const t0 = performance.now();
  const frame = now => {
    const k = Math.max(0, Math.min(1, (now - t0) / dur));
    const ease = (1 - Math.cos(Math.PI * k)) / 2;
    scrollTo({ top: from + (target - from) * ease, behavior: 'instant' });
    glideFrame = k < 1 ? requestAnimationFrame(frame) : 0;
  };
  glideFrame = requestAnimationFrame(frame);
}
function stopGlide() {
  if (glideFrame) cancelAnimationFrame(glideFrame);
  glideFrame = 0;
}

function onScrollEnd() {
  if (glideFrame) return;
  const y = scrollY;
  const moved = y - rest;
  const from = rest;
  const input = lastInput;
  rest = y;
  lastInput = '';
  if (Math.abs(moved) < 1) return;
  if (!input || input === 'key') return;

  if (reduceMotion.matches) return;
  const H = innerHeight, dir = Math.sign(moved);
  const { stops, ranges } = dockPlan();
  const reading = ranges.some(([s, e]) => y > s + 1 && y < e - 1);
  const need = (dir > 0 ? dock.down : dock.up) / 100;
  const over = dock.over / 100 * H;
  let best = null;
  for (const st of stops) {
    const p = st.p;
    const d = (p - y) * dir;
    const left = (p - from) * dir > 1;
    const ahead = d > 0 && !reading && left && seen(st, y) >= need;
    const overshot = d < 0 && -d <= over && left;
    if ((ahead || overshot) && (best === null || Math.abs(p - y) < Math.abs(best - y))) best = p;
  }
  if (best === null || Math.abs(best - y) < 1) return;

  glide(best);
}

onScrollSettled(onScrollEnd);

// Wheel bounce filter: a single reversed notch right after a notch the other way
// is dropped. Needs a non-passive listener to cancel it.
let wheelDir = 0, wheelAt = 0, flipPending = false;
addEventListener('wheel', e => {
  if (e.ctrlKey || !e.deltaY) return;
  const dir = Math.sign(e.deltaY);
  const flip = wheelDir !== 0 && dir !== wheelDir && e.timeStamp - wheelAt < dock.bounce;
  if (flip && !flipPending) {
    flipPending = true;
    e.preventDefault();
    return;
  }
  flipPending = false;
  wheelDir = dir;
  wheelAt = e.timeStamp;
}, { passive: false });

// Space / Shift+Space, PageDown / PageUp: one section at a time, page by page
// inside tall sections.
addEventListener('keydown', e => {
  if (e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey) return;

  if (e.target.closest?.('input, textarea, select, [contenteditable]')) return;
  let dir;
  if (e.key === ' ') {
    if (e.target.closest?.('button, summary')) return;
    dir = e.shiftKey ? -1 : 1;
  } else if (e.key === 'PageDown') dir = 1;
  else if (e.key === 'PageUp') dir = -1;
  else return;
  e.preventDefault();
  const base = glideFrame ? rest : scrollY;
  const { points, ranges } = dockPlan();
  const ahead = points.filter(p => (p - base) * dir > 1);
  if (!ahead.length) return;
  let target = ahead.reduce((a, b) => Math.abs(b - base) < Math.abs(a - base) ? b : a);
  const page = innerHeight * .85;
  const inside = ranges.find(([s, e2]) => base > s - 1 && base < e2 + 1 && (dir > 0 ? base < e2 - 1 : base > s + 1));
  if (inside && Math.abs((dir > 0 ? inside[1] : inside[0]) - base) > page) target = base + dir * page;
  glide(target);
});

// Only input that moves the page interrupts a running glide.
const interrupts = {
  wheel: () => true,
  touchstart: () => true,
  keydown: e => NAV_KEYS.has(e.key),
  pointerdown: onScrollbar,
};
for (const [type, test] of Object.entries(interrupts)) {
  addEventListener(type, e => {
    if (glideFrame && !e.defaultPrevented && test(e)) { stopGlide(); rest = scrollY; }
  }, { passive: true });
}

// Testimonial slider: the photo is revealed with a growing circle, text lines
// slide through masks. The first slide is the markup from the mockup.
const quote = document.querySelector('.quote');
const photo = quote.querySelector('.quote__photo');
const body  = quote.querySelector('.quote__body');
const author = quote.querySelector('.quote__name');
const region = quote.querySelector('.quote__text');

const slides = [
  { photo: photo.getAttribute('src'), name: author.textContent, text: body.textContent },
  { photo: '../assets/img/testimonial-photo-2.jpg', name: 'Mia Sorensen',
    text: 'Pellentesque tempus sed phasellus vel mauris fermentum praesent. Tellus euismod pellentesque urna ac massa in vulputate natoque.' },
  { photo: '../assets/img/testimonial-photo-3.jpg', name: 'Daniel Moreno',
    text: 'Quisque porttitor vitae vel amet neque scelerisque mattis. Consectetur nibh velit magna consectetur leo sollicitudin ornare tempus.' },
  { photo: '../assets/img/testimonial-photo-4.jpg', name: 'Amara Okafor',
    text: 'Sollicitudin ornare tempus felis nulla varius pulvinar nibh viverra. Quam vehicula faucibus amet lorem condimentum blandit rutrum.' },
];

// The other photos are fetched after everything else has loaded and the page
// is idle, so they never compete with the pictures the visitor is looking at
const loaded = new Promise(r => document.readyState === 'complete' ? r() : addEventListener('load', r, { once: true }));
loaded.then(() => (window.requestIdleCallback || (f => setTimeout(f, 1000)))(() => {
  for (const s of slides.slice(1)) new Image().src = s.photo;
}));

let current = 0;
let busy = false;

// Carousel semantics for screen readers: the static page has one testimonial
quote.setAttribute('aria-roledescription', 'carousel');
quote.setAttribute('aria-label', 'Testimonials');
region.setAttribute('role', 'group');
region.setAttribute('aria-roledescription', 'slide');
const announceSlide = () => region.setAttribute('aria-label', `${current + 1} of ${slides.length}`);
announceSlide();

function splitLines(el) {
  const words = el.textContent.trim().split(/\s+/);
  el.innerHTML = words.map(w => `<span>${w}</span>`).join(' ');
  const lines = [];
  let top = null;
  for (const w of el.children) {
    if (w.offsetTop !== top) { lines.push([]); top = w.offsetTop; }
    lines.at(-1).push(w.textContent);
  }
  el.innerHTML = lines
    .map(l => `<span class="quote__line"><span>${l.join(' ')}</span></span>`)
    .join('');
  return [...el.querySelectorAll('.quote__line > span')];
}

function moveLines(lines, from, to, easing, duration) {
  return Promise.all(lines.map((line, i) => line.animate(
    [{ translate: `0 ${from}%` }, { translate: `0 ${to}%` }],
    { duration, easing, delay: i * 60, fill: 'both' }).finished));
}

async function swapText(slide, dir) {
  const els = [body, author];
  if (reduceMotion.matches) {
    await Promise.all(els.map(el => el.animate({ opacity: [1, 0] }, { duration: 150, fill: 'forwards' }).finished));
    body.textContent = slide.text;
    author.textContent = slide.name;
    await Promise.all(els.map(el => el.animate({ opacity: [0, 1] }, { duration: 150 }).finished));
    for (const el of els) el.getAnimations().forEach(a => a.cancel());
    return;
  }

  const out = els.flatMap(splitLines);
  await moveLines(out, 0, -105 * dir, EASE_IN, 320);
  body.textContent = slide.text;
  author.textContent = slide.name;
  const inn = els.flatMap(splitLines);
  await moveLines(inn, 105 * dir, 0, EASE_OUT, 520);

  body.textContent = slide.text;
  author.textContent = slide.name;
}

async function swapPhoto(slide) {
  const next = photo.cloneNode();
  next.src = slide.photo;
  next.alt = '';
  next.classList.add('quote__photo--next');
  Object.assign(next.style, {
    left: photo.offsetLeft + 'px', top: photo.offsetTop + 'px',
    inlineSize: photo.offsetWidth + 'px', blockSize: photo.offsetHeight + 'px',
  });
  await next.decode().catch(() => {});
  quote.append(next);
  const frames = reduceMotion.matches
    ? { opacity: [0, 1] }
    : { clipPath: ['circle(0% at 50% 50%)', 'circle(50% at 50% 50%)'] };
  await next.animate(frames, { duration: reduceMotion.matches ? 300 : 900, easing: 'cubic-bezier(.7, 0, .2, 1)' }).finished;
  photo.src = slide.photo;
  photo.alt = slide.name;

  await photo.decode().catch(() => {});
  next.remove();
}

// The paragraph keeps the height of the longest testimonial so the card never jumps.
let reserved = false;
function reserveHeight() {
  const text = body.textContent;
  body.style.minBlockSize = '';
  let max = 0;
  for (const s of slides) {
    body.textContent = s.text;
    max = Math.max(max, body.offsetHeight);
  }
  body.textContent = text;
  body.style.minBlockSize = max + 'px';
  reserved = true;
}
addEventListener('resize', () => { if (reserved && !busy) reserveHeight(); });

async function go(dir) {
  if (busy) return;
  busy = true;
  reserveHeight();
  region.setAttribute('aria-busy', 'true');
  current = (current + dir + slides.length) % slides.length;
  const slide = slides[current];
  await Promise.all([swapPhoto(slide), swapText(slide, dir)]);

  reserveHeight();
  announceSlide();
  region.setAttribute('aria-busy', 'false');
  busy = false;
}

quote.querySelector('.quote__arrow--prev').addEventListener('click', () => go(-1));
quote.querySelector('.quote__arrow--next').addEventListener('click', () => go(1));

let startX = null, startY = 0;
quote.addEventListener('pointerdown', e => {
  if (e.pointerType === 'mouse') return;
  startX = e.clientX; startY = e.clientY;
});
quote.addEventListener('pointerup', e => {
  if (startX === null) return;
  const dx = e.clientX - startX, dy = e.clientY - startY;
  startX = null;
  if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
});
quote.addEventListener('pointercancel', () => { startX = null; });
