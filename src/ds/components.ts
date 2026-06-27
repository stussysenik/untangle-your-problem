import { LitElement, html } from 'lit';
import { property } from 'lit/decorators.js';
import { cardVariants, dishNameVariants, buttonVariants, noteVariants } from './variants';

// All Lit primitives render to light DOM so Uno/CVA utilities apply.

class MenuCard extends LitElement {
  @property({ type: Boolean }) active = false;
  @property({ type: Number, attribute: 'item-index' }) itemIndex = 0;
  @property({ type: String, attribute: 'dish-name' }) dishName = '';
  @property({ type: String }) quantity = '';
  @property({ type: String, attribute: 'expert-advice' }) expertAdvice = '';

  createRenderRoot() { return this; }

  render() {
    return html`
      <div class=${cardVariants({ active: this.active })}>
        <div class="flex flex-row gap-4 lg:gap-8 items-baseline relative group/item">
          <div class="flex flex-col items-start flex-shrink-0 w-12 lg:w-16 pt-1">
            <span class="font-mono text-[10px] text-gray-400 opacity-0 group-hover/item:opacity-100 transition-opacity absolute -left-4 top-2">NO.</span>
            <span class="font-mono text-2xl lg:text-3xl font-bold tracking-tighter text-black leading-none">
              ${String(this.itemIndex).padStart(2, '0')}
            </span>
          </div>
          <div class="flex-1 space-y-3 pt-0">
            <div class="flex flex-col items-start gap-1 border-b border-gray-100 pb-4 mb-2 lg:border-none lg:pb-0 lg:mb-0">
              <div class="flex flex-row justify-between items-baseline w-full gap-4">
                <h3 class=${dishNameVariants({ active: this.active })}>${this.dishName}</h3>
                <span class="font-serif italic text-lg lg:text-xl text-gray-500 lowercase leading-none whitespace-nowrap flex-shrink-0 text-right">
                  &mdash; ${this.quantity}
                </span>
              </div>
            </div>
            <p class="font-typewriter text-xs lg:text-sm leading-relaxed text-gray-600 max-w-2xl text-justify lg:text-left mt-2 pl-1 border-l-2 border-transparent group-hover:border-insight transition-colors duration-0">
              <span class="font-bold text-black mr-2">ADVICE📚:</span>${this.expertAdvice}
            </p>
          </div>
        </div>
      </div>
    `;
  }
}

class StickyNote extends LitElement {
  @property({ type: String, attribute: 'note-type' }) noteType: 'quote' | 'minimal' | 'scribble' = 'quote';
  @property({ type: String }) text = '';
  @property({ type: String }) attribution = '';

  createRenderRoot() { return this; }

  render() {
    const cls = noteVariants({ noteType: this.noteType });
    if (this.noteType === 'quote') {
      return html`
        <div class=${cls}>
          <div class="absolute top-0 right-0 p-2 opacity-20 pointer-events-none text-blue-900">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"/>
            </svg>
          </div>
          <p class="font-hand text-lg lg:text-2xl xl:text-3xl leading-relaxed font-bold opacity-90 pointer-events-none">${this.text}</p>
          ${this.attribution ? html`
            <div class="mt-2 flex justify-end pointer-events-none">
              <span class="font-typewriter text-[9px] uppercase tracking-widest text-blue-400 opacity-60">${this.attribution}</span>
            </div>
          ` : ''}
        </div>
      `;
    }
    return html`<div class=${cls}><span class="font-typewriter pointer-events-none">${this.text}</span></div>`;
  }
}

class PrimaryButton extends LitElement {
  @property({ type: Boolean }) enabled = true;

  createRenderRoot() { return this; }

  render() {
    return html`
      <button
        class=${buttonVariants({ enabled: this.enabled })}
        ?disabled=${!this.enabled}
      >
        <slot></slot>
      </button>
    `;
  }
}

// Register only once
if (!customElements.get('menu-card')) customElements.define('menu-card', MenuCard);
if (!customElements.get('sticky-note')) customElements.define('sticky-note', StickyNote);
if (!customElements.get('primary-button')) customElements.define('primary-button', PrimaryButton);

export { MenuCard, StickyNote, PrimaryButton };
