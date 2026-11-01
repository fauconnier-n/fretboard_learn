// @ts-check
// Stats tab: mastery heatmap, level, per-note bars, weakest positions and zones.

import { noteName, pcOf, spellingsOf, spellName, stringName } from './music.js';
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
    // density rises fast: a well-practised position is a solid band of colour
    return { cloud: { w: 0.5 + 0.55 * t, h: 0.8 + 0.25 * t, core: t }, fill: masteryColor(m), opacity: Math.min(0.85, 0.2 + 0.95 * t), label, tip: positionTip(scheduler, s, f, label) };
  }
  if (scheduler.isReachable(s, f, snap)) return { stroke: PALETTE.steel, dash: '3 3', label, faint: true, tip: `${label} · fret ${f}\nNot played yet` };
  return null;
}

// The popup of a position over all runs on this instrument and tuning: how often it was asked,
// right answers, usual time, and its known / fast / automatic levels.
export function positionTip(scheduler, s, f, label) {
  const key = s + ':' + f;
  const keys = spellingsOf(pcOf(scheduler.strings[s] + f)).map((sp) => (sp === 'n' ? key : key + ':' + sp)).filter((k) => scheduler.model.cards[k]);
  if (!keys.length) return `${label} · fret ${f}\nNot played yet`;
  const cards = keys.map((k) => scheduler.model.cards[k]);
  const seen = cards.reduce((t, c) => t + c.seen, 0);
  const acc = seen ? cards.reduce((t, c) => t + c.acc * c.seen, 0) / seen : 0;
  const bars = scheduler.noteRings(keys[0]);
  return `${label} · fret ${f} · all runs\nAsked ${seen}× · ${pct(acc)} right · usually ${(scheduler.expectedMs(keys[0]) / 1000).toFixed(1)} s\n` +
    `Known ${pct(bars.known)} · fast ${pct(bars.fast)} · automatic ${pct(bars.auto)}`;
}

// Every note name (e.g. "C#") split by octave (C#2, C#3…): right answers and expected time of
// the positions of that name in each octave, from the memory cards, in one pass over the cards.
export function octaveRowsAll(scheduler, now = Date.now()) {
  const byName = new Map(); // name -> Map(octave -> totals)
  for (const [key, c] of Object.entries(scheduler.model.cards)) {
    const [s, f, sp = 'n'] = key.split(':');
    if (sp === 'r' || scheduler.strings[+s] == null) continue;
    const midi = scheduler.strings[+s] + +f;
    const name = spellName(midi, sp);
    const oct = Math.floor(midi / 12) - 1;
    let rows = byName.get(name);
    if (!rows) byName.set(name, (rows = new Map()));
    const r = rows.get(oct) || { oct, seen: 0, acc: 0, ms: [], positions: 0 };
    r.seen += c.seen;
    r.acc += c.acc * c.seen;
    r.positions++;
    if (c.time?.n) r.ms.push(scheduler.expectedMs(key, now));
    rows.set(oct, r);
  }
  const out = new Map();
  for (const [name, rows] of byName) {
    out.set(name, [...rows.values()].sort((a, b) => a.oct - b.oct)
      .map((r) => ({ label: name + r.oct, acc: r.seen ? r.acc / r.seen : 0, ms: r.ms.length ? r.ms.reduce((a, b) => a + b, 0) / r.ms.length : null, positions: r.positions, seen: r.seen })));
  }
  return out;
}

export const octaveRows = (scheduler, name, now = Date.now()) => octaveRowsAll(scheduler, now).get(name) || [];

export function renderStats({ els, scheduler, strings, frets, flats, heat, attemptCount, extraCards = [] }) {
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

  // A# and Bb are tracked as separate names; each opens to show its octaves
  const names = Array.from({ length: 12 }, (_, pc) => spellingsOf(pc).map((sp) => spellName(pc, sp))).flat();
  const bar = (label, acc, time, known) => `<b>${label}</b>
      <div class="ntrack"><div class="nfill" style="width:${known ? acc * 100 : 0}%;background:${masteryColor(acc)}"></div></div>
      <span>${known ? pct(acc) : '—'}</span><span class="muted">${time}</span>`;
  const octaves = octaveRowsAll(scheduler, now);
  els.notes.innerHTML = names.map((name) => {
    const n = model.notes[name];
    const octs = octaves.get(name) || [];
    const head = bar(name, n ? n.acc : 0, n?.time?.n ? secs(Math.exp(n.time.mu)) : '', !!n);
    if (!octs.length) return `<div class="nbar">${head}</div>`;
    return `<details class="nnote"><summary class="nbar">${head}</summary>${octs.map((o) => `<div class="nbar noct" title="${o.positions} position${o.positions > 1 ? 's' : ''} · ${o.seen} answer${o.seen > 1 ? 's' : ''}">${bar(o.label, o.acc, o.ms == null ? '' : secs(o.ms), true)}</div>`).join('')}</details>`;
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
}
