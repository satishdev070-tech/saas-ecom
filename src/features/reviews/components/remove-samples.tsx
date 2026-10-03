"use client";

import { ActionDialog } from "@/features/settings/ui/action-controls";
import { removeSampleReviewsAction } from "../actions";

export function RemoveSampleReviews({ count }: { count: number }) {
  return (
    <ActionDialog
      action={removeSampleReviewsAction}
      title="Remove sample reviews?"
      description={`This permanently deletes the ${count} sample review${count === 1 ? "" : "s"}. Real customer reviews are not affected.`}
      triggerLabel="Remove sample reviews"
      confirmLabel="Remove"
      variant="danger"
      success="Sample reviews removed."
    />
  );
}
