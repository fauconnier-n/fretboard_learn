// @ts-check
// Choices you answer with the guitar: each option sits on an open string, drawn as the neck
// at the nut with the string's letter left of the option. Play that open string (or click
// the row, or press its number) to choose it. The first option goes on the lowest string.

import { stringName } from './music.js';

export class GuitarMenu {
  /**
   * @param {HTMLElement} el
   * @param {() => number[]} getStrings open-string MIDI notes, lowest first
   * @param {() => boolean} getFlats
   */
  constructor(el, getStrings, getFlats) {
    this.el = el;
    this.getStrings = getStrings;
    this.getFlats = getFlats;
    /** @type {{ label: string, act: () => void, active?: boolean }[]} */
    this.options = [];
    el.addEventListener('click', (e) => {
      const row = /** @type {HTMLElement} */ (e.target).closest?.('[data-opt]');
      if (row instanceof HTMLElement) this.pick(+(row.dataset.opt ?? -1));
    });
  }

  /**
   * @param {string} title
   * @param {{ label: string, act: () => void, active?: boolean }[]} options at most one per string
   * @param {string} [strumHint] what a muted strum does here
   */
  show(title, options, strumHint = '') {
    const strings = this.getStrings();
    this.options = options.slice(0, strings.length);
    // drawn like the board: highest string on top
    const rows = strings.map((_, s) => s).reverse().map((s) => {
      const o = this.options[s];
      const name = stringName(strings, s, this.getFlats());
      return `<div class="gm-row${o ? ' has-opt' : ''}${o?.active ? ' active' : ''}"${o ? ` data-opt="${s}" role="button" tabindex="0"` : ''}>
        <span class="gm-str">${name}</span><span class="gm-line"></span>${o ? `<span class="gm-opt">${o.label}</span>` : ''}</div>`;
    }).join('');
    this.el.innerHTML = `<div class="gm-title">${title}<span class="muted"> · play an open string${strumHint ? ` · muted strum: ${strumHint}` : ''}</span></div><div class="gm-neck">${rows}</div>`;
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
