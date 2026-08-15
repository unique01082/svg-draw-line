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
  const hero = specimenBySlug("des-wand-2");
  const capabilities = [
    {
      specimen: specimenBySlug("cld-cloud-network-folder"),
      preset: "draw" as const,
      title: "Prepare",
      description:
        "Validate, sanitize and namespace before a source reaches the page.",
    },
    {
      specimen: specimenBySlug("com-laptop-code"),
      preset: "stagger" as const,
      title: "Compose",
      description: "Five presets cover line work, leaves and compositions.",
    },
    {
      specimen: specimenBySlug("gen-heart-rate"),
      preset: "pulse" as const,
      title: "Control",
      description:
        "Seek, reverse, finish and restore through a typed lifecycle.",
    },
  ];
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
            <span>SPECIMEN / DES WAND 2</span>
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
        {capabilities.map(({ specimen, preset, title, description }) => (
          <article key={title}>
            <MotionPreview
              className="capability-icon"
              source={specimen.source}
              label={`${title}: ${specimen.label}`}
              preset={preset}
              duration={1400}
              autoplay
              compact
            />
            <h2>{title}</h2>
            <p>{description}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
