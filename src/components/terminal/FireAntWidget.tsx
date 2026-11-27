"use client";
import { useEffect, useRef, useState } from "react";

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

/** FireAnt quote widget (price line chart). `id` must be unique on the page. */
export default function FireAntWidget({ id, symbol, height = 300 }: { id: string; symbol: string; height?: number }) {
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
          container_id: id, symbols: symbol, locale: "vi", width: `${node.clientWidth || 350}px`, height: `${height}px`,
        });
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [id, symbol, height]);

  return (
    <>
      <div id={id} ref={ref} className="fireant" style={{ minHeight: height }} />
      {failed && <p className="warnline">The FireAnt widget could not be loaded.</p>}
    </>
  );
}
