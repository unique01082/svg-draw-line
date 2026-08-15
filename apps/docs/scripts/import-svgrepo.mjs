import { createHash } from "node:crypto";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const sourceUrl =
  "https://www.svgrepo.com/collection/education-duotone-line-icons/";
const mirrorBase = "https://www.svgviewer.dev/s";
const expected = [
  [386922, "jug", "Jug", "Jug"],
  [386923, "box", "Box", "Box"],
  [386924, "shopping-cart", "Shopping Cart", "Shopping Cart"],
  [386925, "alarm-clock", "Alarm Clock", "Alarm Clock"],
  [386926, "pig", "Pig", "Pig"],
  [386927, "folder", "Folder", "Folder"],
  [386928, "avatar", "Avatar", "Avatar"],
  [386929, "lighting", "Lighting", "Lighting"],
  [386930, "camera-1", "Camera I", "Camera"],
  [386931, "notebook", "Notebook", "Notebook"],
  [386932, "house", "House", "House"],
  [386933, "office-1", "Office I", "Office"],
  [386934, "office-2", "Office II", "Office"],
  [386935, "car", "Car", "Car"],
  [386936, "bachelor-hat", "Bachelor Hat", "Bachelor Hat"],
  [386937, "computer", "Computer", "Computer"],
  [386938, "writing-bowl", "Writing Bowl", "Writing Bowl"],
  [386939, "file-board", "File Board", "File Board"],
  [386940, "camera-2", "Camera II", "Camera"],
  [386941, "u-disk", "U Disk", "U Disk"],
  [386942, "bowl", "Bowl", "Bowl"],
  [386943, "clothing", "Clothing", "Clothing"],
  [386944, "globe", "Globe", "Globe"],
  [386945, "book", "Book", "Book"],
  [386946, "office-3", "Office III", "Office"],
  [386947, "documentation-1", "Documentation I", "Documentation"],
  [386948, "documentation-2", "Documentation II", "Documentation"],
  [386949, "reagent-bottle", "Reagent Bottle", "Reagent Bottle"],
  [386950, "trophies", "Trophies", "Trophies"],
  [386951, "tv", "TV", "Tv"],
];

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const assetsRoot = resolve(appRoot, "public/specimens");
const manifestPath = resolve(appRoot, "src/specimens/manifest.json");

function decodeHtml(value) {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&amp;", "&");
}

async function fetchOriginal(viewerId, slug) {
  const response = await fetch(`${mirrorBase}/${viewerId}/${slug}`);
  if (!response.ok) {
    throw new Error(
      `Unable to acquire specimen ${viewerId}: ${response.status}`,
    );
  }
  const html = await response.text();
  const encoded = html.match(
    /&lt;!-- License: PD\.[\s\S]*?&lt;svg\b[\s\S]*?&lt;\/svg&gt;/,
  )?.[0];
  if (!encoded) throw new Error(`Missing original SVG for ${viewerId}.`);
  const svg = decodeHtml(encoded).trim().concat("\n");
  if (
    (svg.match(/<svg\b/g)?.length ?? 0) !== 1 ||
    !/viewBox="0 0 1024 1024"/.test(svg) ||
    /<script|<foreignObject|\son\w+=|javascript:|<image|<use|href=/i.test(svg)
  ) {
    throw new Error(`Unsafe or invalid SVG generated for ${slug}.`);
  }
  return svg;
}

await mkdir(assetsRoot, { recursive: true });
const specimens = [];
for (const [viewerId, slug, label, originalName] of expected) {
  const svg = await fetchOriginal(viewerId, slug);
  const file = `${slug}.svg`;
  await writeFile(resolve(assetsRoot, file), svg);
  specimens.push({
    slug,
    label,
    originalName,
    file,
    sourceId: viewerId,
    sha256: createHash("sha256").update(svg).digest("hex"),
  });
}

const expectedFiles = new Set(specimens.map(({ file }) => file));
for (const file of await readdir(assetsRoot)) {
  if (file.endsWith(".svg") && !expectedFiles.has(file)) {
    await rm(resolve(assetsRoot, file));
  }
}

await writeFile(
  manifestPath,
  `${JSON.stringify(
    {
      collectionId: "education-duotone-line-icons",
      collectionName: "Education Duotone Line Icons",
      creator: "Jack Liu",
      creatorUrl: "https://dribbble.com/strayguy",
      sourceUrl,
      acquisitionMirror: "https://www.svgviewer.dev/",
      acquisitionDate: "2026-08-15",
      license: "Public Domain (CC0)",
      specimens,
    },
    null,
    2,
  )}\n`,
);
