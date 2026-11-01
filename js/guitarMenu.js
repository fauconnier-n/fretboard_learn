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
    el.addEventListener('click', (e) => {
      const row = /** @type {HTMLElement} */ (e.target).closest?.('[data-opt]');
      if (row instanceof HTMLElement) this.pick(+(row.dataset.opt ?? -1));
    });
  }

  /**
   * @param {string} title
   * @param {{ label: string, act: () => void, active?: boolean, primary?: boolean }[]} options at most one per string (primary: the main step, green)
   * @param {string} [strumHint] what two muted strums do here (go back), if anything
   */
  show(title, options, strumHint = '', page = 0) {
    const strings = this.getStrings();
    // more options than strings (a 4-string bass): pages, the last string turning the page
    const n = strings.length;
    if (options.length > n) {
      const per = n - 1;
      const pages = Math.ceil(options.length / per);
      const turn = { label: page + 1 < pages ? 'More…' : 'Back to the first choices', act: () => this.show(title, options, strumHint, (page + 1) % pages) };
      this.options = [...options.slice(page * per, page * per + per), turn];
    } else this.options = options;
    // drawn like the boards
    const order = strings.map((_, s) => s);
    if (this.getLowAtBottom()) order.reverse();
    const rows = order.map((s) => {
      const o = this.options[s];
      const name = stringName(strings, s, this.getFlats());
      return `<div class="gm-row${o ? ' has-opt' : ''}${o?.active ? ' active' : ''}${o?.primary ? ' primary' : ''}"${o ? ` data-opt="${s}" role="button" tabindex="0"` : ''}>
        <span class="gm-str">${name}</span><span class="gm-line" style="height:${(0.9 + (n - 1 - s) * 0.5).toFixed(2)}px"></span>${o ? `<span class="gm-opt">${o.label}</span>` : ''}</div>`;
    }).join('');
    this.el.innerHTML = `<div class="gm-title">${title}<span class="muted"> · play an open string to select${strumHint ? ` · two muted strums: ${strumHint}` : ''}</span></div><div class="gm-neck">${rows}</div>`;
    this.el.classList.remove('hidden');
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
