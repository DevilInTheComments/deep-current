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

/* ---------- exports for node tests ---------- */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    hash32: hash32, mulberry32: mulberry32, localDateKey: localDateKey,
    compactDateKey: compactDateKey, selectTheme: selectTheme,
    luckyNumbers: luckyNumbers, moonInfo: moonInfo, PHASES: PHASES,
    buildSnapshot: buildSnapshot, SYNODIC_DAYS: SYNODIC_DAYS,
    REF_NEW_MOON_UNIX: REF_NEW_MOON_UNIX
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
    var cx = size / 2, cy = size / 2, R = size / 2 - 14;
    ctx.clearRect(0, 0, size, size);
    // dark disc
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fillStyle = '#101024';
    ctx.fill();
    // lit region: outer arc on lit side + elliptical terminator
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
    // soft limb
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(165, 243, 252, 0.25)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
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
      '<button class="save-btn sheet-delete" id="sheet-delete-btn" type="button">Delete this saved day</button>';
    $('sheet').hidden = false;
    $('sheet-backdrop').hidden = false;
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
