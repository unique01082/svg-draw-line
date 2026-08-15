import { useEffect } from "react";

export interface PageMeta {
  readonly title: string;
  readonly description: string;
  readonly canonicalPath: string;
}

export function usePageMeta(meta: PageMeta) {
  useEffect(() => {
    document.title = `${meta.title} · SVG Motion`;
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute("content", meta.description);
    document
      .querySelector('link[rel="canonical"]')
      ?.setAttribute(
        "href",
        `https://svg-motion.baole.space${meta.canonicalPath}`,
      );
    document
      .querySelector('meta[property="og:title"]')
      ?.setAttribute("content", meta.title);
    document
      .querySelector('meta[property="og:description"]')
      ?.setAttribute("content", meta.description);
    document
      .querySelector('meta[property="og:url"]')
      ?.setAttribute(
        "content",
        `https://svg-motion.baole.space${meta.canonicalPath}`,
      );
  }, [meta.canonicalPath, meta.description, meta.title]);
}
