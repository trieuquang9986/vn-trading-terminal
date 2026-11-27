import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "VN Market Terminal",
  description: "Daily Vietnam market intelligence: index board, movers, foreign flow and ticker health.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;700&family=IBM+Plex+Mono:wght@400;600&display=swap"
        />
      </head>
      <body>
        <header className="topbar">
          <Link href="/" className="brand">VN<span>·</span>Terminal</Link>
          <nav>
            <Link href="/#terminal">Terminal</Link>
            <Link href="/about">Broker &amp; courses</Link>
          </nav>
        </header>
        {children}
        <footer className="foot">
          End-of-day data from the FHSC Open API. For information only, not investment advice.
        </footer>
      </body>
    </html>
  );
}
