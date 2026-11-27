export type IndexCode = "VNINDEX" | "VN30";
export const INDEX_NAMES: Record<IndexCode, string> = { VNINDEX: "VN-Index", VN30: "VN30" };

export interface Tile { symbol: string; name: string | null; price: number | null; changePercent: number | null; weight: number | null }

export interface BoardData {
  board: null | {
    date: string; indexValue: number | null; change: number | null; changePercent: number | null;
    advancers: number | null; decliners: number | null; unchanged: number | null;
    volume: number | null; tradingValue: number | null; foreignNetValue: number | null;
  };
  returns: { label: string; value: number | null }[];
  history: number[];
  volumeAvg20: number | null;
  heatmapDate: string | null;
  constituents: Tile[];
}

export interface FlowSums { buy: number; sell: number; net: number }
export interface FlowData {
  stockAsOf: string | null;
  indexAsOf: string | null;
  request: "queued" | "unknown" | null;
  windows: { sessions: number; partial: boolean; index: FlowSums | null; stock: FlowSums | null; shareOfVniNet: number | null; returnVsVni: number | null }[];
  daily: { date: string; net: number }[];
}
