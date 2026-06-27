import { z } from 'zod';

export const MenuItemSchema = z.object({
  dishName: z.string().min(1),
  quantity: z.string().min(1),
  sourceTrigger: z.string().min(1),
  expertAdvice: z.string().min(1),
});

export const PersonalizationSignalsSchema = z.object({
  mood: z.enum(['anxious', 'overwhelmed', 'motivated', 'neutral']),
  energy: z.enum(['low', 'medium', 'high']),
  domain: z.enum(['work', 'personal', 'mixed']),
  language: z.string().default('en'),
});

export const UsageStatsSchema = z.object({
  promptTokenCount: z.number(),
  candidatesTokenCount: z.number(),
  totalTokenCount: z.number(),
  estimatedCost: z.number(),
});

export const MenuSchema = z.object({
  items: z.array(MenuItemSchema).min(1).max(12),
  signals: PersonalizationSignalsSchema,
  usage: UsageStatsSchema,
});

export type MenuItem = z.infer<typeof MenuItemSchema>;
export type PersonalizationSignals = z.infer<typeof PersonalizationSignalsSchema>;
export type UsageStats = z.infer<typeof UsageStatsSchema>;
export type Menu = z.infer<typeof MenuSchema>;
