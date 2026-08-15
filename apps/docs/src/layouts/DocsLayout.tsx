import type { ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import type { DocPageMeta } from "../contracts";
import { docPages } from "../routes/manifest";
import { docsVersions, switchVersionPath } from "../versions";

export function DocsLayout({
  page,
  children,
}: {
  readonly page: DocPageMeta;
  readonly children: ReactNode;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <div className="docs-grid">
      <aside className="docs-sidebar">
        <label htmlFor="docs-version">Documentation version</label>
        <select
          id="docs-version"
          value={page.version}
          onChange={(event) =>
            navigate(
              switchVersionPath(location.pathname, event.currentTarget.value),
            )
          }
        >
          {docsVersions.map((version) => (
            <option key={version.id} value={version.id}>
              v{version.label}
              {version.isLatest ? " · latest" : ""}
            </option>
          ))}
        </select>
        <nav aria-label="Documentation">
          {docPages.map((item) => (
            <NavLink key={item.slug} to={`/docs/${page.version}/${item.slug}`}>
              <small>{item.section}</small>
              <span>{item.title}</span>
            </NavLink>
          ))}
        </nav>
      </aside>
      <article className="docs-article">{children}</article>
      <aside className="docs-toc">
        <p>ON THIS PAGE</p>
        <nav aria-label="On this page">
          {page.headings.map((heading) => (
            <a key={heading.id} href={`#${heading.id}`}>
              {heading.label}
            </a>
          ))}
        </nav>
      </aside>
    </div>
  );
}
