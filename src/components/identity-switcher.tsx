"use client";

import { useState, useTransition } from "react";
import { switchIdentity } from "@/app/actions/identity";
import type { Role } from "@/db/schema";
import { ROLE_LABELS } from "@/lib/roles";
import { roleTone } from "@/lib/tones";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Option = { id: number; label: string };

export function IdentitySwitcher({
  options,
  currentId,
  currentRole,
}: {
  options: Option[];
  currentId: number;
  /** Shown as a coloured role chip so you always know which view you're in. */
  currentRole: Role;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const items = options.map((o) => ({ value: String(o.id), label: o.label }));

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <span className="inline-flex items-center gap-2">
        <Badge tone={roleTone(currentRole)} title="Your current view">
          {ROLE_LABELS[currentRole]}
        </Badge>
        <Select
          items={items}
          value={String(currentId)}
          disabled={pending}
          onValueChange={(value) => {
            if (!value) return;
            startTransition(async () => {
              setError(null);
              const result = await switchIdentity(Number(value));
              if (!result.ok) setError(result.error);
            });
          }}
        >
          <SelectTrigger aria-label="Who are you?" className="min-w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </span>
      {error && (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}
    </span>
  );
}
