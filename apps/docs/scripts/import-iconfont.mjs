import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const collectionUrl = "https://www.iconfont.cn/collections/detail?cid=54491";
const expected = [
  ["芒果汁", "mango-juice", "Mango juice"],
  ["粥", "congee", "Congee"],
  ["核桃露", "walnut-drink", "Walnut drink"],
  ["矿泉水", "mineral-water", "Mineral water"],
  ["汤", "soup", "Soup"],
  ["苏打水", "soda-water", "Soda water"],
  ["咖啡", "coffee", "Coffee"],
  ["啤酒", "beer", "Beer"],
  ["可乐", "cola", "Cola"],
  ["牛奶", "milk", "Milk"],
  ["杏仁露", "almond-drink", "Almond drink"],
  ["西瓜汁", "watermelon-juice", "Watermelon juice"],
  ["汽水", "soft-drink", "Soft drink"],
  ["番茄汁", "tomato-juice", "Tomato juice"],
  ["奶茶", "milk-tea", "Milk tea"],
  ["椰汁", "coconut-drink", "Coconut drink"],
  ["苹果汁", "apple-juice", "Apple juice"],
  ["其他果汁", "mixed-juice", "Mixed juice"],
  ["酸奶", "yogurt", "Yogurt"],
  ["柠檬汁", "lemon-juice", "Lemon juice"],
  ["中药", "herbal-medicine", "Herbal medicine"],
];

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const assetsRoot = resolve(appRoot, "public/specimens");
const manifestPath = resolve(appRoot, "src/specimens/manifest.json");

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.goto(collectionUrl, { waitUntil: "networkidle", timeout: 60_000 });
  const extracted = await page
    .locator('svg.icon[viewBox="0 0 1024 1024"]')
    .evaluateAll((icons) =>
      icons.map((icon) => ({
        name: icon.parentElement?.parentElement?.innerText?.trim() ?? "",
        svg: icon.outerHTML,
      })),
    );
  if (extracted.length !== expected.length) {
    throw new Error(
      `Expected ${expected.length} icons, received ${extracted.length}.`,
    );
  }

  await mkdir(assetsRoot, { recursive: true });
  await mkdir(dirname(manifestPath), { recursive: true });
  const specimens = [];
  for (const [index, [chineseName, slug, label]] of expected.entries()) {
    const source = extracted[index];
    if (!source || source.name !== chineseName) {
      throw new Error(
        `Collection order mismatch at ${index}: ${source?.name}.`,
      );
    }
    const svg = source.svg
      .replace(/\sclass="icon"/, "")
      .replace(/\sxmlns="http:\/\/www\.w3\.org\/2000\/svg"/g, "")
      .replace(/^<svg\b/, '<svg xmlns="http://www.w3.org/2000/svg" role="img"')
      .replace(/><path/, `><title>${label}</title><path`)
      .replace(/>\s*</g, "><")
      .trim()
      .concat("\n");
    if (
      (svg.match(/<svg\b/g)?.length ?? 0) !== 1 ||
      /<script|<foreignObject|\son\w+=|javascript:|<image|<use|href=/i.test(svg)
    ) {
      throw new Error(`Unsafe SVG generated for ${slug}.`);
    }
    const file = `${slug}.svg`;
    await writeFile(resolve(assetsRoot, file), svg);
    specimens.push({
      slug,
      label,
      chineseName,
      file,
      sha256: createHash("sha256").update(svg).digest("hex"),
    });
  }

  await writeFile(
    manifestPath,
    `${JSON.stringify(
      {
        collectionId: 54491,
        collectionName: "果汁饮品",
        creator: "美少女壮士a",
        sourceUrl: collectionUrl,
        acquisitionDate: "2026-08-15",
        rights:
          "Commercial use and raw SVG redistribution confirmed by the repository owner.",
        specimens,
      },
      null,
      2,
    )}\n`,
  );
} finally {
  await browser.close();
}
