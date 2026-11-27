"use client";
import FireAntWidget from "./FireAntWidget";
import { Panel } from "./shared";

export default function FireAntChart({ symbol }: { symbol: string }) {
  return (
    <Panel title={`${symbol} quote`} actions={<span className="badge">FireAnt</span>}>
      <FireAntWidget id="fan-quote-ticker" symbol={symbol} />
    </Panel>
  );
}
