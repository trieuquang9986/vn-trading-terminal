/** Typed wrappers. Shapes follow https://developers.fhsc.com.vn (Tier 1, GET /market/**). */
import type { FhscClient } from "./client";

export type IndexCode = "VNINDEX" | "VN30";
export const INDEX_CODES: IndexCode[] = ["VNINDEX", "VN30"];

export interface IndexSummary {
  index: string; index_value: number | null; change: number | null; change_percent: number | null;
  market_cap: number | null; advancers: number | null; decliners: number | null; unchanged: number | null;
  volume: number | null; trading_value: number | null; foreign_net_value: number | null;
}
export interface Constituent {
  symbol: string; name: string | null; price: number | null; change_percent: number | null;
  market_cap: number | null; weight_percent: number | null;
}
export interface Bar { t: number; o?: number | null; h?: number | null; l?: number | null; c: number | null; v?: number | null }
export interface Amount { volume: number; value: number }
export interface FlowBar { date: string; buy: { total: Amount }; sell: { total: Amount } }
export interface Technicals {
  prices: { date: string; close: number }[];
  indicators: { indicator: string; params: string; data: { date: string; value?: number }[] }[];
}
export interface Listing {
  symbol: string; exchange: string | null; listed_shares: number | null;
  outstanding_shares: number | null; free_float_pct: number | null;
}
export interface Overview {
  pe: number | null; pb: number | null; ev_ebitda: number | null;
  industry?: { pe: number | null; pb: number | null; ev_ebitda: number | null } | null;
  gross_margin: number | null; roe: number | null; dividend_yield: number | null; roa: number | null;
}
export type PeriodRow = { year: number; quarter: number | null } & Record<string, number | null>;

const S1_FIELDS =
  "index,name,index_value,change,change_percent,market_cap,constituent_count,advancers,decliners,unchanged,volume,trading_value,foreign_net_value";

export const endpoints = (c: FhscClient) => ({
  /** S1 */
  indices: () =>
    c.get<{ updated_at: string | null; items: IndexSummary[] }>("/market/indices", {
      exchange: "HOSE", window: "1D", fields: S1_FIELDS, page_size: 50,
    }),
  /** S2 */
  constituents: (index: IndexCode, page: number) =>
    c.get<{ total: number; updated_at: string | null; items: Constituent[] }>(`/market/indices/${index}/constituents`, {
      page, page_size: 50, sort: "-weight_percent",
    }),
  /** S3 */
  indexHistory: (index: IndexCode, from: number, to: number) =>
    c.get<{ series?: Bar[] }>(`/market/quotes/indices/${index}/history`, { resolution: "1D", from, to }),
  /** S4 */
  listing: (symbol: string) => c.get<Listing>(`/market/stocks/${symbol}/listing`),
  /** S5 */
  stockHistory: (symbol: string, from: number, to: number) =>
    c.get<{ series?: Bar[] }>(`/market/quotes/stocks/${symbol}/history`, { resolution: "1D", from, to }),
  /** S6 */
  stockForeign: (symbol: string, from: string, to: string) =>
    c.get<{ data: FlowBar[] }>(`/market/stocks/${symbol}/trading/foreign/history`, { from, to }),
  /** S7 */
  indexForeign: (index: IndexCode, from: string, to: string) =>
    c.get<{ data: FlowBar[] }>(`/market/indices/${index}/trading/foreign/history`, { from, to }),
  technicals: (symbol: string, from: string, to: string) =>
    c.get<Technicals>(`/market/stocks/${symbol}/technicals`, { indicators: "SMA(20),SMA(50),VOLUME_SMA(20)", from, to }),
  overview: (symbol: string) => c.get<Overview>("/market/company-financial/overview", { symbol }),
  analysis: (symbol: string) =>
    c.get<PeriodRow[]>("/market/company-financial/analysis", { symbol, period: "quarterly" }),
  statement: (symbol: string, type: "income-statement" | "cash-flow") =>
    c.get<PeriodRow[]>("/market/v2/financial-statement/statement", { symbol, type, period: "quarterly", limit: 5 }),
});

export type Endpoints = ReturnType<typeof endpoints>;
