import Link from "next/link";
import type { ReactNode } from "react";

export default function TopBar({ active, children }: { active: "dashboard" | "about"; children?: ReactNode }) {
  return (
    <header className="topbar">
      <Link href="/" className="logo" aria-label="Trang chủ VN Terminal">VN</Link>
      <nav>
        <Link href="/" aria-current={active === "dashboard" ? "page" : undefined}>Tổng quan</Link>
        <Link href="/about" aria-current={active === "about" ? "page" : undefined}>Môi giới &amp; khóa học</Link>
      </nav>
      {children}
    </header>
  );
}
