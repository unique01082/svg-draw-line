import { Link } from "react-router-dom";
import { usePageMeta } from "../hooks/usePageMeta";

export function ChangelogPage() {
  usePageMeta({
    title: "Changelog",
    description: "Published SVG Motion releases.",
    canonicalPath: "/changelog",
  });
  return (
    <main className="content-page">
      <p className="eyebrow">RELEASE LEDGER</p>
      <h1>Changelog</h1>
      <article className="release-entry">
        <header>
          <h2>0.1.0</h2>
          <time dateTime="2026-08-15">15 August 2026</time>
        </header>
        <p>
          First public release: safe SVG preparation, five native motion
          presets, transactional controllers and a React adapter.
        </p>
        <ul>
          <li>Framework-agnostic ESM core</li>
          <li>React component and hook</li>
          <li>Chromium, Firefox and WebKit coverage</li>
          <li>Sanitized arbitrary SVG sources</li>
        </ul>
        <Link to="/docs/0.1/getting-started">Read the 0.1 documentation</Link>
      </article>
    </main>
  );
}
