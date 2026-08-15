import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = resolve(appRoot, "dist");
const template = readFileSync(resolve(distRoot, "index.html"), "utf8");
const server = await import(
  pathToFileURL(resolve(appRoot, "dist-ssr/entry-server.js"))
);
const origin = "https://svg-motion.baole.space";

function escapeAttribute(value) {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
}

for (const route of server.knownRoutes) {
  const meta = server.routeMeta(route);
  const canonical = `${origin}${meta.canonicalPath}`;
  let html = template
    .replace("<!--app-html-->", server.render(route))
    .replace(
      '<div id="root">',
      `<div id="root" data-prerendered-route="${route}">`,
    )
    .replace(
      /<title>.*?<\/title>/,
      `<title>${escapeAttribute(meta.title)} · SVG Motion</title>`,
    )
    .replace(
      /(<meta name="description" content=")[^"]*(" \/>)/,
      `$1${escapeAttribute(meta.description)}$2`,
    )
    .replace(/(<link rel="canonical" href=")[^"]*(" \/>)/, `$1${canonical}$2`)
    .replace(
      /(<meta property="og:title" content=")[^"]*(" \/>)/,
      `$1${escapeAttribute(meta.title)}$2`,
    )
    .replace(
      /(<meta property="og:description" content=")[^"]*(" \/>)/,
      `$1${escapeAttribute(meta.description)}$2`,
    )
    .replace(
      /(<meta property="og:url" content=")[^"]*(" \/>)/,
      `$1${canonical}$2`,
    )
    .replace(
      "<!--head-tags-->",
      `<meta name="generator" content="SVG Motion static renderer" />`,
    );
  const output =
    route === "/"
      ? resolve(distRoot, "index.html")
      : resolve(distRoot, `.${route}/index.html`);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, html);
}

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${server.knownRoutes.map((route) => `  <url><loc>${origin}${route}</loc></url>`).join("\n")}\n</urlset>\n`;
writeFileSync(resolve(distRoot, "sitemap.xml"), sitemap);
writeFileSync(
  resolve(distRoot, "robots.txt"),
  `User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`,
);

for (const route of server.knownRoutes) {
  const output =
    route === "/"
      ? resolve(distRoot, "index.html")
      : resolve(distRoot, `.${route}/index.html`);
  const html = readFileSync(output, "utf8");
  if (!html.includes("data-reactroot") && !html.includes("site-shell"))
    throw new Error(`Route ${route} was not rendered.`);
  if (!html.includes(`${origin}${route === "/" ? "/" : route}`))
    throw new Error(`Route ${route} is missing its canonical URL.`);
}
