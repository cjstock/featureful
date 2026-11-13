import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { productStrategy } from "@/db/schema";

/** The single Product Strategy row always has this id. */
const STRATEGY_ID = 1;

/** Used until a PM (or the seed) saves a Product Strategy. */
export const DEFAULT_PRODUCT_STRATEGY = `We serve serious home roasters who track their beans, roasts and brews.
Goals:
- Data ownership: users own their roasting and brewing data and can get it in and out freely.
- Brew repeatability: help users reproduce a great cup reliably, from green bean to brew.
Non-goals: casual coffee drinkers, social features for their own sake, cafe or commercial roastery tooling.`;

export interface ProductStrategy {
  body: string;
  /** Null while the default is in use (never saved). */
  updatedAt: Date | null;
}

export function getProductStrategy(db: Db): ProductStrategy {
  const row = db.select().from(productStrategy).where(eq(productStrategy.id, STRATEGY_ID)).get();
  return row ? { body: row.body, updatedAt: row.updatedAt } : { body: DEFAULT_PRODUCT_STRATEGY, updatedAt: null };
}

export function saveProductStrategy(db: Db, body: string) {
  const updatedAt = new Date();
  db.insert(productStrategy)
    .values({ id: STRATEGY_ID, body, updatedAt })
    .onConflictDoUpdate({ target: productStrategy.id, set: { body, updatedAt } })
    .run();
}
