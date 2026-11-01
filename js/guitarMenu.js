// @ts-check
// Choices you answer with the guitar: each option sits on an open string, drawn as the neck
// at the nut with the string's letter left of the option. Play that open string (or click
// the row, or press its number) to choose it. The first option goes on the lowest string.
// Strings are in the same order as on the boards (low E on top unless lowAtBottom).

import { stringName } from './music.js';

export class GuitarMenu {
  /**
   * @param {HTMLElement} el
   * @param {() => number[]} getStrings open-string MIDI notes, lowest first
   * @param {() => boolean} getFlats
   * @param {() => boolean} [getLowAtBottom]
   */
  constructor(el, getStrings, getFlats, getLowAtBottom = () => false) {
    this.el = el;
    this.getStrings = getStrings;
    this.getFlats = getFlats;
    this.getLowAtBottom = getLowAtBottom;
    /** @type {{ label: string, act: () => void, active?: boolean, primary?: boolean }[]} */
    this.options = [];
    /** @type {{ label: string, act: () => void } | null} */
    this.primaryOption = null;
    el.addEventListener('click', (e) => {
      const row = /** @type {HTMLElement} */ (e.target).closest?.('[data-opt]');
      if (row instanceof HTMLElement) this.pick(+(row.dataset.opt ?? -1));
    });
  }

  /**
   * Options fill the rows from the top; the bottom row is Back when there is somewhere to go
   * back to, and More… sits just above it when there are more options than rows. Two muted
   * strums take the primary option (green): the menu's hint says which.
   * @param {string} title
   * @param {{ label: string, act: () => void, active?: boolean, primary?: boolean }[]} options from the top row
   * @param {{ back?: () => void, backLabel?: string, hint?: string }} [o] back: the bottom row's action;
   *   hint: what two muted strums do, when there is no primary option
   */
  show(title, options, o = {}, page = 0) {
    const strings = this.getStrings();
    const n = strings.length;
    // drawn like the boards: string indices from the top row down
    const order = strings.map((_, s) => s);
    if (this.getLowAtBottom()) order.reverse();
    const back = o.back ? { label: o.backLabel || 'Back to the main menu', act: o.back } : null;
    // the rows for options: all but the bottom one when it holds Back
    const room = back ? n - 1 : n;
    let pageOpts = options;
    let turn = null;
    if (options.length > room) {
      // more options than rows (a 4-string bass, a long list): pages, More… on the last free row
      const per = room - 1;
      const pages = Math.ceil(options.length / per);
      pageOpts = options.slice(page * per, page * per + per);
      turn = { label: page + 1 < pages ? 'More…' : 'Back to the first choices', act: () => this.show(title, options, o, (page + 1) % pages) };
    }
    // options from the top row down; More… just above Back; Back always on the bottom row
    this.options = [];
    pageOpts.forEach((opt, i) => { this.options[order[i]] = opt; });
    if (turn) this.options[order[room - 1]] = turn;
    if (back) this.options[order[n - 1]] = back;
    this.primaryOption = options.find((p) => p.primary) || null;
    const hint = this.primaryOption ? this.primaryOption.label.toLowerCase() : o.hint;
    const rows = order.map((s) => {
      const opt = this.options[s];
      const name = stringName(strings, s, this.getFlats());
      return `<div class="gm-row${opt ? ' has-opt' : ''}${opt?.active ? ' active' : ''}${opt?.primary ? ' primary' : ''}"${opt ? ` data-opt="${s}" role="button" tabindex="0"` : ''}>
        <span class="gm-str">${name}</span><span class="gm-line" style="height:${(0.9 + (n - 1 - s) * 0.5).toFixed(2)}px"></span>${opt ? `<span class="gm-opt">${opt.label}</span>` : ''}</div>`;
    }).join('');
    this.el.innerHTML = `<div class="gm-title">${title}<span class="muted"> · play an open string to select${hint ? ` · two muted strums: ${hint}` : ''}</span></div><div class="gm-neck">${rows}</div>`;
    this.el.classList.remove('hidden');
  }

  /** Two muted strums: the primary option, if this menu has one. */
  primary() {
    if (!this.visible || !this.primaryOption) return false;
    this.primaryOption.act();
    return true;
  }

  hide() {
    this.options = [];
    this.el.classList.add('hidden');
    this.el.innerHTML = '';
  }

  get visible() {
    return this.options.length > 0;
  }

  /** @param {number} i option index (= string index, 0 = lowest) */
  pick(i) {
    const o = this.options[i];
    if (!o) return false;
    o.act();
    return true;
  }

  /** A played note: an open string with an option chooses it. @param {number} midi */
  onNote(midi) {
    if (!this.visible) return false;
    return this.pick(this.getStrings().indexOf(midi));
  }
}
