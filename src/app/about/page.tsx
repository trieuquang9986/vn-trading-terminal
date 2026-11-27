import type { Metadata } from "next";
import TopBar from "../../components/layout/TopBar";

export const metadata: Metadata = { title: "Broker & courses · VN Market Terminal" };

const COURSES = [
  { title: "[Course 1: Market foundations]", duration: "[4 weeks]", syllabus: ["[Order types and settlement]", "[Reading the index board]", "[Risk per trade]"] },
  { title: "[Course 2: Technical analysis]", duration: "[6 weeks]", syllabus: ["[Trend and moving averages]", "[Volume and OBV]", "[Relative strength vs VNINDEX]"] },
  { title: "[Course 3: Fundamental analysis]", duration: "[6 weeks]", syllabus: ["[Profitability and growth]", "[Balance sheet and cash flow]", "[Valuation against the industry]"] },
];

export default function About() {
  return (
    <>
    <TopBar active="about" />
    <main className="about">
      <p className="notice">Placeholder page. Text in [brackets] is waiting for your details.</p>
      <section>
        <p className="eyebrow">Broker bio</p>
        <h1>[Your name]</h1>
        <p className="lede">[Role, brokerage, licence number, years in the market.]</p>
      </section>
      <section>
        <h2>Track record &amp; philosophy</h2>
        <p>[How you pick stocks, how you manage risk, and what clients can expect from you.]</p>
      </section>
      <section>
        <h2>Courses</h2>
        <div className="grid three">
          {COURSES.map((c) => (
            <article className="panel" key={c.title}>
              <h3>{c.title}</h3>
              <p className="muted">Duration: {c.duration}</p>
              <ul>{c.syllabus.map((s) => <li key={s}>{s}</li>)}</ul>
              <a className="cta" href="#contact">Enrol</a>
            </article>
          ))}
        </div>
      </section>
      <section id="contact">
        <h2>Contact &amp; consultation</h2>
        <ul>
          <li>Email: [you@example.com]</li>
          <li>Phone / Zalo: [number]</li>
          <li>Book a consultation: [link]</li>
        </ul>
      </section>
    </main>
    </>
  );
}
