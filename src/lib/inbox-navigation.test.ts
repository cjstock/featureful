import { describe, expect, it } from "vitest";
import { isTypingTarget, keepDone, keyCommand, moveSelection, nextOpenId } from "@/lib/inbox-navigation";

const plain = { ctrlKey: false, metaKey: false, altKey: false };
const press = (key: string, typing = false, modifiers = plain) => keyCommand({ key, ...modifiers }, typing);

describe("keyCommand", () => {
  it("j and k move through the queue", () => {
    expect(press("j")).toEqual({ type: "move", delta: 1 });
    expect(press("k")).toEqual({ type: "move", delta: -1 });
  });

  it("1, 2 and 3 pick a verdict", () => {
    expect(press("1")).toEqual({ type: "pick", index: 0 });
    expect(press("2")).toEqual({ type: "pick", index: 1 });
    expect(press("3")).toEqual({ type: "pick", index: 2 });
  });

  it("is ignored while typing", () => {
    for (const key of ["j", "k", "1", "2", "3"]) expect(press(key, true)).toBeNull();
  });

  it("is ignored with a modifier key, and for other keys", () => {
    expect(press("j", false, { ...plain, ctrlKey: true })).toBeNull();
    expect(press("1", false, { ...plain, metaKey: true })).toBeNull();
    expect(press("k", false, { ...plain, altKey: true })).toBeNull();
    for (const key of ["4", "0", "J", "x", "Enter"]) expect(press(key)).toBeNull();
  });
});

describe("isTypingTarget", () => {
  it("is true in text fields, selects and editable content", () => {
    for (const tagName of ["INPUT", "TEXTAREA", "SELECT"]) expect(isTypingTarget({ tagName })).toBe(true);
    expect(isTypingTarget({ tagName: "DIV", isContentEditable: true })).toBe(true);
  });

  it("is false elsewhere", () => {
    expect(isTypingTarget({ tagName: "BUTTON" })).toBe(false);
    expect(isTypingTarget({ tagName: "BODY", isContentEditable: false })).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe("moveSelection", () => {
  const order = [4, 7, 2];

  it("moves to the next or previous item, stopping at the ends", () => {
    expect(moveSelection(order, 7, 1)).toBe(2);
    expect(moveSelection(order, 7, -1)).toBe(4);
    expect(moveSelection(order, 2, 1)).toBe(2);
    expect(moveSelection(order, 4, -1)).toBe(4);
  });

  it("starts at the first item when nothing (or a vanished item) is selected", () => {
    expect(moveSelection(order, null, 1)).toBe(4);
    expect(moveSelection(order, 99, -1)).toBe(4);
  });

  it("is null for an empty queue", () => {
    expect(moveSelection([], null, 1)).toBeNull();
  });
});

describe("nextOpenId (auto-advance after a verdict)", () => {
  const order = [1, 2, 3, 4];

  it("is the next open item after the one just reviewed, skipping done ones", () => {
    expect(nextOpenId(order, 1, new Set([1, 2]))).toBe(3);
  });

  it("wraps round to an earlier open item when none is left below", () => {
    expect(nextOpenId(order, 4, new Set([3, 4]))).toBe(1);
  });

  it("is null when every item is done", () => {
    expect(nextOpenId(order, 2, new Set(order))).toBeNull();
  });
});

describe("keepDone", () => {
  it("keeps items reviewed this session after they leave the server's list, which wins otherwise", () => {
    const fresh = [{ id: 2, title: "fresh" }];
    const done = [
      { id: 1, title: "reviewed" },
      { id: 2, title: "stale" },
    ];
    expect(keepDone(fresh, done)).toEqual([
      { id: 2, title: "fresh" },
      { id: 1, title: "reviewed" },
    ]);
  });
});
