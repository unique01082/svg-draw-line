import { NavLink } from "react-router-dom";
import { BrandMark } from "./BrandMark";

export function SiteHeader() {
  return (
    <header className="site-header">
      <NavLink to="/" className="site-brand" aria-label="SVG Motion home">
        <BrandMark />
        <span>
          <strong>SVG MOTION</strong>
          <small>baole.space / 0.1.0</small>
        </span>
      </NavLink>
      <nav aria-label="Primary">
        <NavLink to="/docs/0.1/getting-started">Docs</NavLink>
        <NavLink to="/playground">Playground</NavLink>
        <NavLink to="/changelog">Changelog</NavLink>
        <a href="https://github.com/unique01082/svg-draw-line">GitHub</a>
      </nav>
    </header>
  );
}
