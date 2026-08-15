import { Route, Routes } from "react-router-dom";
import { SiteHeader } from "./components/SiteHeader";
import { HomePage } from "./pages/HomePage";
import { DocsPage } from "./pages/DocsPage";
import { PlaygroundPage } from "./pages/PlaygroundPage";
import { ChangelogPage } from "./pages/ChangelogPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { RouteErrorBoundary } from "./components/SiteErrorBoundary";

export function SiteRoutes() {
  return (
    <div className="site-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <SiteHeader />
      <div id="main-content">
        <RouteErrorBoundary>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/docs/:version/:slug" element={<DocsPage />} />
            <Route path="/playground" element={<PlaygroundPage />} />
            <Route path="/changelog" element={<ChangelogPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </RouteErrorBoundary>
      </div>
      <footer className="site-footer">
        <a href="https://baole.space" aria-label="Visit baole.space">
          SVG MOTION / A PART OF BAOLE.SPACE
        </a>
        <span>MIT · PACKAGE 0.1.0</span>
      </footer>
    </div>
  );
}
