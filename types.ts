export interface MenuItem {
  id: string; // Unique ID for keying
  dishName: string; // 3-5 encouraging words
  quantity: string; // Actionable quantity (e.g., "2 x emails")
  sourceTrigger: string; // The specific text segment that triggered this
  expertAdvice: string; // Advice from the "experienced" persona
}

export interface UsageStats {
  promptTokenCount: number;
  candidatesTokenCount: number;
  totalTokenCount: number;
  estimatedCost: number; // In USD
}

export enum AppState {
  INPUT = 'INPUT',
  LOADING = 'LOADING',
  MENU = 'MENU',
}