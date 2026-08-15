import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom";
import { SiteRoutes } from "./SiteApp";
import { knownRoutes, resolveDocPage } from "./routes/manifest";

export { knownRoutes };

export function render(url: string): string {
  return renderToString(
    <StaticRouter location={url}>
      <SiteRoutes />
    </StaticRouter>,
  );
}

export function routeMeta(url: string) {
  const docMatch = url.match(/^\/docs\/([^/]+)\/([^/]+)$/);
  if (docMatch) {
    const page = resolveDocPage(docMatch[1]!, docMatch[2]!);
    if (page)
      return {
        title: page.title,
        description: page.description,
        canonicalPath: `/docs/${page.version}/${page.slug}`,
      };
  }
  if (url === "/playground")
    return {
      title: "Playground",
      description: "Test SVG Motion against local and arbitrary SVG sources.",
      canonicalPath: url,
    };
  if (url === "/changelog")
    return {
      title: "Changelog",
      description: "Published SVG Motion releases.",
      canonicalPath: url,
    };
  return {
    title: "SVG Motion",
    description:
      "Animate any SVG with a safe, framework-agnostic TypeScript library.",
    canonicalPath: "/",
  };
}
