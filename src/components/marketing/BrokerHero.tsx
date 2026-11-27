import Link from "next/link";

/** Placeholder copy: replace with the broker's real details. */
export default function BrokerHero() {
  return (
    <section className="hero">
      <div>
        <h1>[Your name] · Stock broker at [Brokerage name]</h1>
        <p>[One sentence on who you advise and how you work.]</p>
      </div>
      <Link href="/about" className="cta">About me &amp; courses</Link>
    </section>
  );
}
