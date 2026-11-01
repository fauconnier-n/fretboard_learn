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
   * Options fill the rows from the top; the bottom row is Back (when there is somewhere to go
   * back to), or More… when there are more options than strings. Two muted strums take the
   * primary option (green): the menu's hint says which.
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
    const all = o.back ? [...options, { label: o.backLabel || 'Back', act: o.back }] : options;
    let shown = all;
    if (all.length > n) {
      // more options than strings (a 4-string bass): pages, the bottom row turning the page
      const per = n - 1;
      const pages = Math.ceil(all.length / per);
      const turn = { label: page + 1 < pages ? 'More…' : 'Back to the first choices', act: () => this.show(title, options, o, (page + 1) % pages) };
      shown = [...all.slice(page * per, page * per + per), turn];
    }
    // the last one (Back or More…) on the bottom row, the others from the top
    const rowsOf = o.back || all.length > n ? [...shown.slice(0, -1).map((_, i) => order[i]), order[n - 1]] : shown.map((_, i) => order[i]);
    this.options = [];
    shown.forEach((opt, i) => { this.options[rowsOf[i]] = opt; });
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
