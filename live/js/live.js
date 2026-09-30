// Effects for the live version. Everything added to the DOM is removed afterwards,
// so the page at rest matches landing/.
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

const root = document.documentElement;
const wait = ms => new Promise(r => setTimeout(r, ms));
const EASE_SOFT = 'cubic-bezier(.2, .7, .2, 1)';
let lampOn;
const lampDone = new Promise(r => { lampOn = r; });

const bbox = p => p.getBBox();
const vbOrigin = svg => svg.viewBox.baseVal;

// Illustrations: fade and slide in once, plus one animated detail inside each SVG.
// The SVG is inlined over the <img> for the animation, then removed.
// Numbers are path indices in the visible copy of each file.
const DETAILS = {
  lamp(svg) {
    const cone = svg.querySelectorAll('path')[0];
    return cone.animate(
      { opacity: [0, 0, .85, .1, 1, .35, 1], offset: [0, .35, .5, .6, .72, .8, 1] },
      { duration: 1100, easing: 'linear', fill: 'backwards' }).finished;
  },

  dots(svg) {
    const paths = svg.querySelectorAll('path');
    return Promise.all([35, 36, 37].map((n, i) => paths[n].animate(
      [{ translate: '0 0' }, { translate: '0 -9px', offset: .4 }, { translate: '0 0' }],
      { duration: 420, delay: 550 + i * 130, iterations: 2, easing: 'ease-in-out' }).finished));
  },

  cards(svg) {
    const paths = [...svg.querySelectorAll('path')];
    const { x: vx, y: vy } = vbOrigin(svg);
    const hub = { x: 358, y: 390 };
    const jobs = [];
    [40, 65, 57, 53].forEach((frameIndex, order) => {
      const f = bbox(paths[frameIndex]);
      const cx = f.x + f.width / 2, cy = f.y + f.height / 2;
      const inside = paths.filter(p => {
        const b = bbox(p);
        return b.x >= f.x - 2 && b.y >= f.y - 2 && b.x + b.width <= f.x + f.width + 2 && b.y + b.height <= f.y + f.height + 2;
      });
      const dx = (hub.x - cx) * .7, dy = (hub.y - cy) * .7;
      for (const p of inside) {
        p.style.transformBox = 'view-box';
        p.style.transformOrigin = `${cx - vx}px ${cy - vy}px`;
        jobs.push(p.animate(
          [{ opacity: 0, transform: `translate(${dx}px, ${dy}px) scale(.3)` },
           { opacity: 1, transform: 'none' }],
          { duration: 650, delay: 450 + order * 110, easing: 'cubic-bezier(.34, 1.5, .64, 1)', fill: 'backwards' }).finished);
      }
    });
    return Promise.all(jobs);
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

async function playArt(a) {
  a.state = 'playing';
  let svg;
  try {
    const txt = await (await fetch(a.img.getAttribute('src'))).text();
    svg = new DOMParser().parseFromString(txt, 'image/svg+xml').documentElement;
    if (svg.nodeName !== 'svg') throw new Error('not an SVG');
  } catch {
    a.img.classList.add('art-shown');
    await a.img.animate(
      [{ opacity: 0, translate: '0 20px' }, { opacity: 1, translate: '0 0' }],
      { duration: 600, easing: EASE_SOFT }).finished.catch(() => {});
    return showArt(a);
  }
  svg.classList.add('art-fx');
  svg.setAttribute('aria-hidden', 'true');
  a.img.after(svg);

  const target = a.img.getBoundingClientRect();
  Object.assign(svg.style, { left: '0px', top: '0px', width: `${target.width}px`, height: `${target.height}px` });
  const at = svg.getBoundingClientRect();
  Object.assign(svg.style, { left: `${target.left - at.left}px`, top: `${target.top - at.top}px` });

  const appear = svg.animate(
    [{ opacity: 0, translate: '0 20px' }, { opacity: 1, translate: '0 0' }],
    { duration: 600, easing: EASE_SOFT, fill: 'backwards' }).finished;
  await Promise.all([appear, DETAILS[a.detail](svg)]);
  showArt(a);
  svg.remove();
}

function checkArts(stopped = false) {
  const H = innerHeight;
  for (const a of arts) {
    if (a.state) continue;
    const r = a.img.getBoundingClientRect();
    if (r.bottom < 0) { showArt(a); continue; }
    const centerUp = r.top + r.height / 2 <= H / 2;
    const whole = stopped && r.top >= 0 && r.bottom <= H;
    if (centerUp || whole) playArt(a);
  }
}

if (root.classList.contains('fx-art')) {
  root.dataset.art = 'on';
  for (const a of arts) if (a.now) playArt(a);
  checkArts();
  let tick = 0;
  addEventListener('scroll', () => {
    if (!tick) tick = requestAnimationFrame(() => { tick = 0; checkArts(); });
  }, { passive: true });
  addEventListener('scrollend', () => checkArts(true));
  addEventListener('resize', () => checkArts(true));
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

async function typeTitle() {
  if (!root.classList.contains('is-typing')) return;
  root.dataset.typing = 'on';
  await document.fonts.ready;
  let ghost = null;
  const finish = () => {
    CSS.highlights.delete('typed');
    ghost?.remove();
    root.classList.remove('is-typing');
  };

  if (title.getBoundingClientRect().bottom < 0) return finish();

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
  CSS.highlights.set('typed', new Highlight(typed));
  place(0);

  await Promise.all([wait(900), Promise.race([lampDone, wait(2500)])]);
  ghost.classList.remove('caret--wait');
  for (let k = 1; k <= N; k++) {
    await wait(keyDelay(chars[k - 1][0].data[chars[k - 1][1]]));
    typed.setEnd(chars[k - 1][0], chars[k - 1][1] + 1);
    CSS.highlights.set('typed', new Highlight(typed));
    place(k);
  }
  await wait(120);
  finish();

  titleCaret.classList.add('caret--blink');
  titleCaret.addEventListener('animationend', () => titleCaret.classList.remove('caret--blink'), { once: true });
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
let touching = false;

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

if ('onscrollend' in window) addEventListener('scrollend', onScrollEnd);
else {
  let t;
  const later = () => { clearTimeout(t); t = setTimeout(() => { if (!touching) onScrollEnd(); }, 150); };
  addEventListener('scroll', later, { passive: true });
  addEventListener('touchend', later, { passive: true });
}

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
const name  = quote.querySelector('.quote__name');
const live  = quote.querySelector('.quote__text');

const slides = [
  { photo: photo.getAttribute('src'), name: name.textContent, text: body.textContent },
  { photo: '../assets/img/testimonial-photo-2.jpg', name: 'Mia Sorensen',
    text: 'Pellentesque tempus sed phasellus vel mauris fermentum praesent. Tellus euismod pellentesque urna ac massa in vulputate natoque.' },
  { photo: '../assets/img/testimonial-photo-3.jpg', name: 'Daniel Moreno',
    text: 'Quisque porttitor vitae vel amet neque scelerisque mattis. Consectetur nibh velit magna consectetur leo sollicitudin ornare tempus.' },
  { photo: '../assets/img/testimonial-photo-4.jpg', name: 'Amara Okafor',
    text: 'Sollicitudin ornare tempus felis nulla varius pulvinar nibh viverra. Quam vehicula faucibus amet lorem condimentum blandit rutrum.' },
];

for (const s of slides.slice(1)) new Image().src = s.photo;

let current = 0;
let busy = false;

const EASE_OUT = 'cubic-bezier(.2, .7, .2, 1)';
const EASE_IN  = 'cubic-bezier(.6, 0, .8, .3)';

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
  const els = [body, name];
  if (reduceMotion.matches) {
    await Promise.all(els.map(el => el.animate({ opacity: [1, 0] }, { duration: 150, fill: 'forwards' }).finished));
    body.textContent = slide.text;
    name.textContent = slide.name;
    await Promise.all(els.map(el => el.animate({ opacity: [0, 1] }, { duration: 150 }).finished));
    for (const el of els) el.getAnimations().forEach(a => a.cancel());
    return;
  }

  const out = els.flatMap(splitLines);
  await moveLines(out, 0, -105 * dir, EASE_IN, 320);
  body.textContent = slide.text;
  name.textContent = slide.name;
  const inn = els.flatMap(splitLines);
  await moveLines(inn, 105 * dir, 0, EASE_OUT, 520);

  body.textContent = slide.text;
  name.textContent = slide.name;
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
  live.setAttribute('aria-busy', 'true');
  current = (current + dir + slides.length) % slides.length;
  const slide = slides[current];
  await Promise.all([swapPhoto(slide), swapText(slide, dir)]);

  reserveHeight();
  live.setAttribute('aria-busy', 'false');
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
