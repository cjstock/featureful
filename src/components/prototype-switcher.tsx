"use client";

// PROTOTYPE (v2 wayfinder ticket 05): throwaway. Floating bar to flip between UI variants via ?variant=.

import { useCallback, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

export function PrototypeSwitcher({
  variants,
  current,
}: {
  variants: { key: string; name: string }[];
  current: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const index = Math.max(
    0,
    variants.findIndex((v) => v.key === current),
  );

  const go = useCallback(
    (delta: number) => {
      const next = variants[(index + delta + variants.length) % variants.length];
      const params = new URLSearchParams(window.location.search);
      params.set("variant", next.key);
      router.replace(`${pathname}?${params.toString()}`);
    },
    [index, variants, pathname, router],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.closest("input, textarea, select, [contenteditable]") || t.isContentEditable)) return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  if (process.env.NODE_ENV === "production") return null;
  const v = variants[index];
  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full bg-black px-4 py-2 text-sm text-white shadow-lg ring-2 ring-fuchsia-500">
      <button type="button" onClick={() => go(-1)} aria-label="Previous variant" className="px-1">
        ←
      </button>
      <span className="font-mono">
        PROTOTYPE {v.key} ({v.name})
      </span>
      <button type="button" onClick={() => go(1)} aria-label="Next variant" className="px-1">
        →
      </button>
    </div>
  );
}
