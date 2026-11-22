/* Deep Current — node tests. Run: node tests/test.js
 * Covers: moon math vs known events, seeded theme stability, lucky-number
 * rules, snapshot shape + immutability.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const app = require('../app.js');

const themes = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'content', 'themes.json'), 'utf8'));
const pisces = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'content', 'signs', 'pisces.json'), 'utf8'));

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (extra !== undefined ? ' — ' + extra : '')); }
}
function approx(a, b, tol) { return Math.abs(a - b) <= tol; }

console.log('== moon math ==');
// Known events (UTC):
// 2025-01-13 ~22:27 full moon; 2025-01-29 ~12:36 new moon; 2025-02-05 ~08:02 first quarter.
let m = app.moonInfo(Date.parse('2025-01-13T22:27:00Z'));
check('2025-01-13 full moon: phase full', m.phaseKey === 'full', m.phaseKey);
check('2025-01-13 full moon: illumination ~1', approx(m.illumination, 1, 0.03), m.illumination.toFixed(3));
m = app.moonInfo(Date.parse('2025-01-29T12:36:00Z'));
check('2025-01-29 new moon: phase new', m.phaseKey === 'new', m.phaseKey);
check('2025-01-29 new moon: illumination ~0', approx(m.illumination, 0, 0.03), m.illumination.toFixed(3));
m = app.moonInfo(Date.parse('2025-02-05T08:02:00Z'));
check('2025-02-05 first quarter: phase first-quarter', m.phaseKey === 'first-quarter', m.phaseKey);
check('2025-02-05 first quarter: illumination ~0.5', approx(m.illumination, 0.5, 0.08), m.illumination.toFixed(3));
// Nov 2026 full moon is Nov 24, 2026. From Nov 21 the estimate should land ~Nov 24.
m = app.moonInfo(Date.parse('2026-11-21T12:00:00Z'));
check('2026-11-21 waxing gibbous', m.phaseKey === 'waxing-gibbous', m.phaseKey);
check('2026-11-21 illumination high (waxing gibbous)', m.illumination > 0.8, m.illumination.toFixed(3));
const nextFull = m.nextFullDate.toISOString().slice(0, 10);
check('2026-11-21 next full moon ~Nov 24', nextFull === '2026-11-24' || nextFull === '2026-11-23' || nextFull === '2026-11-25', nextFull);
m = app.moonInfo(Date.parse('2026-11-24T12:00:00Z'));
check('2026-11-24 full moon: illumination >0.95', m.illumination > 0.95, m.illumination.toFixed(3));
check('2026-11-24 full moon: phase full', m.phaseKey === 'full', m.phaseKey);
// Sanity across a year: age/illumination always in range, phase always valid.
let bad = 0;
for (let d = 0; d < 365; d++) {
  const mm = app.moonInfo(Date.parse('2026-01-01T00:00:00Z') + d * 86400000);
  if (!(mm.age >= 0 && mm.age < app.SYNODIC_DAYS) || !(mm.illumination >= 0 && mm.illumination <= 1)) bad++;
  if (!app.PHASES.some(p => p.key === mm.phaseKey)) bad++;
}
check('365-day sweep: age/illumination/phase always valid', bad === 0, bad + ' bad');
m = app.moonInfo(Date.parse('2026-03-01T12:00:00Z'));
check('waxing flag matches angle (<180)', (m.angleDeg < 180) === m.waxing);

console.log('== seeded selection ==');
const d1 = new Date(2026, 10, 21);
const t1a = app.selectTheme(themes.themes, d1, 'pisces');
const t1b = app.selectTheme(themes.themes, d1, 'pisces');
check('same date -> same theme', t1a.id === t1b.id);
const seen = new Set();
for (let d = 0; d < 365; d++) {
  seen.add(app.selectTheme(themes.themes, new Date(2026, 0, 1 + d), 'pisces').id);
}
check('all 30 themes reachable across a year', seen.size === 30, seen.size + ' seen');
const n1 = app.luckyNumbers(d1, 'pisces');
const n2 = app.luckyNumbers(d1, 'pisces');
check('lucky numbers stable same day', JSON.stringify(n1) === JSON.stringify(n2));
check('lucky numbers: 3 unique, 1-99', n1.length === 3 && new Set(n1).size === 3 && n1.every(n => n >= 1 && n <= 99), JSON.stringify(n1));
let diffDays = 0;
for (let d = 0; d < 30; d++) {
  if (JSON.stringify(app.luckyNumbers(new Date(2026, 0, 1 + d), 'pisces')) !== JSON.stringify(n1)) diffDays++;
}
check('lucky numbers vary across days', diffDays > 20, diffDays + '/30 differ');

console.log('== snapshot ==');
const theme = themes.themes[0];
const moon = app.moonInfo(Date.parse('2026-11-21T12:00:00Z'));
const snap = app.buildSnapshot(new Date(2026, 10, 21), theme, [7, 14, 21], moon, themes.contentVersion);
const required = ['date', 'signId', 'contentVersion', 'savedAt', 'themeId', 'themeName',
  'overall', 'love', 'focus', 'affirmation', 'mood', 'tide', 'tideLabel',
  'luckyNumbers', 'luckyColor', 'moonPhase', 'moonPhaseName', 'moonIllumination',
  'moonAge', 'estimatedNextFullMoonDate', 'estimatedNextNewMoonDate'];
check('snapshot has every v3 field', required.every(k => k in snap), required.filter(k => !(k in snap)).join(','));
check('snapshot date/sign/version', snap.date === '2026-11-21' && snap.signId === 'pisces' && snap.contentVersion === 1);
// Immutability: mutate the source theme after snapshotting; snapshot must not change.
const before = JSON.stringify(snap);
theme.overall = 'CHANGED BY CONTENT UPDATE';
theme.love = 'CHANGED BY CONTENT UPDATE';
check('snapshot frozen after content-bank edit', JSON.stringify(snap) === before);
check('snapshot lucky numbers copied, not referenced', snap.luckyNumbers.join() === '7,14,21');

console.log('== content shape ==');
check('themes.json: 30 themes', themes.themes.length === 30);
check('themes.json: unique ids', new Set(themes.themes.map(t => t.id)).size === 30);
check('pisces.json: 8 famous, all in Feb 19-Mar 20', pisces.famous.length === 8 &&
  pisces.famous.every(f => {
    const md = f.birthDate.slice(5);
    return (md >= '02-19' && md <= '02-29') || (md >= '03-01' && md <= '03-20');
  }));
check('pisces.json: 8 moon meanings', Object.keys(pisces.moonMeanings).length === 8);
check('pisces.json: 5 compatibility entries', Object.keys(pisces.compatibility).length === 5);

console.log('== share ==');
// Fake canvas: records draw calls, measures text proportionally, and
// returns a real 1x1 PNG data URL — the same contract renderShareCard
// must satisfy in the browser (a data:image/png;base64 URL whose bytes
// start with the PNG signature).
const ONE_PX_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
function fakeCanvas() {
  const calls = [];
  const grad = { addColorStop() {} };
  const ctx = {
    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: 'left', textBaseline: 'alphabetic', globalAlpha: 1,
    fillRect() {}, strokeRect() {}, clearRect() {}, beginPath() {}, closePath() {},
    arc() {}, ellipse() {}, arcTo() {}, moveTo() {}, lineTo() {}, fill() {}, stroke() {},
    save() {}, restore() {}, translate() {},
    createRadialGradient() { return grad; },
    createLinearGradient() { return grad; },
    fillText(t) { calls.push(String(t)); },
    measureText(t) { return { width: String(t).length * 14 }; }
  };
  return {
    canvas: {
      width: 0, height: 0,
      getContext() { return ctx; },
      toDataURL() { return ONE_PX_PNG; }
    },
    ctx, calls
  };
}
const shareTheme = themes.themes[1]; // index 0 was mutated by the snapshot tests
const shareMoon = app.moonInfo(Date.parse('2026-11-22T12:00:00Z'));
const shareDate = new Date(2026, 10, 22);

let card = app.buildShareCard('today', { date: shareDate, theme: shareTheme, numbers: [14, 56, 97], moon: shareMoon });
check('today card: heading is theme name', card.heading === shareTheme.name, card.heading);
check('today card: share text has theme + tide label, no %', card.shareText.includes(shareTheme.name) && card.shareText.includes('Cosmic Tide') && card.shareText.includes(shareTheme.tideLabel) && !card.shareText.includes('%'), card.shareText.slice(0, 80));
check('today card: share text has date + app URL', card.shareText.includes('November 22, 2026') && card.shareText.includes(app.SHARE_URL), card.shareText.slice(0, 120));
check('today card: share text has birthday', card.shareText.includes('Born March 1, 1988'), card.shareText.slice(0, 120));
check('today card: lucky block present', card.blocks.some(b => b.label === 'Lucky' && b.text.includes('14 · 56 · 97')));

card = app.buildShareCard('moon', { date: shareDate, moon: shareMoon, meaning: pisces.moonMeanings[shareMoon.phaseKey] });
check('moon card: heading is phase name', card.heading === 'Waxing Gibbous', card.heading);
check('moon card: next full moon Nov 24 in text', card.shareText.includes('Nov 24') && card.shareText.includes('Next full moon'), card.shareText.slice(0, 200));
check('moon card: meaning included', card.shareText.includes('refining') || card.shareText.includes('stretch before the peak'), card.shareText.slice(0, 300));
check('moon card: carries moon object for the disc', card.moon && card.moon.phaseKey === 'waxing-gibbous');

card = app.buildShareCard('pisces', { sign: pisces });
check('pisces card: sign facts + a strength', card.shareText.includes('Neptune') && card.shareText.includes('Water') && card.shareText.includes('Compassionate') && card.shareText.includes('The Two Fish'));
check('pisces card: all six strengths as blocks', card.blocks.filter(b => pisces.strengths.some(s => s.title === b.label)).length === 6);

card = app.buildShareCard('matches', { sign: pisces });
check('matches card: best three present', ['Cancer', 'Scorpio', 'Taurus'].every(n => card.shareText.includes(n)));
check('matches card: prose-only, no % anywhere', !card.shareText.includes('%'), card.shareText);
check('matches card: why lines included', card.shareText.includes('trust builds fast and deep') && card.shareText.includes('recognize each other instantly'));

const snap2 = app.buildSnapshot(new Date(2026, 10, 21), shareTheme, [7, 14, 21], shareMoon, themes.contentVersion);
card = app.buildShareCard('you', { date: shareDate, profileRead: pisces.profile.read, saved: [snap2] });
check('you card: sign line + profile read', card.shareText.includes('March 1, 1988') && card.shareText.includes('Born on March 1'));
check('you card: saved day listed', card.shareText.includes(snap2.themeName) && card.shareText.includes('2026-11-21'));
card = app.buildShareCard('you', { date: shareDate, profileRead: pisces.profile.read, saved: [] });
check('you card: empty saved list says so', card.shareText.includes('No days saved yet'));

card = app.buildShareCard('saved', { snapshot: snap2 });
check('saved card: frozen theme + reading', card.heading === snap2.themeName && card.shareText.includes(snap2.overall) && card.shareText.includes(snap2.love));
check('saved card: date line is the frozen date', card.dateLine.includes('2026-11-21') && card.dateLine.includes('as saved'));
// Freeze: mutate the source theme after snapshotting; the saved card must not change.
shareTheme.overall = 'CHANGED AFTER SAVE';
shareTheme.love = 'CHANGED AFTER SAVE';
card = app.buildShareCard('saved', { snapshot: snap2 });
check('saved card: still frozen after content-bank edit', card.shareText.includes('CHANGED AFTER SAVE') === false && card.shareText.includes(snap2.overall));
check('unknown share kind -> null', app.buildShareCard('nope', {}) === null);

check('wrapText: long text wraps within width', (() => {
  const lines = app.wrapText(t => t.length * 14, 'one two three four five six seven eight nine ten eleven twelve', 100);
  return lines.length > 1 && lines.every(l => l.length * 14 <= 100);
})());
check('wrapText: empty text -> no lines with content', app.wrapText(t => t.length * 14, '', 100).every(l => l === ''));

const bigCard = app.buildShareCard('matches', { sign: pisces });
bigCard.blocks = Array.from({ length: 40 }, (_, i) => ({ label: 'Block ' + i, text: 'Some long reading text that keeps going and going for a while. '.repeat(4) }));
const laid = app.layoutShareCard((t) => t.length * 14, bigCard, 1080);
check('layout: oversized card capped at CARD_MAX_H', laid.height <= app.CARD_MAX_H, laid.height);
const smallLaid = app.layoutShareCard((t) => t.length * 14, app.buildShareCard('today', { date: shareDate, theme: themes.themes[2], numbers: [1, 2, 3], moon: shareMoon }), 1080);
check('layout: normal card under the cap, height > 0', smallLaid.height > 0 && smallLaid.height <= app.CARD_MAX_H, smallLaid.height);

const fc = fakeCanvas();
const todayCard = app.buildShareCard('today', { date: shareDate, theme: themes.themes[3], numbers: [5, 9, 12], moon: shareMoon });
const png = app.renderShareCard(fc.canvas, todayCard);
check('render: returns a PNG data URL', png.startsWith('data:image/png;base64,'), png.slice(0, 40));
const pngBytes = Buffer.from(png.split(',')[1], 'base64');
check('render: bytes start with the PNG signature', pngBytes[0] === 0x89 && pngBytes[1] === 0x50 && pngBytes[2] === 0x4E && pngBytes[3] === 0x47);
check('render: canvas sized 1080 wide, height in range', fc.canvas.width === 1080 && fc.canvas.height > 0 && fc.canvas.height <= app.CARD_MAX_H, fc.canvas.width + 'x' + fc.canvas.height);
check('render: drew the heading and a block label', fc.calls.includes(todayCard.heading) && fc.calls.includes('HOROSCOPE'), fc.calls.slice(0, 6).join(' | '));
const fcMoon = fakeCanvas();
app.renderShareCard(fcMoon.canvas, app.buildShareCard('moon', { date: shareDate, moon: shareMoon, meaning: 'x' }));
check('render: moon card drew the phase heading', fcMoon.calls.includes('Waxing Gibbous'));

check('supportsFileShare: no navigator -> false', app.supportsFileShare(null) === false && app.supportsFileShare({}) === false);
check('supportsFileShare: share without canShare -> true', app.supportsFileShare({ share() {} }) === true);
check('supportsFileShare: canShare false -> false', app.supportsFileShare({ share() {}, canShare: () => false }) === false);
check('supportsFileShare: canShare true -> true', app.supportsFileShare({ share() {}, canShare: () => true }) === true);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
