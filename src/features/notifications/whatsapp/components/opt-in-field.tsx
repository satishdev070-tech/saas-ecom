import { OPT_IN_LABEL_TEXT } from "../opt-in-text";

/**
 * WhatsApp opt-in checkbox for the storefront checkout form. Unticked by default (consent must be
 * an explicit action) and names the store, as Meta's opt-in rules require. Render it only when
 * `whatsappOptInAvailable(tenantId)` is true, so stores without WhatsApp notifications keep their
 * checkout unchanged. Posts `whatsappOptIn=true`.
 */
export function WhatsAppOptInField({ storeName, className }: { storeName: string; className?: string }) {
  return (
    <label className={className ?? "flex items-start gap-2 text-sm"}>
      <input type="checkbox" name="whatsappOptIn" value="true" className="mt-0.5" />
      <span>{OPT_IN_LABEL_TEXT(storeName)}</span>
    </label>
  );
}
