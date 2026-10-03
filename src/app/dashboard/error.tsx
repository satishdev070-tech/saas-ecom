"use client";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/states";

export default function DashboardError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <ErrorState
      title="This page couldn't load"
      description={error.digest ? `Reference: ${error.digest}` : "Please try again."}
      action={
        <Button variant="secondary" onClick={() => retry()}>
          Try again
        </Button>
      }
    />
  );
}
