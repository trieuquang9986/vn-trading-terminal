"use client";
import { useState, type FormEvent } from "react";
import TopBar from "../layout/TopBar";
import BrokerHero from "../marketing/BrokerHero";
import ChartPanel from "./ChartPanel";
import ForeignFlowPanel from "./ForeignFlowPanel";
import Heatmap from "./Heatmap";
import IndexCard from "./IndexCard";
import IndexMovers from "./IndexMovers";
import SessionStats from "./SessionStats";
import { useApi } from "./shared";
import { INDEX_NAMES, type BoardData, type FlowData, type IndexCode } from "./types";

export default function Terminal() {
  const [index, setIndex] = useState<IndexCode>("VNINDEX");
  // The ticker tab stays open until closed; `onTicker` says which tab is in front.
  const [ticker, setTicker] = useState<string | null>(null);
  const [onTicker, setOnTicker] = useState(false);
  const [draft, setDraft] = useState("");
  const selected = onTicker ? ticker : null;

  const boards = { VNINDEX: useApi<BoardData>("/api/board?index=VNINDEX"), VN30: useApi<BoardData>("/api/board?index=VN30") };
  const board = boards[index];
  const flow = useApi<FlowData>(`/api/foreign-flow?index=${index}${selected ? `&symbol=${selected}` : ""}`);
  const symbols = useApi<{ symbol: string; name: string | null }[]>("/api/symbols");

  function open(symbol: string) {
    setTicker(symbol);
    setOnTicker(true);
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    const next = draft.trim().toUpperCase();
    if (/^[A-Z0-9]{3}$/.test(next)) open(next);
    setDraft("");
  }

  return (
    <>
      <TopBar active="dashboard">
        <form onSubmit={submit} className="command" role="search">
          <span aria-hidden="true">⌕</span>
          <input aria-label="Ticker" placeholder="Type a ticker (e.g. FPT) and press Enter" list="symbols" maxLength={3} value={draft} onChange={(e) => setDraft(e.target.value)} />
          <datalist id="symbols">
            {symbols.data?.map((s) => <option key={s.symbol} value={s.symbol}>{s.name}</option>)}
          </datalist>
        </form>
      </TopBar>

      <div className="tabs">
        <button type="button" className="tab" aria-pressed={!selected} onClick={() => setOnTicker(false)}>Market overview</button>
        {ticker && (
          <span className="tabgroup">
            <button type="button" className="tab" aria-pressed={onTicker} onClick={() => setOnTicker(true)}>{ticker} (1D)</button>
            <button type="button" className="tabclose" aria-label={`Close ${ticker}`} onClick={() => { setTicker(null); setOnTicker(false); }}>×</button>
          </span>
        )}
      </div>

      <main>
        <div className="summary">
          {(Object.keys(INDEX_NAMES) as IndexCode[]).map((code) => (
            <IndexCard key={code} name={INDEX_NAMES[code]} data={boards[code].data} active={index === code}
              onSelect={() => { setIndex(code); setOnTicker(false); }} />
          ))}
          <BrokerHero />
        </div>
        <div className="row half">
          <ChartPanel index={index} ticker={selected} board={board.data} />
          <Heatmap index={index} data={board.data} error={board.error} onSelect={open} />
        </div>
        <div className="row third">
          <SessionStats index={index} data={board.data} error={board.error} flow={flow.data} />
          <IndexMovers index={index} onSelect={open} />
        </div>
        <ForeignFlowPanel index={index} symbol={selected} data={flow.data} error={flow.error} />
      </main>
    </>
  );
}
