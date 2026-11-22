/* Deep Current — Pisces v1.
 * All logic runs on-device. No network calls except same-origin content files.
 * Pure functions are exported for node tests (see tests/test.js).
 */
'use strict';

var SYNODIC_DAYS = 29.530588853;
var REF_NEW_MOON_UNIX = 947182440; // Jan 6, 2000, 18:14 UTC
var CONTENT_VERSION = 1;
var SIGN_ID = 'pisces';
var STORAGE_KEY = 'deepcurrent.saved.v1';

var PHASES = [
  { key: 'new', name: 'New Moon', start: 337.5, end: 22.5 },
  { key: 'waxing-crescent', name: 'Waxing Crescent', start: 22.5, end: 67.5 },
  { key: 'first-quarter', name: 'First Quarter', start: 67.5, end: 112.5 },
  { key: 'waxing-gibbous', name: 'Waxing Gibbous', start: 112.5, end: 157.5 },
  { key: 'full', name: 'Full Moon', start: 157.5, end: 202.5 },
  { key: 'waning-gibbous', name: 'Waning Gibbous', start: 202.5, end: 247.5 },
  { key: 'last-quarter', name: 'Last Quarter', start: 247.5, end: 292.5 },
  { key: 'waning-crescent', name: 'Waning Crescent', start: 292.5, end: 337.5 }
];

/* ---------- seeding ---------- */
function hash32(str) {
  var h = 2166136261;
  for (var i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  var a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function localDateKey(d) {
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1).padStart(2, '0');
  var day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

function compactDateKey(d) {
  return String(d.getFullYear()) +
    String(d.getMonth() + 1).padStart(2, '0') +
    String(d.getDate()).padStart(2, '0');
}

function selectTheme(themes, date, signId) {
  var idx = hash32(compactDateKey(date) + '|' + signId) % themes.length;
  return themes[idx];
}

function luckyNumbers(date, signId) {
  var rng = mulberry32(hash32(compactDateKey(date) + '|' + signId + '|lucky'));
  var out = [];
  while (out.length < 3) {
    var n = Math.floor(rng() * 99) + 1;
    if (out.indexOf(n) === -1) out.push(n);
  }
  return out;
}

/* ---------- moon ---------- */
function moonInfo(nowMs) {
  var nowSec = nowMs / 1000;
  var age = (((nowSec - REF_NEW_MOON_UNIX) / 86400) % SYNODIC_DAYS + SYNODIC_DAYS) % SYNODIC_DAYS;
  var angle = (age / SYNODIC_DAYS) * 360;
  var illum = (1 - Math.cos(angle * Math.PI / 180)) / 2;
  var phase = PHASES[0];
  for (var i = 0; i < PHASES.length; i++) {
    var p = PHASES[i];
    if (p.start <= p.end) {
      if (angle >= p.start && angle < p.end) { phase = p; break; }
    } else if (angle >= p.start || angle < p.end) { phase = p; break; }
  }
  var daysToFull = (((180 - angle) % 360 + 360) % 360) / 360 * SYNODIC_DAYS;
  var daysToNew = (((360 - angle) % 360)) / 360 * SYNODIC_DAYS;
  return {
    age: age,
    angleDeg: angle,
    illumination: illum,
    phaseKey: phase.key,
    phaseName: phase.name,
    waxing: angle < 180,
    nextFullDate: new Date(nowMs + daysToFull * 86400000),
    nextNewDate: new Date(nowMs + daysToNew * 86400000),
    daysToFull: daysToFull,
    daysToNew: daysToNew
  };
}

function formatShortDate(d) {
  var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var s = months[d.getMonth()] + ' ' + d.getDate();
  if (d.getFullYear() !== new Date().getFullYear()) s += ', ' + d.getFullYear();
  return s;
}

function formatLongDate(d) {
  var days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return days[d.getDay()] + ', ' + months[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
}

/* ---------- snapshots ---------- */
function buildSnapshot(date, theme, numbers, moon, contentVersion) {
  return {
    date: localDateKey(date),
    signId: SIGN_ID,
    contentVersion: contentVersion,
    savedAt: new Date().toISOString(),
    themeId: theme.id,
    themeName: theme.name,
    overall: theme.overall,
    love: theme.love,
    focus: theme.focus,
    affirmation: theme.affirmation,
    mood: theme.mood,
    tide: theme.tide,
    tideLabel: theme.tideLabel,
    luckyNumbers: numbers.slice(),
    luckyColor: theme.luckyColor,
    luckyColorHex: theme.luckyColorHex,
    moonPhase: moon.phaseKey,
    moonPhaseName: moon.phaseName,
    moonIllumination: Math.round(moon.illumination * 100),
    moonAge: Math.round(moon.age * 10) / 10,
    estimatedNextFullMoonDate: localDateKey(moon.nextFullDate),
    estimatedNextNewMoonDate: localDateKey(moon.nextNewDate)
  };
}

function loadSaved() {
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    var arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (e) { return []; }
}

function storeSaved(arr) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(arr)); } catch (e) { /* storage full/blocked */ }
}

/* ---------- moon shape (shared by the Moon tab and share cards) ---------- */
function drawMoonShape(ctx, cx, cy, R, moon) {
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fillStyle = '#101024';
  ctx.fill();
  var theta = moon.angleDeg * Math.PI / 180;
  var waxing = moon.angleDeg < 180;
  var rx = R * Math.abs(Math.cos(theta));
  ctx.beginPath();
  if (waxing) {
    ctx.arc(cx, cy, R, -Math.PI / 2, Math.PI / 2, false);
  } else {
    ctx.arc(cx, cy, R, -Math.PI / 2, Math.PI / 2, true);
  }
  var ccw = (Math.cos(theta) < 0) === waxing;
  ctx.ellipse(cx, cy, Math.max(rx, 0.01), R, 0, Math.PI / 2, Math.PI * 1.5, ccw);
  ctx.closePath();
  var grad = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.3, R * 0.1, cx, cy, R);
  grad.addColorStop(0, '#F5F1DC');
  grad.addColorStop(1, '#D9D2B8');
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(165, 243, 252, 0.25)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

/* ---------- share cards ---------- */
var SHARE_URL = 'https://devilinthecomments.github.io/deep-current/';
var CARD_W = 1080;
var CARD_PAD = 72;
var CARD_CW = CARD_W - CARD_PAD * 2;
var CARD_MAX_H = 2600;
var CARD_FONTS = {
  brand: '700 26px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  date: '26px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  title: '700 62px Georgia, "Times New Roman", serif',
  glyph: '64px Georgia, "Times New Roman", serif',
  label: '700 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  body: '30px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  sub: '28px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  footer: '24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
};

/* Wrap text to lines that fit maxWidth. measureFn(text) -> px width. */
function wrapText(measureFn, text, maxWidth) {
  var out = [];
  String(text).split('\n').forEach(function (para) {
    var words = para.split(/\s+/).filter(function (w) { return w.length > 0; });
    if (!words.length) { out.push(''); return; }
    var line = '';
    words.forEach(function (w) {
      var test = line ? line + ' ' + w : w;
      if (measureFn(test) <= maxWidth || !line) { line = test; }
      else { out.push(line); line = w; }
    });
    if (line) out.push(line);
  });
  return out;
}

/* Build the share content for one tab (or one frozen saved day).
 * kind: 'today' | 'moon' | 'pisces' | 'matches' | 'you' | 'saved'.
 * Returns { kind, heading, section, dateLine, blocks, moon?, shareText }
 * or null for an unknown kind. No percentages anywhere except real moon
 * illumination (calculated astronomy, already shown in the app); Matches is
 * prose-only and Cosmic Tide is always 1–5 + label, never a percent. */
function buildShareCard(kind, data) {
  var card = null;
  if (kind === 'today') {
    var t = data.theme, m = data.moon;
    card = {
      kind: kind,
      heading: t.name,
      section: 'Today · Pisces',
      dateLine: formatLongDate(data.date),
      blocks: [
        { label: 'Horoscope', text: t.overall },
        { label: 'Love', text: t.love },
        { label: 'Focus', text: t.focus },
        { label: 'Cosmic Tide', text: 'Tide ' + t.tide + ' of 5 — ' + t.tideLabel, tide: t.tide },
        { label: 'Lucky', text: data.numbers.join(' · ') + ' · ' + t.luckyColor },
        { label: 'Affirmation', text: '\u201C' + t.affirmation + '\u201D' }
      ],
      moon: m
    };
  } else if (kind === 'moon') {
    var mm = data.moon;
    card = {
      kind: kind,
      heading: mm.phaseName,
      section: 'Moon · Pisces',
      dateLine: formatLongDate(data.date),
      blocks: [
        { label: 'Illumination', text: Math.round(mm.illumination * 100) + '% lit · approximate · moon age ' + (Math.round(mm.age * 10) / 10) + ' days' },
        { label: 'Next full moon', text: formatShortDate(mm.nextFullDate) + ' · in ' + Math.round(mm.daysToFull) + ' days · approximate' },
        { label: 'Next new moon', text: formatShortDate(mm.nextNewDate) + ' · in ' + Math.round(mm.daysToNew) + ' days · approximate' },
        { label: 'What this means for Pisces', text: data.meaning || '' }
      ],
      moon: mm
    };
  } else if (kind === 'pisces') {
    var s = data.sign;
    card = {
      kind: kind,
      heading: 'Pisces',
      section: 'Pisces · The Two Fish',
      dateLine: s.dates + ' · ' + s.element + ' · Ruled by ' + s.ruler,
      blocks: [{ label: 'Sign', text: 'Dates ' + s.dates + ' · Element ' + s.element + ' · Ruler ' + s.ruler + ' · Symbol ' + s.symbol }]
        .concat(s.strengths.map(function (x) { return { label: x.title, text: x.text }; }))
    };
  } else if (kind === 'matches') {
    var sg = data.sign;
    var best = ['Cancer', 'Scorpio', 'Taurus'];
    card = {
      kind: kind,
      heading: 'Matches',
      section: 'Pisces · Compatibility',
      dateLine: 'Compatibility is a starting point, not a verdict.',
      blocks: best.map(function (n) {
        var d = sg.compatibility[n.toLowerCase()];
        return { label: n, text: d.read, sub: d.why };
      })
    };
  } else if (kind === 'you') {
    var saved = (data.saved || []).slice().sort(function (a, b) { return b.date.localeCompare(a.date); });
    var savedText;
    if (saved.length) {
      var shown = saved.slice(0, 8);
      savedText = shown.map(function (x) { return x.themeName + ' — ' + x.date + ' · ' + x.moonPhaseName; }).join('\n');
      if (saved.length > shown.length) savedText += '\n…and ' + (saved.length - shown.length) + ' more saved days';
    } else {
      savedText = 'No days saved yet. Tap \u201CSave this day\u201D on the Today tab to keep a day exactly as it was.';
    }
    card = {
      kind: kind,
      heading: 'You · Pisces',
      section: 'Your sign',
      dateLine: 'March 1, 1988 · Sun in Pisces',
      blocks: [
        { label: 'Your sign', text: data.profileRead },
        { label: 'Saved days', text: savedText }
      ]
    };
  } else if (kind === 'saved') {
    var snap = data.snapshot;
    card = {
      kind: kind,
      heading: snap.themeName,
      section: 'Saved day · Pisces',
      dateLine: snap.date + ' · as saved',
      blocks: [
        { label: 'Horoscope', text: snap.overall },
        { label: 'Love', text: snap.love },
        { label: 'Focus', text: snap.focus },
        { label: 'Theme mood', text: snap.mood },
        { label: 'Cosmic Tide', text: 'Tide ' + snap.tide + ' of 5 — ' + snap.tideLabel, tide: snap.tide },
        { label: 'Moon', text: snap.moonPhaseName + ' · ' + snap.moonIllumination + '% lit · approximate · moon age ' + snap.moonAge + ' days' },
        { label: 'Lucky', text: snap.luckyNumbers.join(' · ') + ' · ' + snap.luckyColor },
        { label: 'Affirmation', text: '\u201C' + snap.affirmation + '\u201D' }
      ]
    };
  }
  if (!card) return null;
  card.blocks = card.blocks.filter(function (b) { return b.text && String(b.text).trim().length > 0; });
  card.title = 'Deep Current — Pisces';
  card.shareText = shareTextFromCard(card);
  return card;
}

function shareTextFromCard(card) {
  var lines = [];
  lines.push(card.heading + ' — Deep Current · Pisces');
  lines.push(card.dateLine);
  lines.push('');
  card.blocks.forEach(function (b) {
    lines.push(b.label);
    lines.push(b.text);
    if (b.sub) lines.push(b.sub);
    lines.push('');
  });
  lines.push('Deep Current — Pisces · ' + SHARE_URL);
  return lines.join('\n');
}

function cardContentHeight(titleLines, blocks) {
  var h = 64 + 30 + 26 + 116 + 22 + 30 + 26 + titleLines.length * 74 + 40;
  blocks.forEach(function (b) {
    h += 30 + 10 + b.lines.length * 46;
    if (b.subLines.length) h += 8 + b.subLines.length * 42;
    if (b.tide) h += 26;
    h += 34;
  });
  h += 36 + 24 + 64;
  return h;
}

/* Measure + wrap every block and compute the canvas height.
 * measure(text, fontCss) -> px width. Height is capped at CARD_MAX_H by
 * trimming lines (then whole blocks) from the end. */
function layoutShareCard(measure, card, width) {
  var w = width || CARD_W;
  var cw = w - CARD_PAD * 2;
  var titleLines = wrapText(function (t) { return measure(t, CARD_FONTS.title); }, card.heading, cw);
  var blocks = card.blocks.map(function (b) {
    return {
      label: b.label,
      lines: wrapText(function (t) { return measure(t, CARD_FONTS.body); }, b.text, cw),
      subLines: b.sub ? wrapText(function (t) { return measure(t, CARD_FONTS.sub); }, b.sub, cw) : [],
      tide: b.tide || 0
    };
  });
  while (cardContentHeight(titleLines, blocks) > CARD_MAX_H) {
    var last = blocks[blocks.length - 1];
    if (!last) break;
    if (last.subLines.length) { last.subLines.pop(); }
    else if (last.lines.length > 1) {
      last.lines.pop();
      var li = last.lines[last.lines.length - 1];
      if (li.slice(-1) !== '\u2026') last.lines[last.lines.length - 1] = li + ' \u2026';
    } else { blocks.pop(); }
  }
  return { width: w, height: cardContentHeight(titleLines, blocks), titleLines: titleLines, blocks: blocks };
}

function roundRectPath(ctx, x, y, w, h, r) {
  if (w <= 0) return;
  r = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* Draw the share card on canvas and return a PNG data URL. */
function renderShareCard(canvas, card) {
  var ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context');
  function measure(text, font) { ctx.font = font; return ctx.measureText(text).width; }
  var L = layoutShareCard(measure, card, CARD_W);
  canvas.width = L.width;
  canvas.height = L.height;
  var W = L.width, H = L.height;
  // Background: deep space + violet glow + a sprinkle of stars.
  ctx.fillStyle = '#06060F';
  ctx.fillRect(0, 0, W, H);
  var bg = ctx.createRadialGradient(W / 2, 0, 0, W / 2, 0, 700);
  bg.addColorStop(0, 'rgba(109, 40, 217, 0.28)');
  bg.addColorStop(1, 'rgba(6, 6, 15, 0)');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  var seed = 1234567 + card.heading.length * 97;
  function srand() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
  for (var i = 0; i < 26; i++) {
    ctx.globalAlpha = 0.15 + srand() * 0.45;
    ctx.fillStyle = '#CFE9FF';
    ctx.beginPath();
    ctx.arc(srand() * W, srand() * H, 1 + srand() * 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  var y = 64;
  ctx.fillStyle = '#2DD4BF';
  ctx.font = CARD_FONTS.brand;
  ctx.fillText('DEEP CURRENT — PISCES', W / 2, y + 15);
  y += 30 + 26;
  var glyphCy = y + 58;
  ctx.beginPath();
  ctx.arc(W / 2, glyphCy, 58, 0, Math.PI * 2);
  var cg = ctx.createRadialGradient(W / 2, glyphCy - 20, 10, W / 2, glyphCy, 58);
  cg.addColorStop(0, 'rgba(109, 40, 217, 0.55)');
  cg.addColorStop(1, 'rgba(6, 6, 15, 0.2)');
  ctx.fillStyle = cg;
  ctx.fill();
  ctx.strokeStyle = 'rgba(212, 175, 55, 0.55)';
  ctx.lineWidth = 2;
  ctx.stroke();
  if (card.kind === 'moon' && card.moon) {
    drawMoonShape(ctx, W / 2, glyphCy, 50, card.moon);
  } else {
    ctx.fillStyle = '#D4AF37';
    ctx.font = CARD_FONTS.glyph;
    ctx.fillText('\u2653', W / 2, glyphCy + 2);
  }
  y += 116 + 22;
  ctx.fillStyle = '#A5F3FC';
  ctx.font = CARD_FONTS.date;
  ctx.fillText(card.dateLine, W / 2, y + 15);
  y += 30 + 26;
  ctx.fillStyle = '#F3F1FA';
  ctx.font = CARD_FONTS.title;
  L.titleLines.forEach(function (ln) { ctx.fillText(ln, W / 2, y + 37); y += 74; });
  y += 20;
  ctx.strokeStyle = 'rgba(212, 175, 55, 0.6)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 40, y);
  ctx.lineTo(W / 2 + 40, y);
  ctx.stroke();
  y += 20;

  ctx.textAlign = 'left';
  L.blocks.forEach(function (b) {
    ctx.fillStyle = '#2DD4BF';
    ctx.font = CARD_FONTS.label;
    ctx.fillText(b.label.toUpperCase(), CARD_PAD, y + 15);
    y += 30 + 10;
    ctx.fillStyle = '#F3F1FA';
    ctx.font = CARD_FONTS.body;
    b.lines.forEach(function (ln) { ctx.fillText(ln, CARD_PAD, y + 23); y += 46; });
    if (b.subLines.length) {
      y += 8;
      ctx.fillStyle = '#A5F3FC';
      ctx.font = CARD_FONTS.sub;
      b.subLines.forEach(function (ln) { ctx.fillText(ln, CARD_PAD, y + 21); y += 42; });
    }
    if (b.tide) {
      y += 14;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.09)';
      roundRectPath(ctx, CARD_PAD, y, CARD_CW, 12, 6);
      ctx.fill();
      var tg = ctx.createLinearGradient(CARD_PAD, 0, CARD_PAD + CARD_CW, 0);
      tg.addColorStop(0, '#6D28D9');
      tg.addColorStop(1, '#2DD4BF');
      ctx.fillStyle = tg;
      roundRectPath(ctx, CARD_PAD, y, CARD_CW * (b.tide / 5), 12, 6);
      ctx.fill();
      y += 12;
    }
    y += 34;
  });
  y += 36;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#8B86A3';
  ctx.font = CARD_FONTS.footer;
  ctx.fillText('Deep Current — Pisces · devilinthecomments.github.io/deep-current', W / 2, y + 12);
  return canvas.toDataURL('image/png');
}

/* True when the native share sheet can take a PNG file. `nav` is
 * navigator-like; injectable for tests. */
function supportsFileShare(nav) {
  if (!nav || typeof nav.share !== 'function') return false;
  if (typeof nav.canShare !== 'function') return true;
  try {
    var f = (typeof File === 'function')
      ? new File(['x'], 'x.png', { type: 'image/png' })
      : { name: 'x.png', type: 'image/png' };
    return !!nav.canShare({ files: [f] });
  } catch (e) { return false; }
}

/* ---------- exports for node tests ---------- */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    hash32: hash32, mulberry32: mulberry32, localDateKey: localDateKey,
    compactDateKey: compactDateKey, selectTheme: selectTheme,
    luckyNumbers: luckyNumbers, moonInfo: moonInfo, PHASES: PHASES,
    buildSnapshot: buildSnapshot, SYNODIC_DAYS: SYNODIC_DAYS,
    REF_NEW_MOON_UNIX: REF_NEW_MOON_UNIX,
    buildShareCard: buildShareCard, shareTextFromCard: shareTextFromCard,
    wrapText: wrapText, layoutShareCard: layoutShareCard,
    renderShareCard: renderShareCard, supportsFileShare: supportsFileShare,
    CARD_W: CARD_W, CARD_MAX_H: CARD_MAX_H, SHARE_URL: SHARE_URL,
    formatShortDate: formatShortDate, formatLongDate: formatLongDate
  };
}

/* ---------- browser app ---------- */
if (typeof document !== 'undefined') (function () {
  var themesData = null;
  var signData = null;
  var currentDate = new Date();
  var currentReading = null;

  function $(id) { return document.getElementById(id); }

  function embeddedJson(id) {
    var el = document.getElementById(id);
    if (!el) return null;
    try { return JSON.parse(el.textContent); } catch (e) { return null; }
  }

  function fetchJson(url) {
    try {
      if (typeof fetch !== 'function') return Promise.resolve(null);
      return fetch(url).then(function (r) { return r.json(); }).catch(function () { return null; });
    } catch (e) { return Promise.resolve(null); }
  }

  function loadContent() {
    return Promise.all([
      fetchJson('content/themes.json'),
      fetchJson('content/signs/pisces.json')
    ]).then(function (pair) {
      themesData = pair[0] || embeddedJson('embedded-themes');
      signData = pair[1] || embeddedJson('embedded-pisces');
      if (!themesData || !signData) throw new Error('content missing');
    });
  }

  function todayReading(date) {
    var theme = selectTheme(themesData.themes, date, SIGN_ID);
    var numbers = luckyNumbers(date, SIGN_ID);
    var moon = moonInfo(date.getTime());
    return { date: date, theme: theme, numbers: numbers, moon: moon };
  }

  function renderToday() {
    var r = currentReading;
    $('top-date').textContent = formatLongDate(r.date).toUpperCase();
    $('moon-chip-text').textContent = r.moon.phaseName + ' · ' + Math.round(r.moon.illumination * 100) + '% lit · approximate';
    $('theme-name').textContent = r.theme.name;
    $('hero-overall').textContent = r.theme.overall;
    $('tide-fill').style.width = (r.theme.tide / 5 * 100) + '%';
    $('tide-label').textContent = r.theme.tideLabel;
    $('tide-bar').setAttribute('aria-label', 'Cosmic Tide: ' + r.theme.tideLabel);
    $('block-love').textContent = r.theme.love;
    $('block-focus').textContent = r.theme.focus;
    $('block-mood').textContent = r.theme.mood;
    $('lucky-numbers').textContent = r.numbers.join('  ·  ');
    $('lucky-swatch').style.background = r.theme.luckyColorHex;
    $('lucky-color-name').textContent = r.theme.luckyColor;
    $('affirm-text').textContent = '\u201C' + r.theme.affirmation + '\u201D';
    var saved = loadSaved();
    var already = saved.some(function (s) { return s.date === localDateKey(r.date); });
    var btn = $('save-day-btn');
    btn.disabled = already;
    btn.textContent = already ? 'Saved for today' : 'Save this day';
  }

  function drawMoon(canvas, moon) {
    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    var size = canvas.width;
    ctx.clearRect(0, 0, size, size);
    drawMoonShape(ctx, size / 2, size / 2, size / 2 - 14, moon);
  }

  function renderMoon() {
    var m = currentReading.moon;
    drawMoon($('moon-canvas'), m);
    $('moon-phase-name').textContent = m.phaseName + ' · approximate';
    $('moon-illum').textContent = Math.round(m.illumination * 100) + '%';
    $('moon-age').textContent = (Math.round(m.age * 10) / 10) + '';
    $('moon-next-full').textContent = formatShortDate(m.nextFullDate) + ' · in ' + Math.round(m.daysToFull) + ' days';
    $('moon-next-new').textContent = formatShortDate(m.nextNewDate) + ' · in ' + Math.round(m.daysToNew) + ' days';
    $('moon-meaning').textContent = (signData.moonMeanings && signData.moonMeanings[m.phaseKey]) || '';
  }

  function traitItem(title, text) {
    return '<li><strong>' + escapeHtml(title) + '</strong> <span class="dim">— ' + escapeHtml(text) + '</span></li>';
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function renderSign() {
    var s = signData;
    $('sign-dates').textContent = s.dates;
    $('sign-element').textContent = s.element;
    $('sign-ruler').textContent = s.ruler;
    $('sign-symbol').textContent = s.symbol;
    $('strengths-list').innerHTML = s.strengths.map(function (x) { return traitItem(x.title, x.text); }).join('');
    $('shadows-list').innerHTML = s.shadows.map(function (x) { return traitItem(x.title, x.text); }).join('');
    $('needs-list').innerHTML = s.needs.map(function (x) { return '<li>' + escapeHtml(x) + '</li>'; }).join('');
    $('famous-list').innerHTML = s.famous.map(function (x) {
      return '<li><strong>' + escapeHtml(x.name) + '</strong> <span class="dim">· ' + escapeHtml(x.birthDate) + ' — ' + escapeHtml(x.text) + '</span></li>';
    }).join('');
    $('myth-text').textContent = s.myth;
    $('profile-read').textContent = s.profile.read;
  }

  function matchCard(name, data) {
    return '<article class="card match-card"><h3>' + escapeHtml(name) + '</h3><p>' + escapeHtml(data.read) + '</p><p class="match-why">' + escapeHtml(data.why) + '</p></article>';
  }

  function renderMatches() {
    var c = signData.compatibility;
    var best = ['Cancer', 'Scorpio', 'Taurus'];
    var tricky = ['Gemini', 'Sagittarius'];
    $('matches-best').innerHTML = '<div class="match-group-label">Best matches</div>' +
      best.map(function (n) { return matchCard(n, c[n.toLowerCase()]); }).join('');
    $('matches-tricky').innerHTML = '<div class="match-group-label">Tricky matches</div>' +
      tricky.map(function (n) { return matchCard(n, c[n.toLowerCase()]); }).join('');
  }

  function renderSaved() {
    var saved = loadSaved().slice().sort(function (a, b) { return b.date.localeCompare(a.date); });
    var box = $('saved-list');
    if (!saved.length) {
      box.innerHTML = '<p class="saved-empty">Nothing saved yet. Tap “Save this day” on the Today tab to keep a day exactly as it was.</p>';
      return;
    }
    box.innerHTML = '';
    saved.forEach(function (s, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'saved-item';
      b.innerHTML = '<span><strong>' + escapeHtml(s.themeName) + '</strong><small>' + escapeHtml(s.date) + ' · saved ' + escapeHtml(s.savedAt.slice(0, 10)) + '</small></span><span class="saved-moon">' + escapeHtml(s.moonPhaseName) + '</span>';
      b.addEventListener('click', function () { openSheet(i); });
      box.appendChild(b);
    });
  }

  function openSheet(index) {
    var saved = loadSaved().slice().sort(function (a, b) { return b.date.localeCompare(a.date); });
    var s = saved[index];
    if (!s) return;
    var body = $('sheet-body');
    body.innerHTML =
      '<div class="sheet-date">' + escapeHtml(s.date) + ' · as saved</div>' +
      '<h2>' + escapeHtml(s.themeName) + '</h2>' +
      '<p class="sheet-moon">' + escapeHtml(s.moonPhaseName) + ' · ' + escapeHtml(String(s.moonIllumination)) + '% lit · approximate · moon age ' + escapeHtml(String(s.moonAge)) + ' days</p>' +
      '<p class="sheet-moon">Next full moon (estimated): ' + escapeHtml(s.estimatedNextFullMoonDate) + ' · Next new moon (estimated): ' + escapeHtml(s.estimatedNextNewMoonDate) + '</p>' +
      '<article class="card"><div class="card-kicker">Horoscope</div><p>' + escapeHtml(s.overall) + '</p></article>' +
      '<article class="card"><div class="card-kicker">Love</div><p>' + escapeHtml(s.love) + '</p></article>' +
      '<article class="card"><div class="card-kicker">Focus</div><p>' + escapeHtml(s.focus) + '</p></article>' +
      '<article class="card"><div class="card-kicker">Theme mood</div><p>' + escapeHtml(s.mood) + '</p></article>' +
      '<article class="card"><div class="card-kicker">Cosmic Tide</div><p>' + escapeHtml(s.tideLabel) + '</p></article>' +
      '<article class="card"><div class="card-kicker">Lucky</div><p>' + escapeHtml(s.luckyNumbers.join(' · ')) + ' · ' + escapeHtml(s.luckyColor) + '</p></article>' +
      '<article class="card affirm"><div class="card-kicker">Affirmation</div><p style="font-family: Georgia, serif; font-size: 20px;">\u201C' + escapeHtml(s.affirmation) + '\u201D</p></article>' +
      '<button class="share-btn sheet-share" id="sheet-share-btn" type="button">Share this day</button>' +
      '<button class="save-btn sheet-delete" id="sheet-delete-btn" type="button">Delete this saved day</button>';
    $('sheet').hidden = false;
    $('sheet-backdrop').hidden = false;
    $('sheet-share-btn').addEventListener('click', function () {
      var card = buildShareCard('saved', { snapshot: s });
      if (card) shareCard(card, 'deep-current-saved-' + s.date);
    });
    $('sheet-delete-btn').addEventListener('click', function () {
      var all = loadSaved();
      var keep = all.filter(function (x) { return !(x.date === s.date && x.savedAt === s.savedAt); });
      storeSaved(keep);
      closeSheet();
      renderSaved();
      toast('Saved day deleted.');
    });
  }

  function closeSheet() {
    $('sheet').hidden = true;
    $('sheet-backdrop').hidden = true;
  }

  var toastTimer = null;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 2600);
  }

  function copyText(text, okMsg) {
    function done() { toast(okMsg); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
    } else { fallbackCopy(text); done(); }
  }

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) { /* noop */ }
    document.body.removeChild(ta);
  }

  /* ---------- share ---------- */
  function downloadBlob(blob, name) {
    try {
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1500);
    } catch (e) { /* download unavailable; text copy still happens below */ }
  }

  function downloadDataUrl(dataUrl, name) {
    var a = document.createElement('a');
    a.href = dataUrl;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  /* Share one card. Native share sheet with the PNG when the device can
   * take files (iPhone Safari does); otherwise save the PNG and copy the
   * text so the user can post it to Facebook themselves. The app never
   * posts anywhere on its own. */
  function shareCard(card, fileBase) {
    var canvas = document.createElement('canvas');
    var dataUrl;
    try { dataUrl = renderShareCard(canvas, card); }
    catch (e) { toast('Sharing is not available right now.'); return; }
    var fileName = fileBase + '.png';
    function fallback(blob) {
      if (blob) downloadBlob(blob, fileName);
      else downloadDataUrl(dataUrl, fileName);
      copyText(card.shareText, 'Image saved — text copied. Post it to Facebook yourself.');
    }
    function withBlob(fn) {
      if (canvas.toBlob) { canvas.toBlob(function (b) { fn(b); }, 'image/png'); }
      else fn(null);
    }
    if (supportsFileShare(navigator)) {
      withBlob(function (blob) {
        if (!blob) { fallback(null); return; }
        var file;
        try { file = new File([blob], fileName, { type: 'image/png' }); }
        catch (e) { fallback(blob); return; }
        var p;
        try { p = navigator.share({ title: 'Deep Current — Pisces', text: card.shareText, files: [file] }); }
        catch (e) { fallback(blob); return; }
        if (p && p.then) {
          p.then(function () { toast('Shared.'); }, function (err) {
            if (err && err.name === 'AbortError') return; // user dismissed the sheet
            fallback(blob);
          });
        }
      });
    } else {
      withBlob(function (blob) { fallback(blob); });
    }
  }

  function shareFileName(kind) {
    return 'deep-current-' + kind + '-' + localDateKey(currentDate);
  }

  function shareTab(kind) {
    var card = null;
    if (kind === 'today') {
      card = buildShareCard('today', { date: currentReading.date, theme: currentReading.theme, numbers: currentReading.numbers, moon: currentReading.moon });
    } else if (kind === 'moon') {
      card = buildShareCard('moon', { date: currentReading.date, moon: currentReading.moon, meaning: signData.moonMeanings[currentReading.moon.phaseKey] });
    } else if (kind === 'pisces') {
      card = buildShareCard('pisces', { sign: signData });
    } else if (kind === 'matches') {
      card = buildShareCard('matches', { sign: signData });
    } else if (kind === 'you') {
      card = buildShareCard('you', { date: currentReading.date, profileRead: signData.profile.read, saved: loadSaved() });
    }
    if (!card) return;
    shareCard(card, shareFileName(kind));
  }

  function switchTab(name) {
    var tabs = ['today', 'moon', 'pisces', 'matches', 'you'];
    tabs.forEach(function (t) {
      $('tab-' + t).hidden = (t !== name);
      var btn = document.querySelector('.tab-btn[data-tab="' + t + '"]');
      btn.classList.toggle('is-active', t === name);
      btn.setAttribute('aria-selected', t === name ? 'true' : 'false');
    });
    if (name === 'moon') renderMoon();
    if (name === 'you') renderSaved();
    window.scrollTo({ top: 0 });
  }

  function renderAll() {
    currentReading = todayReading(currentDate);
    renderToday();
    renderMoon();
    renderSign();
    renderMatches();
    renderSaved();
  }

  /* midnight refresh: startup, foreground/resume, timer while open.
     No background execution is promised. */
  function checkDateRoll() {
    if (localDateKey(new Date()) !== localDateKey(currentDate)) {
      currentDate = new Date();
      renderAll();
      toast('A new day — fresh reading.');
    }
  }

  /* starfield */
  function initStars() {
    var canvas = $('stars');
    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var stars = [];
    var w, h;
    function size() {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
      stars = [];
      var count = Math.min(90, Math.floor(w * h / 16000));
      for (var i = 0; i < count; i++) {
        stars.push({
          x: Math.random() * w, y: Math.random() * h,
          r: Math.random() * 1.3 + 0.3,
          a: Math.random() * 0.5 + 0.15,
          s: (Math.random() - 0.5) * 0.12
        });
      }
    }
    function draw() {
      ctx.clearRect(0, 0, w, h);
      stars.forEach(function (st) {
        ctx.globalAlpha = st.a;
        ctx.fillStyle = '#CFE9FF';
        ctx.beginPath();
        ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
    }
    function tick() {
      if (!reduced) {
        stars.forEach(function (st) {
          st.x += st.s;
          if (st.x < -2) st.x = w + 2;
          if (st.x > w + 2) st.x = -2;
        });
      }
      draw();
      if (!reduced) requestAnimationFrame(tick);
    }
    size();
    window.addEventListener('resize', size);
    draw();
    if (!reduced) requestAnimationFrame(tick);
  }

  function init() {
    loadContent().then(function () {
      renderAll();
      document.querySelectorAll('.tab-btn').forEach(function (btn) {
        btn.addEventListener('click', function () { switchTab(btn.getAttribute('data-tab')); });
      });
      $('moon-chip').addEventListener('click', function () { switchTab('moon'); });
      $('affirm-text').addEventListener('click', function () {
        copyText(currentReading.theme.affirmation, 'Affirmation copied.');
      });
      $('save-day-btn').addEventListener('click', function () {
        var saved = loadSaved();
        var key = localDateKey(currentReading.date);
        if (saved.some(function (s) { return s.date === key; })) { toast('Already saved.'); return; }
        var snap = buildSnapshot(currentReading.date, currentReading.theme, currentReading.numbers, currentReading.moon, themesData.contentVersion || CONTENT_VERSION);
        saved.push(snap);
        storeSaved(saved);
        renderToday();
        renderSaved();
        toast('Day saved — frozen as it is.');
      });
      $('share-today-btn').addEventListener('click', function () { shareTab('today'); });
      $('share-moon-btn').addEventListener('click', function () { shareTab('moon'); });
      $('share-pisces-btn').addEventListener('click', function () { shareTab('pisces'); });
      $('share-matches-btn').addEventListener('click', function () { shareTab('matches'); });
      $('share-you-btn').addEventListener('click', function () { shareTab('you'); });
      $('clear-saved-btn').addEventListener('click', function () {
        storeSaved([]);
        renderSaved();
        toast('Saved days cleared.');
      });
      $('sheet-close').addEventListener('click', closeSheet);
      $('sheet-backdrop').addEventListener('click', closeSheet);
      document.addEventListener('visibilitychange', function () { if (!document.hidden) checkDateRoll(); });
      window.addEventListener('pageshow', checkDateRoll);
      window.addEventListener('focus', checkDateRoll);
      setInterval(checkDateRoll, 30000);
      initStars();
    }).catch(function () {
      document.body.innerHTML = '<main style="max-width:560px;margin:0 auto;padding:60px 20px;color:#F3F1FA;font-family:sans-serif;"><h1 style="font-family:Georgia,serif;">Deep Current</h1><p>Could not load the daily content. Check your connection and reopen the app — everything runs on your device once it loads.</p></main>';
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }
})();
