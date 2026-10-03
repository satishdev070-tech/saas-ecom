"use client";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/states";

/** Root error boundary. Shows a safe message only; details stay in server logs (keyed by digest). */
export default function RootError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 items-center px-4 py-16">
      <ErrorState
        description={error.digest ? `Reference: ${error.digest}` : "Please try again in a moment."}
        action={
          <Button variant="secondary" onClick={() => retry()}>
            Try again
          </Button>
        }
      />
    </main>
  );
}
