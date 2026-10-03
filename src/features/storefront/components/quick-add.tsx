import { QuickAddForm } from "./islands";

/** Server wrapper so product cards stay server components. */
export function QuickAdd({ variantId, label }: { variantId: string; label: string }) {
  return <QuickAddForm variantId={variantId} label={label} />;
}
