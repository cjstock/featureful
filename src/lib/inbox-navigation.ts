/**
 * Keyboard flow and auto-advance for the Escalation inbox: `j`/`k` move, `1`/`2`/`3` pick a
 * verdict, and saving a verdict moves on to the next open item. Pure, for client components.
 */

export type InboxCommand = { type: "move"; delta: 1 | -1 } | { type: "pick"; index: number };

type KeyPress = { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean };

/** The inbox command for a key press, or null (other keys, modifiers held, or while typing). */
export function keyCommand(press: KeyPress, typing: boolean): InboxCommand | null {
  if (typing || press.ctrlKey || press.metaKey || press.altKey) return null;
  if (press.key === "j") return { type: "move", delta: 1 };
  if (press.key === "k") return { type: "move", delta: -1 };
  if (press.key === "1" || press.key === "2" || press.key === "3") {
    return { type: "pick", index: Number(press.key) - 1 };
  }
  return null;
}

/** Whether a key press lands where the PM is typing: a field, a select, or editable content. */
export function isTypingTarget(target: { tagName?: string; isContentEditable?: boolean } | null): boolean {
  if (!target) return false;
  return target.isContentEditable === true || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName ?? "");
}

/** The item `delta` steps from `selected` in `order`, stopping at the ends; the first if none is selected. */
export function moveSelection(order: readonly number[], selected: number | null, delta: 1 | -1): number | null {
  const at = selected === null ? -1 : order.indexOf(selected);
  if (at === -1) return order[0] ?? null;
  return order[Math.min(order.length - 1, Math.max(0, at + delta))];
}

/** After reviewing `from`: the next open item below it, else the first open one above, else null. */
export function nextOpenId(order: readonly number[], from: number, done: ReadonlySet<number>): number | null {
  const at = order.indexOf(from);
  const rotated = [...order.slice(at + 1), ...order.slice(0, Math.max(0, at))];
  return rotated.find((id) => !done.has(id)) ?? null;
}

/**
 * The server's items plus those reviewed this session (which have left its lists), so done items
 * stay in the inbox. The server's copy wins when it still has one.
 */
export function keepDone<T extends { id: number }>(fresh: readonly T[], done: readonly T[]): T[] {
  const ids = new Set(fresh.map((item) => item.id));
  return [...fresh, ...done.filter((item) => !ids.has(item.id))];
}
