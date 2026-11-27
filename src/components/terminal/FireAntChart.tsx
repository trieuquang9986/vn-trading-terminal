"use client";
import { useEffect, useRef, useState } from "react";
import { Panel } from "./shared";

const SCRIPT = "https://www.fireant.vn/Scripts/web/widgets.js";

declare global {
  interface Window {
    FireAnt?: { QuoteWidget: new (options: Record<string, unknown>) => unknown };
  }
}

let loading: Promise<void> | null = null;
function loadScript() {
  if (window.FireAnt) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const el = document.createElement("script");
    el.src = SCRIPT;
    el.onload = () => resolve();
    el.onerror = () => {
      loading = null;
      el.remove();
      reject(new Error("load failed"));
    };
    document.head.appendChild(el);
  });
  return loading;
}

export default function FireAntChart({ symbol }: { symbol: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    loadScript()
      .then(() => {
        const node = ref.current;
        if (cancelled || !node || !window.FireAnt) return;
        node.innerHTML = "";
        new window.FireAnt.QuoteWidget({
          container_id: node.id, symbols: symbol, locale: "vi", width: `${node.clientWidth || 350}px`, height: "300px",
        });
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  return (
    <Panel title={`${symbol} quote`} actions={<span className="badge">FireAnt</span>}>
      <div id="fireant" ref={ref} />
      {failed && <p className="warnline">The FireAnt widget could not be loaded.</p>}
    </Panel>
  );
}
