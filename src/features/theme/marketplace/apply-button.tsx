"use client";

import Link from "next/link";
import { ActionDialog } from "@/features/settings/ui/action-controls";
import { applyMarketplaceThemeAction, applyMarketplaceThemeAndPublishAction } from "../actions";

export function ApplyThemeButton({ themeKey, name, canPublish, size = "sm" }: { themeKey: string; name: string; canPublish: boolean; size?: "sm" | "md" }) {
  return (
    <span className="inline-flex flex-wrap items-start gap-2">
      {canPublish ? (
        <ActionDialog
          action={applyMarketplaceThemeAndPublishAction}
          fields={{ key: themeKey }}
          title={`Apply ${name} to your store?`}
          description="This applies the theme's look to your live store immediately, while keeping your own text, images and products. Your current live theme stays in version history and can be restored."
          triggerLabel="Apply to store"
          triggerVariant="primary"
          confirmLabel="Apply & publish"
          size={size}
          success={<>Theme is live. <Link href="/dashboard/theme" className="underline">Open the editor</Link></>}
        />
      ) : null}
      <ActionDialog
        action={applyMarketplaceThemeAction}
        fields={{ key: themeKey }}
        title={`Save ${name} as a draft?`}
        description="This replaces your current theme DRAFT (not your live store) with this theme's look, keeping your text, images and products. Unsaved editor changes in the draft are overwritten."
        triggerLabel={canPublish ? "Save as draft" : "Apply to draft"}
        triggerVariant={canPublish ? "secondary" : "primary"}
        confirmLabel="Create draft"
        size={size}
        success={<>Draft ready. <Link href="/dashboard/theme" className="underline">Open the editor</Link></>}
      />
    </span>
  );
}
