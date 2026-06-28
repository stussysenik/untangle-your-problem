import { defineConfig, presetWind, presetAttributify } from 'unocss';

export default defineConfig({
  presets: [
    presetWind(),       // Tailwind/WindiCSS compat utilities
    presetAttributify(), // allow <div text-red-500 font-bold>
  ],
  theme: {
    fontFamily: {
      mono: ['"Space Mono"', '"Courier New"', 'monospace'],
      sans: ['"Helvetica Neue"', 'Helvetica', 'Arial', 'sans-serif'],
      body: ['"Open Sans"', 'sans-serif'],
      hand: ['"Shadows Into Light"', 'cursive'],
      typewriter: ['"Special Elite"', 'monospace'],
    },
    colors: {
      // Design token — used as bg-insight, text-insight, border-insight
      insight: '#CCFF00',
      paper: '#ffffff',
      ink: '#000000',
    },
  },
  // Scan all source from disk — utilities that live only in non-component modules
  // (e.g. CVA strings in src/ds/variants.ts) are otherwise missed, silently dropping
  // structural classes like `inline-flex` / `self-start` and breaking layout.
  content: {
    filesystem: [
      'src/**/*.{ts,tsx}',
      '*.tsx',
      'index.html',
    ],
  },
  // Classes that only appear in dynamic strings or inline styles
  safelist: [
    'bg-insight', 'text-insight', 'border-insight',
    'font-rubik-spray', 'font-hand', 'font-typewriter',
    'animate-pulse',
    // Structural utilities composed only inside src/ds/variants.ts (CVA strings).
    'inline-flex', 'items-center', 'justify-center', 'gap-3', 'self-start',
  ],
});
