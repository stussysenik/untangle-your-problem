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
  // Classes that only appear in dynamic strings or inline styles
  safelist: [
    'bg-insight', 'text-insight', 'border-insight',
    'font-rubik-spray', 'font-hand', 'font-typewriter',
    'animate-pulse',
  ],
});
