import type { Tone } from "@/lib/tones";

/**
 * Tailwind classes per tone. Kept as literal strings so Tailwind generates them; build any
 * tone-coloured element from these (pick a tone with `@/lib/tones`, never hard-code colours).
 * - `badge`: subtle background + readable foreground (what `<Badge tone>` uses)
 * - `solid`: solid fill (dots, meters)
 * - `text`: tone-coloured text on the page background
 * - `edge`: left border colour; pair with a width, e.g. `cn("border-l-4", TONE_STYLES[t].edge)`
 */
export const TONE_STYLES: Record<Tone, { badge: string; solid: string; text: string; edge: string }> = {
  "status-open": {
    badge: "bg-tone-status-open-subtle text-tone-status-open-fg",
    solid: "bg-tone-status-open",
    text: "text-tone-status-open-fg",
    edge: "border-l-tone-status-open",
  },
  "status-planned": {
    badge: "bg-tone-status-planned-subtle text-tone-status-planned-fg",
    solid: "bg-tone-status-planned",
    text: "text-tone-status-planned-fg",
    edge: "border-l-tone-status-planned",
  },
  "status-progress": {
    badge: "bg-tone-status-progress-subtle text-tone-status-progress-fg",
    solid: "bg-tone-status-progress",
    text: "text-tone-status-progress-fg",
    edge: "border-l-tone-status-progress",
  },
  "status-shipped": {
    badge: "bg-tone-status-shipped-subtle text-tone-status-shipped-fg",
    solid: "bg-tone-status-shipped",
    text: "text-tone-status-shipped-fg",
    edge: "border-l-tone-status-shipped",
  },
  "status-declined": {
    badge: "bg-tone-status-declined-subtle text-tone-status-declined-fg",
    solid: "bg-tone-status-declined",
    text: "text-tone-status-declined-fg",
    edge: "border-l-tone-status-declined",
  },
  "positive": {
    badge: "bg-tone-positive-subtle text-tone-positive-fg",
    solid: "bg-tone-positive",
    text: "text-tone-positive-fg",
    edge: "border-l-tone-positive",
  },
  "caution": {
    badge: "bg-tone-caution-subtle text-tone-caution-fg",
    solid: "bg-tone-caution",
    text: "text-tone-caution-fg",
    edge: "border-l-tone-caution",
  },
  "negative": {
    badge: "bg-tone-negative-subtle text-tone-negative-fg",
    solid: "bg-tone-negative",
    text: "text-tone-negative-fg",
    edge: "border-l-tone-negative",
  },
  "neutral": {
    badge: "bg-tone-neutral-subtle text-tone-neutral-fg",
    solid: "bg-tone-neutral",
    text: "text-tone-neutral-fg",
    edge: "border-l-tone-neutral",
  },
  "info": {
    badge: "bg-tone-info-subtle text-tone-info-fg",
    solid: "bg-tone-info",
    text: "text-tone-info-fg",
    edge: "border-l-tone-info",
  },
  "override": {
    badge: "bg-tone-override-subtle text-tone-override-fg",
    solid: "bg-tone-override",
    text: "text-tone-override-fg",
    edge: "border-l-tone-override",
  },
  "role-customer": {
    badge: "bg-tone-role-customer-subtle text-tone-role-customer-fg",
    solid: "bg-tone-role-customer",
    text: "text-tone-role-customer-fg",
    edge: "border-l-tone-role-customer",
  },
  "role-support": {
    badge: "bg-tone-role-support-subtle text-tone-role-support-fg",
    solid: "bg-tone-role-support",
    text: "text-tone-role-support-fg",
    edge: "border-l-tone-role-support",
  },
  "role-pm": {
    badge: "bg-tone-role-pm-subtle text-tone-role-pm-fg",
    solid: "bg-tone-role-pm",
    text: "text-tone-role-pm-fg",
    edge: "border-l-tone-role-pm",
  },
};
