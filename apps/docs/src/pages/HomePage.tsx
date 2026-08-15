import { Link } from "react-router-dom";
import { MotionPreview } from "../components/MotionPreview";
import { specimenBySlug } from "../specimens/specimens";
import { usePageMeta } from "../hooks/usePageMeta";

export function HomePage() {
  usePageMeta({
    title: "SVG Motion",
    description:
      "Animate any SVG with a safe, framework-agnostic TypeScript library.",
    canonicalPath: "/",
  });
  const hero = specimenBySlug("lemon-juice");
  return (
    <main>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">
            SVG INPUT / NATIVE MOTION / ZERO RUNTIME EVAL
          </p>
          <h1 aria-label="Motion, measured.">
            Motion,
            <br />
            <em>measured.</em>
          </h1>
          <p>
            Prepare arbitrary SVG sources, protect the document boundary, and
            drive native animation through one predictable controller.
          </p>
          <div className="hero-actions">
            <Link
              className="button button--primary"
              to="/docs/0.1/getting-started"
            >
              Start with 0.1
            </Link>
            <Link className="button" to="/playground">
              Open Playground
            </Link>
          </div>
          <dl className="hero-facts">
            <div>
              <dt>INPUT</dt>
              <dd>Markup · URL · File · Node</dd>
            </div>
            <div>
              <dt>ENGINE</dt>
              <dd>Web Animations API</dd>
            </div>
            <div>
              <dt>ADAPTERS</dt>
              <dd>Core · React 18+</dd>
            </div>
          </dl>
        </div>
        <div className="hero-instrument">
          <header>
            <span>SPECIMEN / LEMON JUICE</span>
            <strong>DRAW</strong>
          </header>
          <MotionPreview
            source={hero.source}
            label={hero.label}
            preset="draw"
            duration={1700}
            autoplay
          />
          <footer>
            <span>01</span>
            <span>SVGGeometryElement</span>
            <span>1700ms</span>
          </footer>
        </div>
      </section>
      <section className="capability-strip" aria-label="Library capabilities">
        <article>
          <span>01</span>
          <h2>Prepare</h2>
          <p>
            Validate, sanitize and namespace before a source reaches the page.
          </p>
        </article>
        <article>
          <span>02</span>
          <h2>Compose</h2>
          <p>Five presets cover line work, leaves and complete compositions.</p>
        </article>
        <article>
          <span>03</span>
          <h2>Control</h2>
          <p>Seek, reverse, finish and restore through a typed lifecycle.</p>
        </article>
      </section>
    </main>
  );
}
