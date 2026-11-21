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

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
