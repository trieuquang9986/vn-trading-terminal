/**
 * FireAnt price chart, isolated in an iframe (see public/chart.html).
 * Do not load FireAnt's script into the dashboard page itself.
 */
export default function FireAntWidget({ symbol, height = 300 }: { symbol: string; height?: number }) {
  const src = `/chart.html?symbol=${encodeURIComponent(symbol)}&height=${height}`;
  // Keyed so a symbol change replaces the frame instead of adding a browser history entry.
  return <iframe key={src} src={src} className="fireant" title={`${symbol} price chart (FireAnt)`} style={{ height }} />;
}
