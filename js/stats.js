// @ts-check
// Stats tab: mastery heatmap, level, per-note bars, weakest positions and zones.

import { noteName, pcOf, spellingsOf, spellName, stringName } from './music.js';
import { zoneLabel } from './zones.js';
import { retrievability } from './srs.js';
import { PALETTE, masteryColor } from './palette.js';

const pct = (x) => Math.round(x * 100) + '%';
const secs = (ms) => (ms == null ? '—' : (ms / 1000).toFixed(2) + ' s');

// One position on a knowledge map (the Stats page, and the practice board between runs):
// a soft cloud coloured by mastery, red → orange → yellow → green like the note bars, bigger
// (mostly along the string) and denser the more often it was asked, with its note name; a
// dashed ring and a pale name when unlocked but not played yet; nothing when still locked.
export function mapCell(scheduler, snap, s, f, flats) {
  const midi = scheduler.strings[s] + f;
  const label = noteName(midi, flats);
  const m = snap.mastery.get(s + ':' + f);
  if (m !== undefined) {
    const key = s + ':' + f;
    const asked = spellingsOf(pcOf(midi)).reduce((t, sp) => t + (scheduler.model.cards[sp === 'n' ? key : key + ':' + sp]?.seen || 0), 0);
    const t = Math.min(1, Math.log2(1 + asked) / Math.log2(41)); // 40 questions or more: full size
    return { cloud: { w: 0.5 + 0.55 * t, h: 0.8 + 0.25 * t }, fill: masteryColor(m), opacity: 0.22 + 0.78 * t, label };
  }
  if (scheduler.isReachable(s, f, snap)) return { stroke: PALETTE.steel, dash: '3 3', label, faint: true };
  return null;
}

export function renderStats({ els, scheduler, zones, strings, frets, flats, heat, attemptCount, extraCards = [] }) {
  const now = Date.now();
  const snap = scheduler.snapshot(now);
  const model = scheduler.model;
  const total = strings.length * (frets + 1);
  let seen = 0;
  let mastered = 0;
  let reachable = 0;

  let fading = 0;
  heat.setHeat((s, f) => {
    const m = snap.mastery.get(s + ':' + f);
    if (m !== undefined) {
      seen++;
      reachable++;
      const pc = ((strings[s] + f) % 12 + 12) % 12;
      const cell = { s, f, pc, key: s + ':' + f };
      const keys = spellingsOf(pc).map((sp) => (sp === 'n' ? cell.key : cell.key + ':' + sp));
      // fading: memory of a spelling you have played dropped below 85%
      const fade = keys.some((k) => model.cards[k] && retrievability(model.cards[k], now) < 0.85);
      // mastered: right and fast on two separate days, and still strong
      const done = scheduler.positionMastered(cell, now);
      if (done) mastered++;
      if (fade) fading++;
    } else if (scheduler.isReachable(s, f, snap)) reachable++;
    return mapCell(scheduler, snap, s, f, flats);
  });

  const cards = [
    ['Positions practised', `${seen} / ${total}`],
    ['Mastered (2+ days)', mastered],
    ['Fading, due for review', fading],
    ['Unlocked area', pct(reachable / total)],
    ['Target success rate', pct(model.meta.target)],
    ['Typical answer time', model.meta.time?.n ? secs(Math.exp(model.meta.time.mu)) : '—'],
    ['Your fast end (speed scale)', model.meta.time?.n ? secs(scheduler.floorMs()) : '—'],
    ['Runs', model.meta.runsDone],
    ['Answers logged', attemptCount],
    ...extraCards,
  ];
  els.cards.innerHTML = cards.map(([k, v]) => `<div class="stat"><b>${v}</b><span>${k}</span></div>`).join('');

  // A# and Bb are tracked as separate names
  const names = Array.from({ length: 12 }, (_, pc) => spellingsOf(pc).map((sp) => spellName(pc, sp))).flat();
  els.notes.innerHTML = names.map((name) => {
    const n = model.notes[name];
    const acc = n ? n.acc : 0;
    return `<div class="nbar"><b>${name}</b>
      <div class="ntrack"><div class="nfill" style="width:${n ? acc * 100 : 0}%;background:${masteryColor(acc)}"></div></div>
      <span>${n ? pct(acc) : '—'}</span><span class="muted">${n?.time?.n ? secs(Math.exp(n.time.mu)) : ''}</span></div>`;
  }).join('');

  // memory and speed are separate signals: weakest = forgotten most, slowest = longest expected time
  const item = (key, extra) => {
    const [s, f, sp = 'n'] = key.split(':');
    return `<li><b>${spellName(strings[s] + +f, sp)}</b> ${stringName(strings, +s, flats)} string, fret ${f}
      <span class="muted">· ${extra}</span></li>`;
  };
  const keys = [...snap.items.keys()];
  els.cells.innerHTML = [...snap.items.entries()].sort((a, b) => a[1] - b[1]).slice(0, 10).map(([key, m]) => {
    const c = model.cards[key];
    return item(key, `${pct(m)} · ${pct(c.acc)} right · ${secs(scheduler.expectedMs(key, now))} · ${c.lapses} miss`);
  }).join('') || '<li class="muted">Play a run first.</li>';
  els.slow.innerHTML = keys.filter((k) => model.cards[k].time?.n)
    .map((k) => ({ k, ms: scheduler.expectedMs(k, now) }))
    .sort((a, b) => b.ms - a.ms).slice(0, 10)
    .map(({ k, ms }) => {
      // a large spread means the note is sometimes still worked out rather than recalled
      const sd = scheduler.spread(k);
      const spread = sd == null ? '' : sd > 0.45 ? ' · <b class="down">erratic</b>' : ' · steady';
      return item(k, `${secs(ms)} expected · ${model.cards[k].time.n} right answer${model.cards[k].time.n > 1 ? 's' : ''}${spread}`);
    })
    .join('') || '<li class="muted">Play a run first.</li>';

  const unlocked = zones.filter((z) => scheduler.isUnlocked(z, snap))
    .map((z) => ({ z, P: scheduler.zonePredicted(z, snap, now) }))
    .sort((a, b) => a.P - b.P)
    .slice(0, 6);
  els.zones.innerHTML = unlocked.map(({ z, P }) => `<li>${zoneLabel(z, strings, flats)} <span class="muted">· ${pct(P)} predicted</span></li>`).join('')
    || '<li class="muted">—</li>';

  els.runs.innerHTML = [...model.meta.recent].reverse().slice(0, 10).map((r) => {
    const d = new Date(r.t);
    return `<li><b>${pct(r.acc)}</b> · median ${r.med >= 99999 ? '—' : secs(r.med)}${r.review ? ' · review' : ''}
      <span class="muted">${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></li>`;
  }).join('') || '<li class="muted">No runs yet.</li>';
}
