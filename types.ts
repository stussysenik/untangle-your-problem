// Re-export from Zod schema — this is now the source of truth
export type { MenuItem, UsageStats, PersonalizationSignals, Menu } from './src/ai/schema';

// Legacy enum kept for compatibility
export enum AppState {
  INPUT = 'INPUT',
  LOADING = 'LOADING',
  MENU = 'MENU',
}
