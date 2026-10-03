"use client";

/** Last-resort boundary for errors in the root layout. Must render its own <html>/<body>. */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en-IN">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0 }}>
        <div role="alert" style={{ textAlign: "center", padding: 24 }}>
          <h1 style={{ fontSize: 20 }}>Something went wrong</h1>
          {error.digest ? <p style={{ color: "#6b645c" }}>Reference: {error.digest}</p> : null}
          <button type="button" onClick={() => retry()} style={{ marginTop: 12, padding: "8px 16px" }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
