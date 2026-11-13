"use client";

import { useTransition } from "react";
import { switchIdentity } from "@/app/actions/identity";
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
}: {
  options: Option[];
  currentId: number;
}) {
  const [pending, startTransition] = useTransition();
  const items = options.map((o) => ({ value: String(o.id), label: o.label }));

  return (
    <Select
      items={items}
      value={String(currentId)}
      disabled={pending}
      onValueChange={(value) => {
        if (value) startTransition(() => switchIdentity(Number(value)));
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
  );
}
