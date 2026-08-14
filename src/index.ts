import createDOMPurify from "dompurify";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const INSTANCE_SEQUENCE = Symbol.for(
  "@baole-space/svg-motion.instance-sequence",
);

const FORBIDDEN_TAGS = [
  "script",
  "foreignObject",
  "iframe",
  "object",
  "embed",
  "link",
  "style",
  "animate",
  "animateMotion",
  "animateTransform",
  "set",
  "discard",
];

const SAFE_STYLE_PROPERTIES = new Set([
  "alignment-baseline",
  "baseline-shift",
  "clip-path",
  "clip-rule",
  "color",
  "color-interpolation",
  "color-interpolation-filters",
  "color-rendering",
  "cursor",
  "direction",
  "display",
  "dominant-baseline",
  "fill",
  "fill-opacity",
  "fill-rule",
  "filter",
  "flood-color",
  "flood-opacity",
  "font-family",
  "font-size",
  "font-stretch",
  "font-style",
  "font-variant",
  "font-weight",
  "glyph-orientation-horizontal",
  "glyph-orientation-vertical",
  "image-rendering",
  "letter-spacing",
  "lighting-color",
  "marker-end",
  "marker-mid",
  "marker-start",
  "mask",
  "opacity",
  "overflow",
  "paint-order",
  "pointer-events",
  "shape-rendering",
  "stop-color",
  "stop-opacity",
  "stroke",
  "stroke-dasharray",
  "stroke-dashoffset",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-miterlimit",
  "stroke-opacity",
  "stroke-width",
  "text-anchor",
  "text-decoration",
  "text-rendering",
  "transform-origin",
  "unicode-bidi",
  "vector-effect",
  "visibility",
  "white-space",
  "word-spacing",
  "writing-mode",
]);

const SAFE_BITMAP_DATA_URL =
  /^data:image\/(?:png|jpeg|gif|webp|avif);base64,[a-z\d+/=\s]+$/i;
const LOCAL_URL_REFERENCE = /^#[^\s]+$/;
const HAS_URL_FUNCTION = /url\s*\(/i;
const DANGEROUS_CSS =
  /(?:expression\s*\(|javascript\s*:|@import|-moz-binding|behavior\s*:)/i;
const RESOURCE_PRESENTATION_ATTRIBUTES = new Set([
  "clip-path",
  "cursor",
  "fill",
  "filter",
  "marker-end",
  "marker-mid",
  "marker-start",
  "mask",
  "stroke",
]);

export type SvgSource = string | URL | Blob | File | SVGSVGElement;

export type SvgTrustMode = "sanitize" | "trusted";

export interface PrepareSvgOptions {
  trust?: SvgTrustMode;
  maxBytes?: number;
  signal?: AbortSignal;
}

export const SVG_PREPARATION_ERROR_CODES = {
  aborted: "ABORTED",
  fetchFailed: "FETCH_FAILED",
  invalidSvg: "INVALID_SVG",
  sanitizationFailed: "SANITIZATION_FAILED",
  sourceTooLarge: "SOURCE_TOO_LARGE",
  unsupportedEnvironment: "UNSUPPORTED_ENVIRONMENT",
  unsupportedSource: "UNSUPPORTED_SOURCE",
} as const;

export type SvgPreparationErrorCode =
  (typeof SVG_PREPARATION_ERROR_CODES)[keyof typeof SVG_PREPARATION_ERROR_CODES];

export class SvgPreparationError extends Error {
  readonly code: SvgPreparationErrorCode;

  constructor(code: SvgPreparationErrorCode, message: string) {
    super(message);
    this.name = "SvgPreparationError";
    this.code = code;
  }
}

export type SvgDiagnosticCode =
  "REMOVED_UNSAFE_CONTENT" | "REMOVED_EXTERNAL_REFERENCE";

export interface SvgDiagnostic {
  code: SvgDiagnosticCode;
  count: number;
}

export interface PreparedSvg {
  svg: SVGSVGElement;
  diagnostics: SvgDiagnostic[];
}

interface RemovalCounts {
  unsafe: number;
  external: number;
}

interface GlobalWithSequence {
  [INSTANCE_SEQUENCE]?: number;
}

function preparationError(code: SvgPreparationErrorCode): SvgPreparationError {
  const messages: Record<SvgPreparationErrorCode, string> = {
    ABORTED: "SVG preparation was aborted.",
    FETCH_FAILED: "The SVG source could not be fetched.",
    INVALID_SVG: "The source is not a valid SVG document.",
    SANITIZATION_FAILED: "The SVG source could not be sanitized.",
    SOURCE_TOO_LARGE: "The SVG source exceeds the configured size limit.",
    UNSUPPORTED_ENVIRONMENT:
      "SVG preparation requires a browser DOM environment.",
    UNSUPPORTED_SOURCE: "The SVG source type is not supported.",
  };

  return new SvgPreparationError(code, messages[code]);
}

function ensureDomEnvironment(): void {
  if (
    typeof window === "undefined" ||
    typeof document === "undefined" ||
    typeof DOMParser === "undefined" ||
    typeof XMLSerializer === "undefined"
  ) {
    throw preparationError("UNSUPPORTED_ENVIRONMENT");
  }
}

function abortIfNeeded(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw preparationError("ABORTED");
  }
}

function assertWithinLimit(byteLength: number, maxBytes: number): void {
  if (byteLength > maxBytes) {
    throw preparationError("SOURCE_TOO_LARGE");
  }
}

function isSvgElement(value: unknown): value is SVGSVGElement {
  return (
    typeof value === "object" &&
    value !== null &&
    "localName" in value &&
    value.localName === "svg" &&
    "namespaceURI" in value &&
    value.namespaceURI === SVG_NAMESPACE &&
    "cloneNode" in value
  );
}

function isBlob(value: unknown): value is Blob {
  return typeof Blob !== "undefined" && value instanceof Blob;
}

function resolveUrl(source: string | URL): URL {
  if (source instanceof URL) return source;

  try {
    return new URL(source, document.baseURI);
  } catch {
    throw preparationError("FETCH_FAILED");
  }
}

async function readFetchedSource(
  source: string | URL,
  maxBytes: number,
  signal: AbortSignal | undefined,
): Promise<string> {
  try {
    const response = await fetch(resolveUrl(source), signal ? { signal } : {});
    abortIfNeeded(signal);

    if (!response.ok) throw preparationError("FETCH_FAILED");

    const declaredLengthHeader = response.headers.get("content-length");
    if (declaredLengthHeader !== null) {
      const declaredLength = Number(declaredLengthHeader);
      if (Number.isFinite(declaredLength) && declaredLength >= 0) {
        if (declaredLength > maxBytes) {
          await cancelBestEffort(response.body);
          throw preparationError("SOURCE_TOO_LARGE");
        }
      }
    }

    const bytes = await readResponseBytes(response, maxBytes, signal);
    abortIfNeeded(signal);
    return new TextDecoder().decode(bytes);
  } catch (error) {
    if (error instanceof SvgPreparationError) throw error;
    if (
      signal?.aborted ||
      (error instanceof DOMException && error.name === "AbortError")
    ) {
      throw preparationError("ABORTED");
    }
    throw preparationError("FETCH_FAILED");
  }
}

interface Cancellable {
  cancel(reason?: unknown): Promise<void>;
}

async function cancelBestEffort(target: Cancellable | null | undefined) {
  try {
    await target?.cancel();
  } catch {
    // Cancellation must not replace the typed size-limit error.
  }
}

async function readResponseBytes(
  response: Response,
  maxBytes: number,
  signal: AbortSignal | undefined,
): Promise<Uint8Array> {
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    assertWithinLimit(bytes.byteLength, maxBytes);
    return bytes;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;

  try {
    while (true) {
      abortIfNeeded(signal);
      const { done, value } = await reader.read();
      if (done) break;

      byteLength += value.byteLength;
      if (byteLength > maxBytes) {
        await cancelBestEffort(reader);
        throw preparationError("SOURCE_TOO_LARGE");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function readBlobSource(
  source: Blob,
  maxBytes: number,
  signal: AbortSignal | undefined,
): Promise<string> {
  assertWithinLimit(source.size, maxBytes);
  abortIfNeeded(signal);
  const bytes = await source.arrayBuffer();
  abortIfNeeded(signal);
  assertWithinLimit(bytes.byteLength, maxBytes);
  return new TextDecoder().decode(bytes);
}

function parseSvg(markup: string): SVGSVGElement {
  const parsed = new DOMParser().parseFromString(markup, "image/svg+xml");
  const root = parsed.documentElement;

  if (
    root.localName === "parsererror" ||
    parsed.querySelector("parsererror") !== null ||
    !isSvgElement(root)
  ) {
    throw preparationError("INVALID_SVG");
  }

  return root;
}

function serializeSvg(svg: SVGSVGElement): string {
  return new XMLSerializer().serializeToString(svg);
}

async function loadSource(
  source: SvgSource,
  maxBytes: number,
  signal: AbortSignal | undefined,
): Promise<SVGSVGElement> {
  if (isSvgElement(source)) {
    const markup = serializeSvg(source);
    assertWithinLimit(new TextEncoder().encode(markup).byteLength, maxBytes);
    return source.cloneNode(true) as SVGSVGElement;
  }

  let markup: string;
  if (typeof source === "string") {
    if (source.trimStart().startsWith("<")) {
      assertWithinLimit(new TextEncoder().encode(source).byteLength, maxBytes);
      markup = source;
    } else {
      markup = await readFetchedSource(source, maxBytes, signal);
    }
  } else if (source instanceof URL) {
    markup = await readFetchedSource(source, maxBytes, signal);
  } else if (isBlob(source)) {
    markup = await readBlobSource(source, maxBytes, signal);
  } else {
    throw preparationError("UNSUPPORTED_SOURCE");
  }

  abortIfNeeded(signal);
  return parseSvg(markup);
}

function isAllowedHref(element: Element, value: string): boolean {
  const trimmed = value.trim();
  if (LOCAL_URL_REFERENCE.test(trimmed)) return true;
  return element.localName === "image" && SAFE_BITMAP_DATA_URL.test(trimmed);
}

interface ParsedCssEscape {
  decoded: string;
  end: number;
}

interface ParsedCssToken {
  decoded: string;
  end: number;
}

interface ParsedCssUrl {
  target: string;
  end: number;
}

function isCssWhitespace(character: string | undefined): boolean {
  return character !== undefined && /[\t\n\f\r ]/.test(character);
}

function parseCssEscape(
  value: string,
  start: number,
): ParsedCssEscape | undefined {
  if (value[start] !== "\\" || start + 1 >= value.length) return undefined;

  let cursor = start + 1;
  const next = value[cursor];
  if (next === "\n" || next === "\r" || next === "\f") return undefined;

  let hexadecimal = "";
  while (
    cursor < value.length &&
    hexadecimal.length < 6 &&
    /[\da-f]/i.test(value[cursor] ?? "")
  ) {
    hexadecimal += value[cursor];
    cursor += 1;
  }

  if (hexadecimal.length > 0) {
    const codePoint = Number.parseInt(hexadecimal, 16);
    if (isCssWhitespace(value[cursor])) {
      if (value[cursor] === "\r" && value[cursor + 1] === "\n") cursor += 1;
      cursor += 1;
    }
    return {
      decoded:
        codePoint === 0 ||
        codePoint > 0x10ffff ||
        (codePoint >= 0xd800 && codePoint <= 0xdfff)
          ? "�"
          : String.fromCodePoint(codePoint),
      end: cursor,
    };
  }

  return { decoded: next ?? "", end: cursor + 1 };
}

function parseCssIdentifier(
  value: string,
  start: number,
): ParsedCssToken | undefined {
  let cursor = start;
  let decoded = "";

  while (cursor < value.length) {
    const character = value[cursor];
    if (character === "\\") {
      const escape = parseCssEscape(value, cursor);
      if (!escape) break;
      decoded += escape.decoded;
      cursor = escape.end;
      continue;
    }

    const codePoint = character?.codePointAt(0);
    if (
      character !== undefined &&
      (/[\w-]/.test(character) ||
        (codePoint !== undefined && codePoint >= 0x80))
    ) {
      decoded += character;
      cursor += character.length;
      continue;
    }
    break;
  }

  return cursor === start ? undefined : { decoded, end: cursor };
}

function parseCssUrl(value: string, start: number): ParsedCssUrl | undefined {
  const functionMatch = /^url\s*\(/i.exec(value.slice(start));
  if (!functionMatch) return undefined;

  let cursor = start + functionMatch[0].length;
  while (isCssWhitespace(value[cursor])) cursor += 1;

  const quote =
    value[cursor] === '"' || value[cursor] === "'" ? value[cursor] : undefined;
  if (quote) cursor += 1;

  let target = "";
  while (cursor < value.length) {
    const character = value[cursor];
    if (character === "\\") {
      const escape = parseCssEscape(value, cursor);
      if (!escape) return undefined;
      target += escape.decoded;
      cursor = escape.end;
      continue;
    }
    if (
      (quote && character === quote) ||
      (!quote && (character === ")" || isCssWhitespace(character)))
    ) {
      break;
    }
    target += character;
    cursor += 1;
  }

  if (quote) {
    if (value[cursor] !== quote) return undefined;
    cursor += 1;
  }
  while (isCssWhitespace(value[cursor])) cursor += 1;
  if (value[cursor] !== ")") return undefined;

  return { target, end: cursor + 1 };
}

function consumeCssQuotedValue(value: string, start: number): number {
  const quote = value[start];
  let cursor = start + 1;
  while (cursor < value.length) {
    if (value[cursor] === "\\") {
      cursor = parseCssEscape(value, cursor)?.end ?? cursor + 1;
    } else if (value[cursor] === quote) {
      return cursor + 1;
    } else {
      cursor += 1;
    }
  }
  return cursor;
}

function transformCssUrls(
  value: string,
  transform: (target: string) => string | undefined,
): string {
  let output = "";
  let cursor = 0;

  while (cursor < value.length) {
    if (value.startsWith("/*", cursor)) {
      const commentEnd = value.indexOf("*/", cursor + 2);
      const end = commentEnd === -1 ? value.length : commentEnd + 2;
      output += value.slice(cursor, end);
      cursor = end;
      continue;
    }
    if (value[cursor] === '"' || value[cursor] === "'") {
      const end = consumeCssQuotedValue(value, cursor);
      output += value.slice(cursor, end);
      cursor = end;
      continue;
    }

    const parsed = parseCssUrl(value, cursor);
    if (parsed) {
      output += transform(parsed.target) ?? value.slice(cursor, parsed.end);
      cursor = parsed.end;
      continue;
    }

    output += value[cursor];
    cursor += 1;
  }

  return output;
}

function countExternalCssReferences(value: string): number {
  let count = 0;
  transformCssUrls(value, (target) => {
    if (!LOCAL_URL_REFERENCE.test(target.trim())) count += 1;
    return undefined;
  });
  return count;
}

function countExternalReferences(svg: SVGSVGElement): number {
  let count = 0;

  for (const element of [svg, ...svg.querySelectorAll("*")]) {
    if (element.localName === "style") {
      const stylesheet = element.textContent ?? "";
      if (/@import/i.test(stylesheet)) count += 1;
      count += countExternalCssReferences(stylesheet);
    }

    for (const attribute of element.attributes) {
      const name = attribute.localName.toLowerCase();
      const value = attribute.value;

      if (name === "href" && !isAllowedHref(element, value)) {
        count += 1;
        continue;
      }

      count += countExternalCssReferences(value);
    }
  }

  return count;
}

function hasOnlyLocalUrlFunctions(value: string): boolean {
  return countExternalCssReferences(value) === 0;
}

function sanitizeStyle(element: Element): number {
  if (!element.hasAttribute("style")) return 0;

  const declaration = (element as SVGElement).style;
  const safeDeclarations: string[] = [];
  let removed = 0;

  for (let index = 0; index < declaration.length; index += 1) {
    const property = declaration.item(index).toLowerCase();
    const value = declaration.getPropertyValue(property).trim();

    if (
      !SAFE_STYLE_PROPERTIES.has(property) ||
      DANGEROUS_CSS.test(value) ||
      !hasOnlyLocalUrlFunctions(value)
    ) {
      removed += 1;
      continue;
    }

    safeDeclarations.push(`${property}: ${value}`);
  }

  if (safeDeclarations.length === 0) {
    element.removeAttribute("style");
  } else {
    element.setAttribute("style", safeDeclarations.join("; "));
  }

  return removed;
}

function enforceSafeAttributes(svg: SVGSVGElement): RemovalCounts {
  const counts: RemovalCounts = { unsafe: 0, external: 0 };

  for (const element of [svg, ...svg.querySelectorAll("*")]) {
    for (const attribute of [...element.attributes]) {
      const name = attribute.localName.toLowerCase();
      const value = attribute.value;

      if (name === "style") {
        continue;
      } else if (name.startsWith("on")) {
        element.removeAttributeNode(attribute);
        counts.unsafe += 1;
      } else if (name === "href" && !isAllowedHref(element, value)) {
        element.removeAttributeNode(attribute);
        counts.external += 1;
      } else if (
        (RESOURCE_PRESENTATION_ATTRIBUTES.has(name) &&
          (DANGEROUS_CSS.test(value) || value.includes("\\"))) ||
        (HAS_URL_FUNCTION.test(value) && !hasOnlyLocalUrlFunctions(value))
      ) {
        element.removeAttributeNode(attribute);
        counts.external += HAS_URL_FUNCTION.test(value) ? 1 : 0;
        counts.external +=
          RESOURCE_PRESENTATION_ATTRIBUTES.has(name) && value.includes("\\")
            ? 1
            : 0;
        counts.unsafe += HAS_URL_FUNCTION.test(value) ? 0 : 1;
      }
    }

    counts.unsafe += sanitizeStyle(element);
  }

  return counts;
}

function sanitizeSvg(source: SVGSVGElement): {
  svg: SVGSVGElement;
  counts: RemovalCounts;
} {
  const externalBeforeSanitizing = countExternalReferences(source);

  try {
    const purifier = createDOMPurify(window);
    const fragment = purifier.sanitize(serializeSvg(source), {
      ADD_ATTR: ["href", "xlink:href"],
      ADD_DATA_URI_TAGS: ["image"],
      ADD_TAGS: ["use"],
      ALLOW_DATA_ATTR: false,
      FORBID_TAGS: FORBIDDEN_TAGS,
      KEEP_CONTENT: false,
      RETURN_DOM_FRAGMENT: true,
      SAFE_FOR_XML: true,
      USE_PROFILES: { svg: true, svgFilters: true },
    });
    const root = [...fragment.childNodes].find(isSvgElement);

    if (!root) throw preparationError("SANITIZATION_FAILED");

    const enforced = enforceSafeAttributes(root);
    const purifierRemovalCount = purifier.removed.filter(
      (removal) =>
        !("element" in removal && removal.element.nodeName === "BODY") &&
        !(
          "attribute" in removal &&
          removal.attribute?.name.toLowerCase().startsWith("xmlns")
        ),
    ).length;
    return {
      svg: root,
      counts: {
        unsafe: purifierRemovalCount + enforced.unsafe,
        external: Math.max(externalBeforeSanitizing, enforced.external),
      },
    };
  } catch (error) {
    if (error instanceof SvgPreparationError) throw error;
    throw preparationError("SANITIZATION_FAILED");
  }
}

function nextNamespacePrefix(): string {
  const scope = globalThis as GlobalWithSequence;
  const sequence = (scope[INSTANCE_SEQUENCE] ?? 0) + 1;
  scope[INSTANCE_SEQUENCE] = sequence;
  return `svg-motion-${sequence}-`;
}

function cssEscapeIdentifier(value: string): string {
  const characters = Array.from(value);
  return characters
    .map((character, index) => {
      const codePoint = character.codePointAt(0) ?? 0;
      if (codePoint === 0) return "�";
      if (
        (codePoint >= 1 && codePoint <= 31) ||
        codePoint === 127 ||
        (index === 0 && /\d/.test(character)) ||
        (index === 1 && /\d/.test(character) && characters[0] === "-")
      ) {
        return `\\${codePoint.toString(16)} `;
      }
      if (index === 0 && character === "-" && characters.length === 1)
        return "\\-";
      if (codePoint >= 128 || /[\w-]/.test(character)) return character;
      return `\\${character}`;
    })
    .join("");
}

function rewriteLocalUrlReferences(
  value: string,
  ids: ReadonlyMap<string, string>,
): string {
  return transformCssUrls(value, (target) => {
    const trimmed = target.trim();
    if (!trimmed.startsWith("#")) return undefined;
    const rewritten = ids.get(trimmed.slice(1));
    return rewritten ? `url(#${cssEscapeIdentifier(rewritten)})` : undefined;
  });
}

function rewriteHrefReference(
  value: string,
  ids: ReadonlyMap<string, string>,
): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("#")) {
    const rewritten = ids.get(trimmed.slice(1));
    if (rewritten) return `#${rewritten}`;
  }
  return value;
}

function rewriteSelectorIds(
  selector: string,
  ids: ReadonlyMap<string, string>,
): string {
  let output = "";
  let cursor = 0;
  let attributeDepth = 0;

  while (cursor < selector.length) {
    if (selector.startsWith("/*", cursor)) {
      const commentEnd = selector.indexOf("*/", cursor + 2);
      const end = commentEnd === -1 ? selector.length : commentEnd + 2;
      output += selector.slice(cursor, end);
      cursor = end;
      continue;
    }
    if (selector[cursor] === '"' || selector[cursor] === "'") {
      const end = consumeCssQuotedValue(selector, cursor);
      output += selector.slice(cursor, end);
      cursor = end;
      continue;
    }
    if (selector[cursor] === "\\") {
      const end = parseCssEscape(selector, cursor)?.end ?? cursor + 1;
      output += selector.slice(cursor, end);
      cursor = end;
      continue;
    }
    if (selector[cursor] === "[") {
      attributeDepth += 1;
    } else if (selector[cursor] === "]") {
      attributeDepth = Math.max(0, attributeDepth - 1);
    } else if (selector[cursor] === "#" && attributeDepth === 0) {
      const parsed = parseCssIdentifier(selector, cursor + 1);
      if (parsed) {
        const rewritten = ids.get(parsed.decoded);
        if (rewritten) {
          output += `#${cssEscapeIdentifier(rewritten)}`;
          cursor = parsed.end;
          continue;
        }
      }
    }

    output += selector[cursor];
    cursor += 1;
  }

  return output;
}

function rewriteStylesheetReferences(
  stylesheet: string,
  ids: ReadonlyMap<string, string>,
): string {
  const withUrls = rewriteLocalUrlReferences(stylesheet, ids);
  let output = "";
  let cursor = 0;
  const blockTypes: Array<"declaration" | "group"> = [];
  let quote: '"' | "'" | undefined;
  let inComment = false;

  for (let index = 0; index < withUrls.length; index += 1) {
    const character = withUrls[index];
    const next = withUrls[index + 1];

    if (inComment) {
      if (character === "*" && next === "/") {
        inComment = false;
        index += 1;
      }
      continue;
    }
    if (!quote && character === "/" && next === "*") {
      inComment = true;
      index += 1;
      continue;
    }
    if (quote) {
      if (character === "\\") {
        index += 1;
      } else if (character === quote) {
        quote = undefined;
      }
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }

    if (character === "{") {
      const prelude = withUrls.slice(cursor, index);
      const trimmedPrelude = prelude.trimStart();
      const parentAllowsRules =
        blockTypes.length === 0 || blockTypes.at(-1) === "group";
      const isGroupingAtRule =
        parentAllowsRules &&
        /^@(?:container|document|layer|media|scope|supports|-webkit-keyframes|keyframes)\b/i.test(
          trimmedPrelude,
        );

      output +=
        parentAllowsRules && !trimmedPrelude.startsWith("@")
          ? rewriteSelectorIds(prelude, ids)
          : prelude;
      output += character;
      cursor = index + 1;
      blockTypes.push(isGroupingAtRule ? "group" : "declaration");
    } else if (character === "}") {
      output += withUrls.slice(cursor, index + 1);
      cursor = index + 1;
      blockTypes.pop();
    }
  }

  return output + withUrls.slice(cursor);
}

function namespaceIds(svg: SVGSVGElement): void {
  const ids = new Map<string, string>();
  const prefix = nextNamespacePrefix();

  for (const element of [svg, ...svg.querySelectorAll("[id]")]) {
    const id = element.getAttribute("id");
    if (id) ids.set(id, `${prefix}${id}`);
  }

  for (const element of [svg, ...svg.querySelectorAll("*")]) {
    const id = element.getAttribute("id");
    if (id) element.setAttribute("id", ids.get(id) ?? `${prefix}${id}`);

    if (element.localName === "style" && element.textContent) {
      element.textContent = rewriteStylesheetReferences(
        element.textContent,
        ids,
      );
    }

    for (const attribute of [...element.attributes]) {
      const withRewrittenUrls = rewriteLocalUrlReferences(attribute.value, ids);
      const rewritten =
        attribute.localName.toLowerCase() === "href"
          ? rewriteHrefReference(withRewrittenUrls, ids)
          : withRewrittenUrls;
      if (rewritten !== attribute.value)
        element.setAttribute(attribute.name, rewritten);
    }

    for (const attributeName of ["aria-labelledby", "aria-describedby"]) {
      const value = element.getAttribute(attributeName);
      if (!value) continue;
      element.setAttribute(
        attributeName,
        value
          .split(/\s+/)
          .map((idReference) => ids.get(idReference) ?? idReference)
          .join(" "),
      );
    }
  }
}

function createDiagnostics(counts: RemovalCounts): SvgDiagnostic[] {
  const diagnostics: SvgDiagnostic[] = [];
  if (counts.unsafe > 0) {
    diagnostics.push({ code: "REMOVED_UNSAFE_CONTENT", count: counts.unsafe });
  }
  if (counts.external > 0) {
    diagnostics.push({
      code: "REMOVED_EXTERNAL_REFERENCE",
      count: counts.external,
    });
  }
  return diagnostics;
}

export async function prepareSvg(
  source: SvgSource,
  options: PrepareSvgOptions = {},
): Promise<PreparedSvg> {
  ensureDomEnvironment();
  abortIfNeeded(options.signal);

  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const loaded = await loadSource(source, maxBytes, options.signal);
  abortIfNeeded(options.signal);

  const prepared =
    (options.trust ?? "sanitize") === "trusted"
      ? { svg: loaded, counts: { unsafe: 0, external: 0 } }
      : sanitizeSvg(loaded);

  abortIfNeeded(options.signal);
  namespaceIds(prepared.svg);

  return {
    svg: prepared.svg,
    diagnostics: createDiagnostics(prepared.counts),
  };
}
