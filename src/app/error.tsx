"use client";

/** Shown instead of Next's generic "This page couldn't load", with the message needed to debug it. */
export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="about">
      <h1>Đã xảy ra lỗi trên trang này</h1>
      <p className="warnline">{error.message || "Lỗi không xác định"}{error.digest ? ` (${error.digest})` : ""}</p>
      <button type="button" onClick={reset}>Thử lại</button>
    </main>
  );
}
