"use client";

/** Shown instead of Next's generic "This page couldn't load", with the message needed to debug it. */
export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="about">
      <h1>Something broke on this page</h1>
      <p className="warnline">{error.message || "Unknown error"}{error.digest ? ` (${error.digest})` : ""}</p>
      <button type="button" onClick={reset}>Try again</button>
    </main>
  );
}
