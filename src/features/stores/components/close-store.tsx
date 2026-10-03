"use client";

import { ActionDialog } from "@/features/settings/ui/action-controls";
import { TextField } from "@/components/ui/field";
import { closeStoreAction } from "../actions";

/** Owner-only "danger zone": close a store that's no longer used (kept, reopenable by support). */
export function CloseStoreButton({ storeName, slug }: { storeName: string; slug: string }) {
  return (
    <ActionDialog
      action={closeStoreAction}
      title={`Close ${storeName}?`}
      description={
        <>
          The store goes offline and leaves your store switcher. Nothing is deleted: products, orders and customers are kept, and support can reopen it. Move or remove any custom domain first.
        </>
      }
      triggerLabel="Close this store"
      triggerVariant="danger"
      confirmLabel="Close store"
      variant="danger"
    >
      {(e) => <TextField label={`Type ${slug} to confirm`} name="confirmSlug" autoComplete="off" spellCheck={false} required errors={e.confirmSlug ?? e._form} />}
    </ActionDialog>
  );
}
