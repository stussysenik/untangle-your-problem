import type { PersonalizationSignals } from '../ai/schema';

function fib(n: number): number {
  if (n <= 1) return n;
  let a = 0, b = 1;
  for (let i = 2; i <= n; i++) [a, b] = [b, a + b];
  return b;
}

function fibColor(seed: number): string {
  const off = seed * 7;
  const r = Math.min(255, Math.floor((fib((off + 5) % 20) * 15 % 256) * 1.5));
  const g = Math.min(255, Math.floor((fib((off + 11) % 20) * 13 % 256) * 1.5));
  const b = Math.min(255, Math.floor((fib((off + 17) % 20) * 11 % 256) * 1.5));
  return `rgb(${r}, ${g}, ${b})`;
}

function contrast(a: string, b: string): number {
  const parse = (s: string): [number, number, number] => {
    const m = s.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    return m ? [+m[1], +m[2], +m[3]] : [0, 0, 0];
  };
  const [r1, g1, b1] = parse(a);
  const [r2, g2, b2] = parse(b);
  return Math.sqrt((r2 - r1) ** 2 + (g2 - g1) ** 2 + (b2 - b1) ** 2);
}

const HISTORY_KEY = 'untangle_color_history';
const SEED_KEY = 'untangle_color_seed';
const MIN_CONTRAST = 200;

/** Generate a session accent color from stored seed, with contrast guarantee against the previous color. */
export function generateSessionColor(_signals?: PersonalizationSignals): string {
  let lastColor: string | null = null;
  let seed = Math.floor(Math.random() * 100);

  try {
    const stored = localStorage.getItem(HISTORY_KEY);
    const storedSeed = localStorage.getItem(SEED_KEY);
    if (stored) {
      const hist = JSON.parse(stored) as string[];
      lastColor = hist[hist.length - 1] ?? null;
    }
    if (storedSeed) seed = parseInt(storedSeed) + 1;
  } catch { /* no-op */ }

  let color = fibColor(seed);
  let attempts = 0;
  while (lastColor && contrast(color, lastColor) < MIN_CONTRAST && attempts < 50) {
    seed += 3;
    color = fibColor(seed);
    attempts++;
  }

  try {
    const history = [lastColor, color].filter(Boolean) as string[];
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-2)));
    localStorage.setItem(SEED_KEY, seed.toString());
  } catch { /* no-op */ }

  return color;
}
