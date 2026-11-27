import Link from "next/link";
import type { ReactNode } from "react";

export default function TopBar({ active, children }: { active: "dashboard" | "about"; children?: ReactNode }) {
  return (
    <header className="topbar">
      <Link href="/" className="logo" aria-label="VN Terminal home">VN</Link>
      <nav>
        <Link href="/" aria-current={active === "dashboard" ? "page" : undefined}>Dashboard</Link>
        <Link href="/about" aria-current={active === "about" ? "page" : undefined}>Broker &amp; courses</Link>
      </nav>
      {children}
    </header>
  );
}
