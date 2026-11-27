import Link from "next/link";

/** Placeholder copy: replace with the broker's real details. */
export default function BrokerHero() {
  return (
    <section className="hero">
      <div>
        <p className="eyebrow">Stock broker · [Brokerage name]</p>
        <h1>[Your name] helps you read the Vietnam market before you trade it.</h1>
        <p className="lede">[One or two sentences on who you advise and how you work.]</p>
      </div>
      <Link href="/about" className="cta">About me &amp; courses</Link>
    </section>
  );
}
