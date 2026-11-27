"use client";
import { useState, type FormEvent } from "react";
import FireAntChart from "./FireAntChart";
import ForeignFlowPanel from "./ForeignFlowPanel";
import IndexBoardHeatmap from "./IndexBoardHeatmap";
import IndexMovers from "./IndexMovers";
import { Segmented, useApi } from "./shared";
import TickerHealthCard from "./TickerHealthCard";

export type IndexCode = "VNINDEX" | "VN30";

export default function Terminal() {
  const [index, setIndex] = useState<IndexCode>("VNINDEX");
  const [symbol, setSymbol] = useState("HPG");
  const [draft, setDraft] = useState("");
  const symbols = useApi<{ symbol: string; name: string | null }[]>("/api/symbols");

  function submit(e: FormEvent) {
    e.preventDefault();
    const next = draft.trim().toUpperCase();
    if (/^[A-Z0-9]{3}$/.test(next)) setSymbol(next);
    setDraft("");
  }

  return (
    <div id="terminal">
      <div className="toolbar">
        <Segmented label="Index" value={index} onChange={setIndex} options={[["VNINDEX", "VNINDEX"], ["VN30", "VN30"]]} />
        <form onSubmit={submit} className="seg">
          <input aria-label="Ticker" placeholder={symbol} list="symbols" maxLength={3} value={draft} onChange={(e) => setDraft(e.target.value)} />
          <button type="submit">Open ticker</button>
          <datalist id="symbols">
            {symbols.data?.map((s) => <option key={s.symbol} value={s.symbol}>{s.name}</option>)}
          </datalist>
        </form>
        <span className="muted">Selected: <strong>{symbol}</strong></span>
      </div>
      <div className="grid layout">
        <div className="col">
          <IndexBoardHeatmap index={index} onSelect={setSymbol} />
          <IndexMovers index={index} onSelect={setSymbol} />
          <ForeignFlowPanel index={index} symbol={symbol} />
        </div>
        <div className="col">
          <FireAntChart symbol={symbol} />
          <TickerHealthCard symbol={symbol} />
        </div>
      </div>
    </div>
  );
}
