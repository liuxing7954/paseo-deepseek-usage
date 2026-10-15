import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

/**
 * Budget denominators for the percentage gauge, per currency, stored on the daemon host and shared by
 * every client connected to it.
 *
 * `0` means "no gauge for this currency": the exact balance still shows, but no percentage is emitted,
 * because a percentage without a chosen denominator would be invented data.
 */
export const budgetSettings = defineSettings({
  id: "budget",
  scope: "host",
  version: 1,
  schema: z.object({
    cny: z.number().min(0).default(100),
    usd: z.number().min(0).default(0),
  }),
});

export type BudgetValues = z.infer<typeof budgetSettings.schema>;

/** Currency code → denominator, dropping the ones the user disabled. */
export function budgetMap(values: BudgetValues): Record<string, number> {
  const budgets: Record<string, number> = {};
  if (values.cny > 0) budgets.CNY = values.cny;
  if (values.usd > 0) budgets.USD = values.usd;
  return budgets;
}
