/* Teyyub Melikov. Personal site. Vanilla JS, no build step. */
(() => {
'use strict';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const smoothstep = (p, e0, e1) => { const t = clamp((p - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
const RM = matchMedia('(prefers-reduced-motion: reduce)');

/* ---------- Config ---------- */
const VIDEO_URL = 'assets/hero-scrub.mp4';
const VIDEO_BYTES = 6156198;                 /* hardcoded real byte size after the encode */
const MOVE_DATE = new Date('2025-09-16T00:00:00');   /* the move to Berlin, 16 September 2025 */

/* ---------- Page ease-in ---------- */
requestAnimationFrame(() => document.body.classList.add('ready'));

/* ---------- Text splitting (once, seeded) ---------- */
function rng(seed) { let s = seed >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }
function splitEl(el, idx) {
  const text = el.textContent.trim();
  const mode = el.dataset.mode || 'char';
  const band = el.closest('.band');
  const spread = parseFloat((band && band.dataset.spread) || '0.5');
  const ordered = mode === 'word' || (band && (band.classList.contains('e-grid') || band.classList.contains('e-rise')));
  const r = rng(1000 + idx * 97);
  const sr = document.createElement('span'); sr.className = 'sr'; sr.textContent = text;
  const vis = document.createElement('span'); vis.className = 'vis'; vis.setAttribute('aria-hidden', 'true');
  const words = text.split(/\s+/);
  const totalChars = text.replace(/\s/g, '').length;
  let ci = 0;
  words.forEach((w, wi) => {
    const ws = document.createElement('span'); ws.className = 'w';
    if (mode === 'word') {
      ws.textContent = w;
      ws.style.setProperty('--th', (wi / words.length * spread + r() * 0.05).toFixed(3));
      ws.style.setProperty('--jy', (8 + r() * 10).toFixed(1) + 'px');
    } else {
      [...w].forEach(ch => {
        const cs = document.createElement('span'); cs.className = 'c'; cs.textContent = ch;
        const th = ordered ? (ci / totalChars * spread + r() * 0.06) : r() * spread;
        cs.style.setProperty('--th', th.toFixed(3));
        cs.style.setProperty('--jx', (ordered ? (r() < .5 ? -1 : 1) * (30 + r() * 50) : (r() - .5) * 90).toFixed(1) + 'px');
        cs.style.setProperty('--jy', (ordered ? 0 : (r() - .5) * 70).toFixed(1) + 'px');
        cs.style.setProperty('--jr', (ordered ? 0 : (r() - .5) * 40).toFixed(1) + 'deg');
        ws.appendChild(cs); ci++;
      });
    }
    vis.appendChild(ws);
    if (wi < words.length - 1) vis.appendChild(document.createTextNode(' '));
  });
  el.textContent = ''; el.append(sr, vis);
}
$$('[data-split]').forEach(splitEl);

/* ---------- Hero engine ---------- */
const hero = $('#hero'), stage = $('#stage'), video = $('#hero-video'), poster = $('#poster'), ring = $('#ring'), cue = $('#cue'), nav = $('.nav');
const bands = $$('.band').map(el => ({ el, a: +el.dataset.a, b: +el.dataset.b, ramp: el.dataset.ramp ? +el.dataset.ramp : null, op: -1, k: -1, live: false }));
let heroOnScreen = true, scrubOn = false, rafId = null, lastTick = 0, target = 0, shown = 0;
let seekBusy = false, pendingTime = null;
let loadK = 0, loadStart = 0;
let cueGone = false, navScrolled = false;

function heroProgress() {
  const r = hero.getBoundingClientRect();
  const range = hero.offsetHeight - innerHeight;
  return range > 0 ? clamp(-r.top / range, 0, 1) : 0;
}

/* gated seeks, deadlock-safe */
function requestSeek(t) {
  if (!video.duration) return;
  if (seekBusy) { pendingTime = t; return; }
  seekBusy = true;
  video.currentTime = t;
}
video.addEventListener('seeked', () => {
  seekBusy = false;
  if (pendingTime !== null) { const t = pendingTime; pendingTime = null; requestSeek(t); }
});
video.addEventListener('error', () => { seekBusy = false; pendingTime = null; failVideo(); });

/* captions: delta-gated writes */
function updateCaptions(p, now) {
  if (loadStart && loadK < 1) { const t = clamp((now - loadStart) / 1500, 0, 1); loadK = t * t * (3 - 2 * t); }
  const last = bands.length - 1;
  bands.forEach((bd, i) => {
    const { a, b } = bd;
    const f = Math.min(0.02, (b - a) / 3);
    const op = (i === 0 ? 1 : smoothstep(p, a, a + f)) * (i === last ? 1 : (1 - smoothstep(p, b - f, b)));
    const ramp = bd.ramp || Math.min(0.025, (b - a) * 0.35);
    let k = clamp((p - a) / ramp, 0, 1);
    if (i === 0) k = Math.max(k, loadK);
    if (Math.abs(op - bd.op) > 0.008 || ((op === 0 || op === 1) && op !== bd.op)) { bd.op = op; bd.el.style.opacity = op.toFixed(3); }
    if (Math.abs(k - bd.k) > 0.008 || ((k === 0 || k === 1) && k !== bd.k)) { bd.k = k; bd.el.style.setProperty('--k', k.toFixed(3)); }
    const live = op > 0.5;
    if (live !== bd.live) { bd.live = live; bd.el.classList.toggle('live', live); }
  });
}

/* the rAF loop that rests */
function tick(now) {
  const dt = Math.min(100, now - (lastTick || now));
  lastTick = now;
  const k = 0.16;
  shown += (target - shown) * (1 - Math.pow(1 - k, dt / 16.667));
  const converged = Math.abs(target - shown) < 0.0005;
  if (converged) shown = target;
  if (converged && loadK >= 1) { rafId = null; lastTick = 0; }
  else rafId = requestAnimationFrame(tick);
  requestSeek(shown * video.duration);
  updateCaptions(shown, now);
}
function onScroll() {
  target = heroProgress();
  if (rafId === null && heroOnScreen) rafId = requestAnimationFrame(tick);
}
function onScrollGlobal() {
  const g = scrollY > 40;
  if (g !== cueGone) { cueGone = g; cue.classList.toggle('gone', g); }
  const s = scrollY > 10;
  if (s !== navScrolled) { navScrolled = s; nav.classList.toggle('scrolled', s); }
}
addEventListener('scroll', onScrollGlobal, { passive: true });

new IntersectionObserver(([e]) => {
  heroOnScreen = e.isIntersecting;
  if (heroOnScreen && scrubOn) onScroll();
}, { threshold: 0 }).observe(hero);

/* Blob loader: poster first, then the streamed video behind the ring */
let inited = false, started = false;
function initHeroOnce() {
  if (inited) return; inited = true;
  poster.style.backgroundImage = "url('assets/hero-poster.jpg')";
  const img = new Image();
  img.onload = startBlobFetch; img.onerror = startBlobFetch;
  img.src = 'assets/hero-poster.jpg';
  setTimeout(startBlobFetch, 4000);
  loadStart = performance.now();
}
function startBlobFetch() { if (started) return; started = true; loadHeroBlob().catch(failVideo); }
async function loadHeroBlob() {
  if (location.protocol === 'file:') throw new Error('file protocol: still hero by design');
  const ctrl = new AbortController();
  let watchdog = setTimeout(() => ctrl.abort(), 20000);
  const res = await fetch(VIDEO_URL, { priority: 'low', signal: ctrl.signal });
  if (!res.ok || !res.body) throw new Error('video ' + res.status);
  const total = Number(res.headers.get('Content-Length')) || VIDEO_BYTES;
  const reader = res.body.getReader();
  const chunks = []; let got = 0, lastRing = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    clearTimeout(watchdog);
    watchdog = setTimeout(() => ctrl.abort(), 20000);
    chunks.push(value); got += value.length;
    const frac = Math.min(1, got / total);
    const now = performance.now();
    if (now - lastRing > 100 || frac === 1) { lastRing = now; ring.style.setProperty('--ld', Math.round(126 * (1 - frac))); }
  }
  clearTimeout(watchdog);
  ring.style.setProperty('--ld', 0);
  video.src = URL.createObjectURL(new Blob(chunks, { type: 'video/mp4' }));
  video.load();
  video.addEventListener('canplay', () => {
    requestSeek(heroProgress() * video.duration);
    stage.classList.add('video-ready');
    onScroll();
  }, { once: true });
}
function failVideo() {
  if (stage.classList.contains('video-failed')) return;
  stage.classList.add('video-failed');   /* the poster and the captions carry the journey */
}

/* the five gates, decided live */
const GATES = [
  '(max-width: 720px)',
  '(orientation: portrait) and (max-width: 1024px)',
  '(orientation: portrait) and (pointer: coarse)',
  '(orientation: landscape) and (pointer: coarse) and (max-height: 560px)',
  '(prefers-reduced-motion: reduce)'
];
function enableScrub() {
  if (scrubOn) return; scrubOn = true;
  initHeroOnce();
  addEventListener('scroll', onScroll, { passive: true });
  bands.forEach(b => { b.op = -1; b.k = -1; b.live = false; });
  unpinFinalStates();
  updateCaptions(heroProgress(), performance.now());
  onScroll();
}
function disableScrub() {
  if (!scrubOn) return; scrubOn = false;
  removeEventListener('scroll', onScroll);
  if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
}
function applyHeroMode() {
  if (GATES.some(q => matchMedia(q).matches)) disableScrub();
  else enableScrub();
}
const MQLS = GATES.map(q => matchMedia(q));
MQLS.forEach(m => m.addEventListener('change', applyHeroMode));

/* ---------- Section entrances ---------- */
const revealIO = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (!e.isIntersecting) return;
    const el = e.target;
    el.classList.add('in');
    revealIO.unobserve(el);
    setTimeout(() => el.classList.add('done'), 1800);   /* retire the stagger delays */
  });
}, { rootMargin: '0px 0px -10% 0px', threshold: 0.06 });
$$('.reveal').forEach(r => {
  r.querySelectorAll('.part').forEach((p, i) => p.style.setProperty('--d', (i * 80) + 'ms'));
  revealIO.observe(r);
});

/* living elements only while on screen; everything paused on hidden tabs */
const visIO = new IntersectionObserver(es => es.forEach(e => e.target.classList.toggle('vis', e.isIntersecting)), { threshold: 0 });
$$('.section').forEach(s => visIO.observe(s));
$('.env').classList.add('vis');
document.addEventListener('visibilitychange', () => document.body.classList.toggle('paused', document.hidden));

/* ---------- Path: the self-drawing line ---------- */
const tl = $('#timeline'), tlPath = $('#tl-path'), tlItems = $$('.tl-item');
let tlOn = false, tlLast = -1;
function drawTimeline() {
  if (!tl) return;
  const r = tl.getBoundingClientRect();
  const p = clamp((innerHeight * 0.78 - r.top) / r.height, 0, 1);
  if (Math.abs(p - tlLast) < 0.004 && p !== 0 && p !== 1) return;
  if (p === tlLast) return;
  tlLast = p;
  tlPath.style.strokeDashoffset = (1000 * (1 - p)).toFixed(1);
  tlItems.forEach(it => {
    const ir = it.getBoundingClientRect();
    const lit = (ir.top + 14 - r.top) / r.height <= p;
    if (lit !== it.classList.contains('lit')) it.classList.toggle('lit', lit);
  });
}
if (tl) {
  new IntersectionObserver(([e]) => { tlOn = e.isIntersecting; if (tlOn) drawTimeline(); }, { threshold: 0 }).observe(tl);
  addEventListener('scroll', () => { if (tlOn) drawTimeline(); }, { passive: true });
}

/* ---------- The uptime chip (signature element) ---------- */
const up = $('#uptime');
let upLast = '', upTimer = null;
function fmtUptime() {
  const now = new Date();
  let y = now.getFullYear() - MOVE_DATE.getFullYear();
  let m = now.getMonth() - MOVE_DATE.getMonth();
  let d = now.getDate() - MOVE_DATE.getDate();
  if (d < 0) { m--; d += new Date(now.getFullYear(), now.getMonth(), 0).getDate(); }
  if (m < 0) { y--; m += 12; }
  const secs = Math.max(0, Math.floor((now - MOVE_DATE) / 1000));
  const hh = String(Math.floor(secs / 3600) % 24).padStart(2, '0');
  const mm = String(Math.floor(secs / 60) % 60).padStart(2, '0');
  const ss = String(secs % 60).padStart(2, '0');
  return `${y}y ${String(m).padStart(2, '0')}m ${String(d).padStart(2, '0')}d <span class="uptime-time">${hh}:${mm}:${ss}</span>`;
}
function writeUptime() {
  const s = fmtUptime();
  if (s !== upLast) { upLast = s; up.innerHTML = s; }
}
function startUptime() { if (upTimer === null) { writeUptime(); upTimer = setInterval(writeUptime, 1000); } }
function stopUptime() { if (upTimer !== null) { clearInterval(upTimer); upTimer = null; } }
document.addEventListener('visibilitychange', () => document.hidden ? stopUptime() : startUptime());
startUptime();

/* ---------- The health check (the one interactive moment) ---------- */
const hold = $('#hold'), hc = $('#hc'), hcLines = $$('#hc-lines li'), hcStatus = $('#hc-status'), grid = $('#skill-grid');
$$('#skill-grid li').forEach((li, i) => li.style.setProperty('--d', (i * 55) + 'ms'));
const HOLD_MS = 2400;
let holding = false, prog = 0, hcRaf = null, hcLast = 0, hcDone = false, litCount = -1, statusText = '';
function setStatus(t) { if (t !== statusText) { statusText = t; hcStatus.textContent = t; } }
function hcTick(now) {
  const dt = Math.min(100, now - (hcLast || now));
  hcLast = now;
  if (holding) prog = Math.min(1, prog + dt / HOLD_MS);
  else prog = Math.max(0, prog - dt / (HOLD_MS * 0.55));
  hold.style.setProperty('--p', prog.toFixed(3));
  const lit = Math.min(hcLines.length, Math.floor(prog * hcLines.length + 0.0001));
  if (lit !== litCount) { litCount = lit; hcLines.forEach((li, i) => li.classList.toggle('on', i < lit)); }
  if (prog >= 1 && !hcDone) completeCheck();
  if (!holding && prog === 0 && !hcDone) setStatus('Waiting.');
  if (!hcDone && (holding || prog > 0)) hcRaf = requestAnimationFrame(hcTick);
  else { hcRaf = null; hcLast = 0; }
}
function completeCheck() {
  hcDone = true; holding = false;
  hold.style.setProperty('--p', '1');
  hcLines.forEach(li => li.classList.add('on'));
  hold.classList.add('done'); hc.classList.add('done');
  hold.querySelector('.hold-label').textContent = 'All green';
  setStatus('All systems green.');
  grid.classList.add('lit');
}
function startHold() {
  if (hcDone) return;
  holding = true;
  setStatus('Running checks.');
  if (hcRaf === null) hcRaf = requestAnimationFrame(hcTick);
}
function endHold() {
  if (!holding) return;
  holding = false;
  if (!hcDone && prog > 0) setStatus('Released early. Rolling back.');
}
if (hold) {
  hold.addEventListener('pointerdown', e => { e.preventDefault(); if (hold.setPointerCapture) hold.setPointerCapture(e.pointerId); startHold(); });
  ['pointerup', 'pointercancel'].forEach(ev => hold.addEventListener(ev, endHold));
  hold.addEventListener('keydown', e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); startHold(); } });
  hold.addEventListener('keyup', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); endHold(); } });
  addEventListener('blur', endHold);
}

/* ---------- The celebration clip: plays only when asked ---------- */
const clip = $('#clip'), clipVideo = $('#clip-video'), clipPlay = $('#clip-play');
if (clip && clipVideo && clipPlay) {
  clipPlay.addEventListener('click', () => {
    clip.classList.add('playing');
    clipVideo.controls = true;
    clipVideo.play().catch(() => {});
  });
  clipVideo.addEventListener('ended', () => { clip.classList.remove('playing'); clipVideo.controls = false; });
  new IntersectionObserver(([e]) => { if (!e.isIntersecting && !clipVideo.paused) clipVideo.pause(); }, { threshold: 0 }).observe(clip);
  document.addEventListener('visibilitychange', () => { if (document.hidden && !clipVideo.paused) clipVideo.pause(); });
}

/* ---------- Reduced motion, honored live in both directions ---------- */
function pinToFinalStates() {
  document.body.classList.add('pinned');
  if (tlPath) tlPath.style.strokeDashoffset = '0';
  tlItems.forEach(it => it.classList.add('lit'));
  if (!hcDone) completeCheck();
  $$('.reveal').forEach(r => r.classList.add('in', 'done'));
}
function unpinFinalStates() {
  if (!document.body.classList.contains('pinned')) return;
  document.body.classList.remove('pinned');
  tlLast = -1;
  if (tlOn) drawTimeline();
}
RM.addEventListener('change', e => { if (e.matches) pinToFinalStates(); else applyHeroMode(); });
if (RM.matches) pinToFinalStates();

applyHeroMode();
})();
