import type React from 'react';

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'menu-card': React.HTMLAttributes<HTMLElement> & {
        active?: boolean;
        'item-index'?: number;
        'dish-name'?: string;
        quantity?: string;
        'expert-advice'?: string;
      };
      'sticky-note': React.HTMLAttributes<HTMLElement> & {
        'note-type'?: string;
        text?: string;
        attribution?: string;
      };
      'primary-button': React.HTMLAttributes<HTMLElement> & {
        enabled?: boolean;
      };
    }
  }
}
