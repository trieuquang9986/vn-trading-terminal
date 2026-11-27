/** Keep FireAnt's chart isolated from the dashboard React tree. */
export default function FireAntWidget({ symbol }: { symbol: string }) {
  const src = `https://fireant.vn/embed?widget=technical-chart&symbol=${encodeURIComponent(symbol)}&interval=D&bars=120&candleStyle=hollow&showVolume=1&_w=100%25&_h=500`;
  // Keyed so a symbol change replaces the frame instead of adding a browser history entry.
  return <iframe key={src} src={src} className="fireant" title={`${symbol} price chart (FireAnt)`} height={500} />;
}

