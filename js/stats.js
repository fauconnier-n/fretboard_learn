// @ts-check
// Stats tab: mastery heatmap, level, per-note bars, weakest positions and zones.

import { noteName, pcOf, spellingsOf, spellName, stringName } from './music.js';
import { retrievability } from './srs.js';
import { PALETTE, masteryColor } from './palette.js';

const pct = (x) => Math.round(x * 100) + '%';
const secs = (ms) => (ms == null ? '—' : (ms / 1000).toFixed(2) + ' s');

// One position on a knowledge map (the Stats page, and the practice board between runs):
// like after a run, its name and three bars (known, fast, automatic) over all runs; a dashed
// ring and a pale name when unlocked but not played yet; nothing when still locked.
export function mapCell(scheduler, snap, s, f, flats) {
  const midi = scheduler.strings[s] + f;
  const label = noteName(midi, flats);
  if (snap.mastery.has(s + ':' + f)) {
    const key = s + ':' + f;
    // the spelling played most stands for the position
    const keys = spellingsOf(pcOf(midi)).map((sp) => (sp === 'n' ? key : key + ':' + sp)).filter((k) => scheduler.model.cards[k]);
    const most = keys.sort((a, b) => scheduler.model.cards[b].seen - scheduler.model.cards[a].seen)[0] ?? key;
    return { bars: scheduler.noteRings(most), label, tip: positionTip(scheduler, s, f, label) };
  }
  if (scheduler.isReachable(s, f, snap)) return { stroke: PALETTE.steel, dash: '3 3', label, faint: true, tip: `${label} · fret ${f}\nNot played yet` };
  return null;
}

// The popup of a position over all runs on this instrument and tuning.
export function positionTip(scheduler, s, f, label) {
  const key = s + ':' + f;
  const keys = spellingsOf(pcOf(scheduler.strings[s] + f)).map((sp) => (sp === 'n' ? key : key + ':' + sp)).filter((k) => scheduler.model.cards[k]);
  if (!keys.length) return `${label} · fret ${f}\nNot played yet`;
  const most = keys.sort((a, b) => scheduler.model.cards[b].seen - scheduler.model.cards[a].seen)[0];
  return { html: detailHtml(scheduler, most, { note: `${label} · fret ${f}`, title: 'all runs', keys }) };
}

// Time line of the popup: 0.3 s to 10 s on a log scale, as a % from the left
const timeX = (ms) => (100 * (Math.log(Math.min(10000, Math.max(300, ms))) - Math.log(300))) / (Math.log(10000) - Math.log(300));

// A position's popup: the note in a yellow box like its highlighted card, its three bars,
// labelled, each with a mark where it stood before your last session on it; its last 15 answers
// (green right, red wrong); a time line with your quickest 10%, your usual time for it and this
// run's answers; how often it was asked. key: the spelling shown; keys: all spellings counted in
// the totals (default: key).
export function detailHtml(scheduler, key, { note, title, runMs = [], keys = [key] }) {
  const bars = scheduler.noteRings(key);
  const before = scheduler.model.cards[key]?.mark;
  const row = (k, name) => {
    const v = bars[k];
    const color = k === 'known' ? masteryColor(v) : k === 'fast' ? PALETTE.steel : PALETTE.ink;
    // the top bar's line carries a small label, like a pin on a map
    const pin = k === 'known' ? '<span class="tip-pin">before this session</span>' : '';
    const mark = before ? `<u style="left:${(100 * before[k]).toFixed(0)}%" title="before this session">${pin}</u>` : '';
    return `<div class="tip-bar"><span>${name}</span><i><b style="width:${(100 * v).toFixed(0)}%;background:${color}"></b>${mark}</i><em>${pct(v)}</em></div>`;
  };
  const card = scheduler.model.cards[key];
  const hist = (card?.hist || []).map(([ok, ms]) => `<span class="${ok ? 'ok' : 'miss'}" title="${(ms / 1000).toFixed(1)} s"></span>`).join('');
  const usual = card?.time?.n ? scheduler.expectedMs(key) : null;
  const ticks = [500, 1000, 2000, 5000].map((ms) => `<s style="left:${timeX(ms)}%">${ms / 1000} s</s>`).join('');
  const line = `<div class="tip-time"><i>${ticks}` +
    `<em class="floor" style="left:${timeX(scheduler.floorMs())}%" title="your quickest 10% of right answers"></em>` +
    (usual ? `<em class="usual" style="left:${timeX(usual)}%" title="your usual time here"></em>` : '') +
    runMs.map(([ok, ms]) => `<b class="${ok ? 'ok' : 'miss'}" style="left:${timeX(ms)}%" title="${(ms / 1000).toFixed(1)} s"></b>`).join('') +
    '</i></div>';
  const cards = keys.map((k) => scheduler.model.cards[k]).filter(Boolean);
  const seen = cards.reduce((t, c) => t + c.seen, 0);
  const acc = seen ? cards.reduce((t, c) => t + c.acc * c.seen, 0) / seen : 0;
  return `<div class="tip-title${before ? ' with-pin' : ''}"><span class="tip-note">${note}</span> ${title}</div>${row('known', 'known')}${row('fast', 'pace')}${row('auto', 'automatic')}` +
    `<div class="tip-hist"><span class="tip-lbl">last ${card?.hist?.length || 0}</span>${hist}</div>` +
    `<div class="tip-lbl">time · <i class="floor"></i> quickest 10%${usual ? ' · <i class="usual"></i> usual' : ''}${runMs.length ? ' · <i class="run"></i> this run' : ''}</div>${line}` +
    `<div class="tip-foot">Asked ${seen}× · ${pct(acc)} right${usual ? ` · usually ${(usual / 1000).toFixed(1)} s` : ''}</div>`;
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
    ['Your quickest 10% (speed scale)', model.meta.time?.n ? secs(scheduler.floorMs()) : '—'],
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
