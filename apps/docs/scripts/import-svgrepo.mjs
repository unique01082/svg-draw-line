import { createHash } from "node:crypto";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const sourceUrl =
  "https://www.svgrepo.com/collection/pixellove-bordered-vectors/";
const downloadBase = "https://www.svgrepo.com/show";
const expected = [
  [506896, "cld-cloud-network-folder", "Cld Cloud Network Folder"],
  [506897, "cha-translate-2", "Cha Translate 2"],
  [506898, "cld-cloud-computer-network", "Cld Cloud Computer Network"],
  [506899, "cld-cloud-phone", "Cld Cloud Phone"],
  [506900, "cha-rect-swear", "Cha Rect Swear"],
  [506901, "cld-cloud-wifi", "Cld Cloud Wifi"],
  [506902, "cle-soap-bar", "Cle Soap Bar"],
  [506903, "cle-peg", "Cle Peg"],
  [506904, "cle-spraycan", "Cle Spraycan"],
  [506905, "cld-server", "Cld Server"],
  [506906, "cle-dustpan-brush", "Cle Dustpan Brush"],
  [506907, "clo-bowler", "Clo Bowler"],
  [506908, "cle-wash-basin", "Cle Wash Basin"],
  [506909, "clo-t-hanger", "Clo T Hanger"],
  [506910, "clo-converse", "Clo Converse"],
  [506911, "clo-polo", "Clo Polo"],
  [506912, "clo-briefs", "Clo Briefs"],
  [506913, "com-keyboard", "Com Keyboard"],
  [506914, "con-circular-saw", "Con Circular Saw"],
  [506915, "com-mouse-wireless-mac", "Com Mouse Wireless Mac"],
  [506916, "com-mac-old", "Com Mac Old"],
  [506917, "com-usb-stock", "Com Usb Stock"],
  [506918, "com-laptop-code", "Com Laptop Code"],
  [506919, "con-drill", "Con Drill"],
  [506920, "con-ruler-pencil", "Con Ruler Pencil"],
  [506921, "con-warning", "Con Warning"],
  [506922, "db-copy", "Db Copy"],
  [506923, "db-network-2", "Db Network 2"],
  [506924, "con-protractor", "Con Protractor"],
  [506925, "db-row-height", "Db Row Height"],
  [506926, "db-table", "Db Table"],
  [506927, "des-pour", "Des Pour"],
  [506928, "des-palette", "Des Palette"],
  [506929, "db-tables-swap", "Db Tables Swap"],
  [506930, "des-ink-well", "Des Ink Well"],
  [506931, "des-protractor", "Des Protractor"],
  [506932, "gen-flag-6", "Gen Flag 6"],
  [506933, "gen-heart-rate", "Gen Heart Rate"],
  [506934, "gen-jewel", "Gen Jewel"],
  [506935, "des-wand-2", "Des Wand 2"],
  [506936, "gen-lifebelt", "Gen Lifebelt"],
  [506937, "gen-pill", "Gen Pill"],
  [506938, "cel-rings-love", "Cel Rings Love"],
  [506939, "cel-balloons", "Cel Balloons"],
  [506940, "cel-reindeer", "Cel Reindeer"],
  [506941, "cel-cake-wedding", "Cel Cake Wedding"],
  [506942, "cel-snow-globe", "Cel Snow Globe"],
  [506943, "cha-bubbles-two", "Cha Bubbles Two"],
  [506944, "cha-cloud", "Cha Cloud"],
  [506945, "cha-bubble-female", "Cha Bubble Female"],
];

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const assetsRoot = resolve(appRoot, "public/specimens");
const manifestPath = resolve(appRoot, "src/specimens/manifest.json");

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

async function fetchOriginal(sourceId, slug) {
  const url = `${downloadBase}/${sourceId}/${slug}.svg`;
  let response;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    response = await fetch(url, {
      headers: {
        Accept: "image/svg+xml,application/xml;q=0.9,*/*;q=0.8",
        "User-Agent":
          "Mozilla/5.0 (compatible; svg-motion-docs/0.1; +https://svg-motion.baole.space)",
      },
    });
    if (response.ok) break;
    if (response.status !== 429 || attempt === 3) {
      throw new Error(
        `Unable to acquire specimen ${sourceId}: ${response.status}`,
      );
    }
    await delay(500 * 2 ** attempt);
  }

  const svg = (await response.text()).trim().concat("\n");
  if (
    (svg.match(/<svg\b/g)?.length ?? 0) !== 1 ||
    !/<svg\b[^>]*\bviewBox="[^"]+"/i.test(svg) ||
    /<script|<foreignObject|\son\w+=|javascript:|<image|<use|(?:href|src)=["'](?:https?:|\/\/)/i.test(
      svg,
    )
  ) {
    throw new Error(`Unsafe or invalid SVG acquired for ${slug}.`);
  }
  return svg;
}

await mkdir(assetsRoot, { recursive: true });
const specimens = [];
for (const [sourceId, slug, originalName] of expected) {
  const svg = await fetchOriginal(sourceId, slug);
  const file = `${slug}.svg`;
  await writeFile(resolve(assetsRoot, file), svg);
  specimens.push({
    slug,
    label: originalName,
    originalName,
    file,
    sourceId,
    sha256: createHash("sha256").update(svg).digest("hex"),
  });
  await delay(100);
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
      collectionId: "pixellove-bordered-vectors",
      collectionName: "Pixellove Bordered Vectors",
      creator: "Pixellove",
      creatorUrl: "https://www.svgrepo.com/author/pixellove/",
      sourceUrl,
      acquisitionDate: "2026-08-15",
      license: "Public Domain (CC0)",
      specimens,
    },
    null,
    2,
  )}\n`,
);
