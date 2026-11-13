/** Demand as plain words, e.g. "3 people support this". */
export function supporterLabel(n: number) {
  return n === 1 ? "1 person supports this" : `${n} people support this`;
}
