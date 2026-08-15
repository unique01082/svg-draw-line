import { Link, useLocation } from "react-router-dom";
import { usePageMeta } from "../hooks/usePageMeta";

export function VersionNotFoundPage({ version }: { readonly version: string }) {
  usePageMeta({
    title: `Version ${version} unavailable`,
    description: "This documentation version is not available.",
    canonicalPath: "/docs/0.1/getting-started",
  });
  return (
    <main className="empty-page">
      <p className="eyebrow">VERSION BOUNDARY</p>
      <h1>Version {version} is not available</h1>
      <p>Published documentation currently follows the immutable 0.1 line.</p>
      <Link className="button button--primary" to="/docs/0.1/getting-started">
        Read version 0.1
      </Link>
    </main>
  );
}

export function NotFoundPage() {
  const location = useLocation();
  usePageMeta({
    title: "Page not found",
    description: "The requested SVG Motion page does not exist.",
    canonicalPath: location.pathname,
  });
  return (
    <main className="empty-page">
      <p className="eyebrow">404 / OUT OF BOUNDS</p>
      <h1>Page not found</h1>
      <p>The requested route is outside the current documentation manifest.</p>
      <Link className="button" to="/">
        Return home
      </Link>
    </main>
  );
}
