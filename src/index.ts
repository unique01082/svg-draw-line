import createDOMPurify from "dompurify";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const INSTANCE_SEQUENCE = Symbol.for("@baolq/svg-motion.instance-sequence");
const FAILED_SETUP_ANIMATIONS = new WeakMap<SVGSVGElement, Animation[]>();

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
  "d",
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
  "transform",
  "transform-box",
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
const ARIA_ID_REFERENCE_ATTRIBUTES = new Set([
  "aria-activedescendant",
  "aria-controls",
  "aria-describedby",
  "aria-details",
  "aria-errormessage",
  "aria-flowto",
  "aria-labelledby",
  "aria-owns",
]);
const REFERENCE_SELECTOR_ATTRIBUTES = new Set([
  "id",
  "href",
  "xlink:href",
  ...ARIA_ID_REFERENCE_ATTRIBUTES,
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
  | "REMOVED_UNSAFE_CONTENT"
  | "REMOVED_EXTERNAL_REFERENCE"
  | "NO_DRAWABLE_GEOMETRY";

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

function validateMaxBytes(maxBytes: number): void {
  if (
    !Number.isFinite(maxBytes) ||
    !Number.isInteger(maxBytes) ||
    maxBytes < 0
  ) {
    throw new RangeError("maxBytes must be a finite non-negative integer.");
  }
}

function isSvgNamespaceElement(value: unknown): value is SVGElement {
  try {
    return (
      typeof value === "object" &&
      value !== null &&
      (value as Element).nodeType === 1 &&
      (value as Element).namespaceURI === SVG_NAMESPACE &&
      typeof (value as Element).localName === "string"
    );
  } catch {
    return false;
  }
}

function isSvgElement(value: unknown): value is SVGSVGElement {
  try {
    return (
      isSvgNamespaceElement(value) &&
      value.localName === "svg" &&
      typeof value.cloneNode === "function" &&
      typeof value.querySelectorAll === "function"
    );
  } catch {
    return false;
  }
}

function isBlob(value: unknown): value is Blob {
  if (typeof Blob === "undefined") return false;
  try {
    Blob.prototype.slice.call(value as Blob, 0, 0);
    return true;
  } catch {
    return false;
  }
}

function isUrl(value: unknown): value is URL {
  if (typeof URL === "undefined") return false;
  try {
    URL.prototype.toString.call(value as URL);
    return true;
  } catch {
    return false;
  }
}

function resolveUrl(source: string | URL): URL {
  try {
    const value =
      typeof source === "string" ? source : URL.prototype.toString.call(source);
    return new URL(value, document.baseURI);
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
  try {
    assertWithinLimit(source.size, maxBytes);
    abortIfNeeded(signal);
    const bytes = await source.arrayBuffer();
    abortIfNeeded(signal);
    assertWithinLimit(bytes.byteLength, maxBytes);
    return new TextDecoder().decode(bytes);
  } catch (error) {
    if (error instanceof SvgPreparationError) throw error;
    abortIfNeeded(signal);
    throw preparationError("UNSUPPORTED_SOURCE");
  }
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
    let markup: string;
    try {
      markup = serializeSvg(source);
    } catch {
      throw preparationError("UNSUPPORTED_SOURCE");
    }
    assertWithinLimit(new TextEncoder().encode(markup).byteLength, maxBytes);
    try {
      const clone = source.cloneNode(true);
      if (clone === source || !isSvgElement(clone)) {
        throw preparationError("UNSUPPORTED_SOURCE");
      }
      return clone;
    } catch {
      throw preparationError("UNSUPPORTED_SOURCE");
    }
  }

  let markup: string;
  if (typeof source === "string") {
    if (source.trimStart().startsWith("<")) {
      assertWithinLimit(new TextEncoder().encode(source).byteLength, maxBytes);
      markup = source;
    } else {
      markup = await readFetchedSource(source, maxBytes, signal);
    }
  } else if (isUrl(source)) {
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

function parseCssUrl(
  value: string,
  functionToken: ParsedCssToken,
): ParsedCssUrl | undefined {
  if (functionToken.decoded.toLowerCase() !== "url") return undefined;

  let cursor = functionToken.end;
  while (isCssWhitespace(value[cursor])) cursor += 1;
  if (value[cursor] !== "(") return undefined;
  cursor += 1;
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

    const identifier = parseCssIdentifier(value, cursor);
    if (identifier) {
      const parsed = parseCssUrl(value, identifier);
      if (parsed) {
        output += transform(parsed.target) ?? value.slice(cursor, parsed.end);
        cursor = parsed.end;
      } else {
        output += value.slice(cursor, identifier.end);
        cursor = identifier.end;
      }
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

function countStylesheetImportRules(stylesheet: string): number {
  let count = 0;
  let cursor = 0;
  let depth = 0;
  let canStartRule = true;

  while (cursor < stylesheet.length) {
    if (stylesheet.startsWith("/*", cursor)) {
      const commentEnd = stylesheet.indexOf("*/", cursor + 2);
      cursor = commentEnd === -1 ? stylesheet.length : commentEnd + 2;
      continue;
    }
    if (stylesheet[cursor] === '"' || stylesheet[cursor] === "'") {
      cursor = consumeCssQuotedValue(stylesheet, cursor);
      if (depth === 0) canStartRule = false;
      continue;
    }

    const character = stylesheet[cursor];
    if (character === "{") {
      depth += 1;
      canStartRule = false;
    } else if (character === "}") {
      depth = Math.max(0, depth - 1);
      if (depth === 0) canStartRule = true;
    } else if (depth === 0 && character === ";") {
      canStartRule = true;
    } else if (depth === 0 && canStartRule && character === "@") {
      const atRule = parseCssIdentifier(stylesheet, cursor + 1);
      if (atRule?.decoded.toLowerCase() === "import") count += 1;
      canStartRule = false;
      if (atRule) {
        cursor = atRule.end;
        continue;
      }
    } else if (depth === 0 && !isCssWhitespace(character)) {
      canStartRule = false;
    }
    cursor += 1;
  }

  return count;
}

function countExternalReferences(svg: SVGSVGElement): number {
  let count = 0;

  for (const element of [svg, ...svg.querySelectorAll("*")]) {
    if (element.localName === "style") {
      const stylesheet = element.textContent ?? "";
      count += countStylesheetImportRules(stylesheet);
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
    const priority = declaration.getPropertyPriority(property);

    if (
      !SAFE_STYLE_PROPERTIES.has(property) ||
      DANGEROUS_CSS.test(value) ||
      !hasOnlyLocalUrlFunctions(value)
    ) {
      removed += 1;
      continue;
    }

    safeDeclarations.push(
      `${property}: ${value}${priority ? ` !${priority}` : ""}`,
    );
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

function decodeCssEscapes(value: string): string {
  let output = "";
  let cursor = 0;
  while (cursor < value.length) {
    if (value[cursor] === "\\") {
      const escape = parseCssEscape(value, cursor);
      if (escape) {
        output += escape.decoded;
        cursor = escape.end;
        continue;
      }
    }
    output += value[cursor];
    cursor += 1;
  }
  return output;
}

function escapeCssString(value: string, quote: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll(quote, `\\${quote}`)
    .replaceAll("\n", "\\a ")
    .replaceAll("\r", "\\d ")
    .replaceAll("\f", "\\c ");
}

function rewriteReferenceSelectorValue(
  attributeName: string,
  operator: string,
  rawValue: string,
  ids: ReadonlyMap<string, string>,
): string | undefined {
  const value = decodeCssEscapes(rawValue);
  if (attributeName === "id") return ids.get(value);
  if (attributeName === "href" || attributeName === "xlink:href") {
    if (!value.startsWith("#")) return undefined;
    const rewritten = ids.get(value.slice(1));
    return rewritten ? `#${rewritten}` : undefined;
  }
  if (!ARIA_ID_REFERENCE_ATTRIBUTES.has(attributeName)) return undefined;

  const references = operator === "~=" ? [value] : value.split(/\s+/);
  let changed = false;
  const rewritten = references.map((reference) => {
    const mapped = ids.get(reference);
    if (mapped) changed = true;
    return mapped ?? reference;
  });
  return changed ? rewritten.join(" ") : undefined;
}

function rewriteAttributeSelector(
  selector: string,
  ids: ReadonlyMap<string, string>,
): string {
  const match = selector.match(
    /^(\[\s*)([^\s~^$*=\]]+)(\s*)(~=|=)(\s*)(?:(["'])([\s\S]*?)\6|([^\s\]]+))(\s*\])$/,
  );
  if (!match) return selector;

  const [, prefix, rawName, beforeOperator, operator, afterOperator, quote] =
    match;
  const rawValue = quote ? match[7] : match[8];
  const suffix = match[9];
  if (
    prefix === undefined ||
    rawName === undefined ||
    beforeOperator === undefined ||
    operator === undefined ||
    afterOperator === undefined ||
    rawValue === undefined ||
    suffix === undefined
  ) {
    return selector;
  }

  const decodedName = decodeCssEscapes(rawName).toLowerCase();
  const attributeName =
    decodedName === "xlink|href" ? "xlink:href" : decodedName;
  if (!REFERENCE_SELECTOR_ATTRIBUTES.has(attributeName)) return selector;
  const rewritten = rewriteReferenceSelectorValue(
    attributeName,
    operator,
    rawValue,
    ids,
  );
  if (rewritten === undefined) return selector;

  const encodedValue = quote
    ? `${quote}${escapeCssString(rewritten, quote)}${quote}`
    : cssEscapeIdentifier(rewritten);
  return `${prefix}${rawName}${beforeOperator}${operator}${afterOperator}${encodedValue}${suffix}`;
}

function attributeSelectorEnd(selector: string, start: number): number {
  let cursor = start + 1;
  while (cursor < selector.length) {
    if (selector[cursor] === '"' || selector[cursor] === "'") {
      cursor = consumeCssQuotedValue(selector, cursor);
      continue;
    }
    if (selector[cursor] === "\\") {
      cursor = parseCssEscape(selector, cursor)?.end ?? cursor + 1;
      continue;
    }
    if (selector[cursor] === "]") return cursor + 1;
    cursor += 1;
  }
  return selector.length;
}

function rewriteSelectorIds(
  selector: string,
  ids: ReadonlyMap<string, string>,
): string {
  let output = "";
  let cursor = 0;

  while (cursor < selector.length) {
    if (selector.startsWith("/*", cursor)) {
      const commentEnd = selector.indexOf("*/", cursor + 2);
      const end = commentEnd === -1 ? selector.length : commentEnd + 2;
      output += selector.slice(cursor, end);
      cursor = end;
      continue;
    }
    if (selector[cursor] === "[") {
      const end = attributeSelectorEnd(selector, cursor);
      output += rewriteAttributeSelector(selector.slice(cursor, end), ids);
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
    if (selector[cursor] === "#") {
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

function rewriteSelectorFunctions(
  prelude: string,
  ids: ReadonlyMap<string, string>,
): string {
  let output = "";
  let cursor = 0;
  while (cursor < prelude.length) {
    if (prelude.startsWith("/*", cursor)) {
      const commentEnd = prelude.indexOf("*/", cursor + 2);
      const end = commentEnd === -1 ? prelude.length : commentEnd + 2;
      output += prelude.slice(cursor, end);
      cursor = end;
      continue;
    }
    if (prelude[cursor] === '"' || prelude[cursor] === "'") {
      const end = consumeCssQuotedValue(prelude, cursor);
      output += prelude.slice(cursor, end);
      cursor = end;
      continue;
    }

    const identifier = parseCssIdentifier(prelude, cursor);
    if (
      identifier?.decoded.toLowerCase() === "selector" &&
      prelude[identifier.end] === "("
    ) {
      let depth = 1;
      let end = identifier.end + 1;
      while (end < prelude.length && depth > 0) {
        if (prelude.startsWith("/*", end)) {
          const commentEnd = prelude.indexOf("*/", end + 2);
          end = commentEnd === -1 ? prelude.length : commentEnd + 2;
          continue;
        }
        if (prelude[end] === '"' || prelude[end] === "'") {
          end = consumeCssQuotedValue(prelude, end);
          continue;
        }
        if (prelude[end] === "\\") {
          end = parseCssEscape(prelude, end)?.end ?? end + 1;
          continue;
        }
        if (prelude[end] === "(") depth += 1;
        else if (prelude[end] === ")") depth -= 1;
        end += 1;
      }
      if (depth === 0) {
        output += prelude.slice(cursor, identifier.end + 1);
        output += rewriteSelectorIds(
          prelude.slice(identifier.end + 1, end - 1),
          ids,
        );
        output += ")";
        cursor = end;
        continue;
      }
    }

    if (identifier) {
      output += prelude.slice(cursor, identifier.end);
      cursor = identifier.end;
    } else {
      output += prelude[cursor];
      cursor += 1;
    }
  }
  return output;
}

function lastTopLevelSemicolon(value: string): number {
  let last = -1;
  let parentheses = 0;
  let brackets = 0;
  let quote: '"' | "'" | undefined;
  let inComment = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    const next = value[index + 1];
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
      if (character === "\\") index += 1;
      else if (character === quote) quote = undefined;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
    } else if (character === "(") {
      parentheses += 1;
    } else if (character === ")") {
      parentheses = Math.max(0, parentheses - 1);
    } else if (character === "[") {
      brackets += 1;
    } else if (character === "]") {
      brackets = Math.max(0, brackets - 1);
    } else if (character === ";" && parentheses === 0 && brackets === 0) {
      last = index;
    }
  }
  return last;
}

function looksLikeNestedRule(prelude: string): boolean {
  const trimmed = prelude.trimStart();
  if (!trimmed || trimmed.startsWith("--")) return false;
  if (trimmed.startsWith("@")) return true;
  if ("&#.[:>+~*|".includes(trimmed[0] ?? "")) return true;
  if (/^[\w-]+\s*:\s/.test(trimmed)) return false;
  return true;
}

function rewriteRulePrelude(
  prelude: string,
  ids: ReadonlyMap<string, string>,
): string {
  const trimmed = prelude.trimStart();
  return !trimmed.startsWith("@") || /^@scope\b/i.test(trimmed)
    ? rewriteSelectorIds(prelude, ids)
    : rewriteSelectorFunctions(prelude, ids);
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
      const parentAllowsRules =
        blockTypes.length === 0 || blockTypes.at(-1) === "group";
      let rulePrelude = prelude;
      let prefix = "";
      if (!parentAllowsRules) {
        const boundary = lastTopLevelSemicolon(prelude) + 1;
        prefix = prelude.slice(0, boundary);
        rulePrelude = prelude.slice(boundary);
      }
      const isRule = parentAllowsRules || looksLikeNestedRule(rulePrelude);
      const trimmedRule = rulePrelude.trimStart();
      const rewrittenPrelude = isRule
        ? prefix + rewriteRulePrelude(rulePrelude, ids)
        : prelude;
      const isGroupingAtRule =
        isRule &&
        /^@(?:container|document|layer|media|scope|supports|-webkit-keyframes|keyframes)\b/i.test(
          trimmedRule,
        );
      output += rewrittenPrelude;
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

function rewriteSmilTimingReferences(
  value: string,
  ids: ReadonlyMap<string, string>,
): string {
  const references = [...ids.entries()].sort(
    ([left], [right]) => right.length - left.length,
  );
  return value
    .split(";")
    .map((timing) => {
      const leading = timing.match(/^\s*/)?.[0] ?? "";
      const token = timing.slice(leading.length);
      for (const [id, rewritten] of references) {
        if (token.startsWith(`${id}.`)) {
          return `${leading}${rewritten}${token.slice(id.length)}`;
        }
      }
      return timing;
    })
    .join(";");
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
      const withRewrittenTiming =
        attribute.localName === "begin" || attribute.localName === "end"
          ? rewriteSmilTimingReferences(attribute.value, ids)
          : attribute.value;
      const withRewrittenUrls = rewriteLocalUrlReferences(
        withRewrittenTiming,
        ids,
      );
      const rewritten =
        attribute.localName.toLowerCase() === "href"
          ? rewriteHrefReference(withRewrittenUrls, ids)
          : withRewrittenUrls;
      if (rewritten !== attribute.value)
        element.setAttribute(attribute.name, rewritten);
    }

    for (const attributeName of ARIA_ID_REFERENCE_ATTRIBUTES) {
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
  validateMaxBytes(maxBytes);
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

export type SvgMotionPreset = "draw" | "fade" | "scale" | "stagger" | "pulse";

export type SvgMotionOrder = "document" | "reverse";

export const SVG_ANIMATION_ERROR_CODES = {
  animationFailed: "ANIMATION_FAILED",
  invalidSvg: "INVALID_SVG",
  setupFailed: "ANIMATION_SETUP_FAILED",
  unsupportedEnvironment: "UNSUPPORTED_ENVIRONMENT",
} as const;

export type SvgAnimationErrorCode =
  (typeof SVG_ANIMATION_ERROR_CODES)[keyof typeof SVG_ANIMATION_ERROR_CODES];

export class SvgAnimationError extends Error {
  readonly code: SvgAnimationErrorCode;

  constructor(code: SvgAnimationErrorCode, message: string) {
    super(message);
    this.name = "SvgAnimationError";
    this.code = code;
  }
}

export interface SvgMotionOptions {
  preset?: SvgMotionPreset;
  autoplay?: boolean;
  duration?: number;
  delay?: number;
  easing?: string;
  iterations?: number;
  direction?: PlaybackDirection;
  selector?: string;
  order?: SvgMotionOrder;
  stagger?: "auto" | number;
}

export type SvgMotionControllerState =
  | "idle"
  | "running"
  | "paused"
  | "finished"
  | "cancelled"
  | "failed"
  | "destroyed";

export interface SvgMotionController {
  readonly state: SvgMotionControllerState;
  readonly finished: Promise<void>;
  readonly diagnostics: readonly SvgDiagnostic[];
  play(): void;
  pause(): void;
  reverse(): void;
  restart(): void;
  finish(): void;
  cancel(): void;
  seek(progress: number): void;
  destroy(): void;
}

export interface MountSvgMotionOptions
  extends SvgMotionOptions, PrepareSvgOptions {}

export interface SvgMotionInstance {
  readonly svg: SVGSVGElement;
  readonly controller: SvgMotionController;
  readonly diagnostics: readonly SvgDiagnostic[];
  destroy(): void;
}

interface ResolvedMotionOptions {
  preset: SvgMotionPreset;
  autoplay: boolean;
  duration: number;
  delay: number;
  easing: string;
  iterations: number;
  direction: PlaybackDirection;
  selector?: string;
  order: SvgMotionOrder;
  stagger: "auto" | number;
}

interface AttributeSnapshot {
  element: SVGElement;
  attributes: Map<string, string | null>;
}

interface MotionPlan {
  target: SVGElement;
  keyframes: Keyframe[];
  timing: KeyframeAnimationOptions;
  prepare?: () => void;
}

interface DrawableGeometry {
  length: number;
  fill: string;
  fillOpacity: number;
  fillVisible: boolean;
  strokeVisible: boolean;
}

const DRAWABLE_GEOMETRY = new Set([
  "path",
  "line",
  "polyline",
  "polygon",
  "circle",
  "ellipse",
  "rect",
]);

const NON_RENDERED_ELEMENTS = new Set([
  "defs",
  "desc",
  "title",
  "metadata",
  "style",
  "view",
  "script",
  "animate",
  "animatemotion",
  "animatetransform",
  "set",
  "mpath",
  "discard",
  "clippath",
  "mask",
  "marker",
  "pattern",
  "symbol",
  "lineargradient",
  "radialgradient",
  "filter",
]);

function requireFiniteNonNegative(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a finite non-negative number.`);
  }
}

function resolveMotionOptions(
  options: SvgMotionOptions,
): ResolvedMotionOptions {
  const duration = options.duration ?? 1200;
  const delay = options.delay ?? 0;
  const iterations = options.iterations ?? 1;
  const stagger = options.stagger ?? "auto";

  requireFiniteNonNegative(duration, "duration");
  requireFiniteNonNegative(delay, "delay");
  if (
    iterations !== Infinity &&
    (!Number.isFinite(iterations) || iterations <= 0)
  ) {
    throw new RangeError("iterations must be positive or Infinity.");
  }
  if (typeof stagger === "number") {
    requireFiniteNonNegative(stagger, "stagger");
  }

  return {
    preset: options.preset ?? "draw",
    autoplay: options.autoplay ?? true,
    duration,
    delay,
    easing: options.easing ?? "ease-in-out",
    iterations,
    direction: options.direction ?? "normal",
    ...(options.selector === undefined ? {} : { selector: options.selector }),
    order: options.order ?? "document",
    stagger,
  };
}

function assertAnimationEnvironment(svg: SVGSVGElement): void {
  if (
    !svg ||
    typeof svg !== "object" ||
    svg.localName !== "svg" ||
    svg.namespaceURI !== SVG_NAMESPACE ||
    typeof svg.querySelectorAll !== "function"
  ) {
    throw new SvgAnimationError(
      SVG_ANIMATION_ERROR_CODES.invalidSvg,
      "animateSvg requires an SVG root element.",
    );
  }
  if (
    typeof Element === "undefined" ||
    typeof Element.prototype.animate !== "function"
  ) {
    throw new SvgAnimationError(
      SVG_ANIMATION_ERROR_CODES.unsupportedEnvironment,
      "SVG animation requires the Web Animations API.",
    );
  }
}

function selectElements(
  svg: SVGSVGElement,
  selector: string | undefined,
): SVGElement[] {
  return [...svg.querySelectorAll(selector ?? "*")].filter(
    (element): element is SVGElement => isSvgNamespaceElement(element),
  );
}

const INHERITED_PRESENTATION_PROPERTIES = new Set([
  "fill",
  "fill-rule",
  "fill-opacity",
  "stroke",
  "stroke-opacity",
  "stroke-width",
  "visibility",
]);

const PRESENTATION_DEFAULTS: Readonly<Record<string, string>> = {
  display: "inline",
  fill: "black",
  "fill-rule": "nonzero",
  "fill-opacity": "1",
  opacity: "1",
  stroke: "none",
  "stroke-opacity": "1",
  "stroke-width": "1",
  visibility: "visible",
};

const MEASURED_PRESENTATION_PROPERTIES = [
  "d",
  "display",
  "fill",
  "fill-rule",
  "fill-opacity",
  "opacity",
  "stroke",
  "stroke-opacity",
  "stroke-width",
  "visibility",
] as const;
const PRESENTATION_BOUNDS_X = "--svg-motion-bounds-x";
const PRESENTATION_BOUNDS_Y = "--svg-motion-bounds-y";
const PRESENTATION_BOUNDS_WIDTH = "--svg-motion-bounds-width";
const PRESENTATION_BOUNDS_HEIGHT = "--svg-motion-bounds-height";
const PRESENTATION_PATH_HAS_FILL = "--svg-motion-path-has-fill";
const PROBE_RESOURCE_ELEMENTS = new Set([
  "audio",
  "discard",
  "embed",
  "feImage",
  "foreignObject",
  "iframe",
  "link",
  "object",
  "script",
  "set",
  "video",
  "animate",
  "animateMotion",
  "animateTransform",
]);
const PROBE_RESOURCE_CSS = /(?:cross-fade|element|image-set|paint)\s*\(/i;

type PresentationMap = ReadonlyMap<SVGElement, ReadonlyMap<string, string>>;

function isLiveDocumentConnection(element: Element): boolean {
  return element.isConnected && element.ownerDocument.defaultView !== null;
}

function isSafeProbeCssValue(value: string): boolean {
  return (
    !DANGEROUS_CSS.test(value) &&
    !PROBE_RESOURCE_CSS.test(value) &&
    hasOnlyLocalUrlFunctions(value)
  );
}

function safeProbeDeclarationText(declaration: CSSStyleDeclaration): string {
  const safeDeclarations: string[] = [];
  for (let index = 0; index < declaration.length; index += 1) {
    const property = declaration.item(index).toLowerCase();
    const value = declaration.getPropertyValue(property).trim();
    if (
      (!SAFE_STYLE_PROPERTIES.has(property) && !property.startsWith("--")) ||
      !isSafeProbeCssValue(value)
    ) {
      continue;
    }
    const priority = declaration.getPropertyPriority(property);
    safeDeclarations.push(
      `${property}: ${value}${priority ? ` !${priority}` : ""}`,
    );
  }
  return safeDeclarations.join("; ");
}

function safeProbeRuleText(rule: CSSRule): string {
  if (rule.type === CSSRule.STYLE_RULE) {
    const styleRule = rule as CSSStyleRule;
    const declarations = safeProbeDeclarationText(styleRule.style);
    const nested = [...styleRule.cssRules].map(safeProbeRuleText).join("\n");
    if (!declarations && !nested) return "";
    return `${styleRule.selectorText} { ${declarations}${
      declarations && nested ? "; " : ""
    }${nested} }`;
  }

  if (
    rule.type === CSSRule.MEDIA_RULE ||
    rule.type === CSSRule.SUPPORTS_RULE ||
    rule.constructor.name === "CSSLayerBlockRule" ||
    rule.constructor.name === "CSSScopeRule"
  ) {
    const groupingRule = rule as CSSGroupingRule;
    const rules = [...groupingRule.cssRules]
      .map(safeProbeRuleText)
      .filter(Boolean)
      .join("\n");
    if (!rules) return "";
    const blockStart = rule.cssText.indexOf("{");
    if (blockStart === -1) return "";
    return `${rule.cssText.slice(0, blockStart).trim()} { ${rules} }`;
  }

  return "";
}

function safeProbeStylesheet(stylesheet: string): string {
  if (typeof CSSStyleSheet === "undefined") return "";
  try {
    const parsed = new CSSStyleSheet();
    parsed.replaceSync(stylesheet);
    return [...parsed.cssRules]
      .map(safeProbeRuleText)
      .filter(Boolean)
      .join("\n");
  } catch {
    return "";
  }
}

function sanitizeProbeClone(svg: SVGSVGElement): void {
  for (const element of [svg, ...svg.querySelectorAll("*")]) {
    if (
      element !== svg &&
      (element.namespaceURI !== SVG_NAMESPACE ||
        PROBE_RESOURCE_ELEMENTS.has(element.localName))
    ) {
      element.remove();
      continue;
    }

    if (element.localName === "style") {
      const stylesheet = safeProbeStylesheet(element.textContent ?? "");
      if (stylesheet) element.textContent = stylesheet;
      else element.remove();
      continue;
    }

    for (const attribute of [...element.attributes]) {
      const name = attribute.localName.toLowerCase();
      const value = attribute.value;
      if (name === "style") continue;
      if (
        name.startsWith("on") ||
        name === "src" ||
        name === "base" ||
        (element.localName === "image" && name === "href") ||
        (name === "href" && !LOCAL_URL_REFERENCE.test(value.trim())) ||
        DANGEROUS_CSS.test(value) ||
        PROBE_RESOURCE_CSS.test(value) ||
        !hasOnlyLocalUrlFunctions(value)
      ) {
        element.removeAttributeNode(attribute);
      }
    }

    if (element.hasAttribute("style")) {
      const declarations = safeProbeDeclarationText(
        (element as SVGElement).style,
      );
      if (declarations) element.setAttribute("style", declarations);
      else element.removeAttribute("style");
    }
  }
}

function detachedPresentation(svg: SVGSVGElement): PresentationMap | undefined {
  const needsNativePathMeasurement = [
    ...svg.querySelectorAll("path,polyline,polygon"),
  ].some(
    (geometry) => typeof Reflect.get(geometry, "isPointInFill") === "function",
  );
  if (
    isLiveDocumentConnection(svg) ||
    (svg.querySelector("style") === null && !needsNativePathMeasurement) ||
    typeof document === "undefined" ||
    document.body === null
  ) {
    return undefined;
  }

  const clone = svg.cloneNode(true) as SVGSVGElement;
  const originals = [svg, ...svg.querySelectorAll("*")];
  const clones = [clone, ...clone.querySelectorAll("*")];
  const pairs = originals.map((element, index) => [element, clones[index]]);
  let host: HTMLDivElement | undefined;

  try {
    sanitizeProbeClone(clone);
    const connectedClone = document.adoptNode(clone);
    host = document.createElement("div");
    host.dataset.svgMotionStyleProbe = "";
    host.style.cssText =
      "all:initial!important;position:fixed!important;left:-10000px!important;top:-10000px!important;width:300px!important;height:150px!important;overflow:hidden!important;opacity:0!important;pointer-events:none!important;contain:strict!important;color:black!important";
    const shadow = host.attachShadow({ mode: "closed" });
    shadow.append(connectedClone);
    document.body.append(host);

    const presentation = new Map<SVGElement, ReadonlyMap<string, string>>();
    for (const [original, measured] of pairs) {
      if (
        !original ||
        !measured ||
        original.namespaceURI !== SVG_NAMESPACE ||
        measured.namespaceURI !== SVG_NAMESPACE ||
        !measured.isConnected
      ) {
        continue;
      }
      const computed = getComputedStyle(measured);
      const values = new Map<string, string>(
        MEASURED_PRESENTATION_PROPERTIES.map((property) => [
          property,
          computed.getPropertyValue(property).trim(),
        ]),
      );
      const getBBox = Reflect.get(measured, "getBBox");
      if (typeof getBBox === "function") {
        try {
          const bounds = Reflect.apply(getBBox, measured, []) as DOMRect;
          values.set(PRESENTATION_BOUNDS_X, String(bounds.x));
          values.set(PRESENTATION_BOUNDS_Y, String(bounds.y));
          values.set(PRESENTATION_BOUNDS_WIDTH, String(bounds.width));
          values.set(PRESENTATION_BOUNDS_HEIGHT, String(bounds.height));
        } catch {
          // Presentation values remain useful when this node has no geometry.
        }
      }
      if (["path", "polygon", "polyline"].includes(measured.localName)) {
        values.set(
          PRESENTATION_PATH_HAS_FILL,
          renderedPathHasFillArea(measured as SVGElement) ? "true" : "false",
        );
      }
      presentation.set(original as SVGElement, values);
    }
    return presentation;
  } catch {
    return undefined;
  } finally {
    host?.remove();
  }
}

function localPresentationValue(element: SVGElement, property: string): string {
  return (
    (element.hasAttribute("style")
      ? element.style.getPropertyValue(property).trim()
      : "") ||
    element.getAttribute(property)?.trim() ||
    ""
  );
}

function presentationValue(
  element: SVGElement,
  property: string,
  presentation?: PresentationMap,
): string {
  const measured = presentation?.get(element)?.get(property);
  if (measured) return measured;

  if (isLiveDocumentConnection(element)) {
    try {
      const computed = getComputedStyle(element)
        .getPropertyValue(property)
        .trim();
      if (computed) return computed;
    } catch {
      // Fall through to local presentation for incomplete DOM implementations.
    }
  }

  const inherited = INHERITED_PRESENTATION_PROPERTIES.has(property);
  let current: SVGElement | null = element;
  while (current) {
    const local = localPresentationValue(current, property);
    if (local && local !== "inherit" && local !== "unset") {
      return local === "initial"
        ? (PRESENTATION_DEFAULTS[property] ?? "")
        : local;
    }
    if (!inherited || current.localName === "svg") break;
    current = isSvgNamespaceElement(current.parentElement)
      ? current.parentElement
      : null;
  }

  return PRESENTATION_DEFAULTS[property] ?? "";
}

function hasPaint(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    normalized !== "" &&
    normalized !== "none" &&
    normalized !== "transparent" &&
    !/^rgba\([^)]*,\s*0(?:\.0+)?\s*\)$/.test(normalized) &&
    !/^color\([^)]*\/\s*0(?:\.0+)?\s*\)$/.test(normalized)
  );
}

function presentationNumber(
  element: SVGElement,
  property: string,
  fallback: number,
  presentation?: PresentationMap,
): number {
  const value = presentationValue(element, property, presentation).trim();
  const number = Number.parseFloat(value);
  if (!Number.isFinite(number)) return fallback;
  return value.endsWith("%") ? number / 100 : number;
}

type GeometryPoint = readonly [number, number];

function pointsEncloseArea(points: readonly GeometryPoint[]): boolean {
  if (points.length < 3) return false;
  const origin = points[0];
  if (!origin) return false;
  const scale = Math.max(
    1,
    ...points.flatMap(([x, y]) => [
      Math.abs(x - origin[0]),
      Math.abs(y - origin[1]),
    ]),
  );
  const tolerance = scale * scale * 1e-12;
  for (let firstIndex = 1; firstIndex < points.length - 1; firstIndex += 1) {
    const first = points[firstIndex];
    if (!first) continue;
    for (
      let secondIndex = firstIndex + 1;
      secondIndex < points.length;
      secondIndex += 1
    ) {
      const second = points[secondIndex];
      if (!second) continue;
      const crossProduct =
        (first[0] - origin[0]) * (second[1] - origin[1]) -
        (first[1] - origin[1]) * (second[0] - origin[0]);
      if (Math.abs(crossProduct) > tolerance) return true;
    }
  }
  return false;
}

const PATH_PARAMETER_COUNT: Readonly<Record<string, number>> = {
  a: 7,
  c: 6,
  h: 1,
  l: 2,
  m: 2,
  q: 4,
  s: 4,
  t: 2,
  v: 1,
};

type ArcSegment = Readonly<{
  end: GeometryPoint;
  largeArc: number;
  radiusX: number;
  radiusY: number;
  rotation: number;
  start: GeometryPoint;
  sweep: number;
}>;

function sameGeometryPoint(first: GeometryPoint, second: GeometryPoint) {
  return first[0] === second[0] && first[1] === second[1];
}

function reverseArcIndex(
  arcs: readonly ArcSegment[],
  candidate: ArcSegment,
): number {
  return arcs.findIndex(
    (arc) =>
      sameGeometryPoint(arc.start, candidate.end) &&
      sameGeometryPoint(arc.end, candidate.start) &&
      arc.radiusX === candidate.radiusX &&
      arc.radiusY === candidate.radiusY &&
      arc.rotation === candidate.rotation &&
      arc.largeArc === candidate.largeArc &&
      arc.sweep !== candidate.sweep,
  );
}

function pathDataHasPotentialFill(pathData: string): boolean {
  const tokens = pathData.match(
    /[AaCcHhLlMmQqSsTtVvZz]|[-+]?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/gi,
  );
  if (!tokens) return false;

  let cursor = 0;
  let command = "";
  let currentX = 0;
  let currentY = 0;
  let startX = 0;
  let startY = 0;
  let points: GeometryPoint[] = [];
  let unmatchedArcs: ArcSegment[] = [];
  const finishSubpath = () =>
    unmatchedArcs.length > 0 || pointsEncloseArea(points);
  const resetSubpath = () => {
    points = [];
    unmatchedArcs = [];
  };
  const coordinate = (value: number, current: number, relative: boolean) =>
    relative ? current + value : value;

  while (cursor < tokens.length) {
    const token = tokens[cursor]!;
    if (/^[a-z]$/i.test(token)) {
      command = token;
      cursor += 1;
      const lower = command.toLowerCase();
      if (lower === "m") {
        if (finishSubpath()) return true;
        resetSubpath();
      } else if (lower === "z") {
        if (finishSubpath()) return true;
        currentX = startX;
        currentY = startY;
        resetSubpath();
        command = "";
        continue;
      }
    }

    const lower = command.toLowerCase();
    const parameterCount = PATH_PARAMETER_COUNT[lower];
    if (!parameterCount || cursor + parameterCount > tokens.length) break;
    const values = tokens.slice(cursor, cursor + parameterCount).map(Number);
    if (values.some((value) => !Number.isFinite(value))) break;
    cursor += parameterCount;
    const relative = command === lower;
    const point = (x: number, y: number): GeometryPoint => [
      coordinate(x, currentX, relative),
      coordinate(y, currentY, relative),
    ];
    let endpoint: GeometryPoint;

    switch (lower) {
      case "m":
      case "l":
      case "t":
        endpoint = point(values[0]!, values[1]!);
        break;
      case "h":
        endpoint = [coordinate(values[0]!, currentX, relative), currentY];
        break;
      case "v":
        endpoint = [currentX, coordinate(values[0]!, currentY, relative)];
        break;
      case "c":
        points.push(
          point(values[0]!, values[1]!),
          point(values[2]!, values[3]!),
        );
        endpoint = point(values[4]!, values[5]!);
        break;
      case "s":
      case "q":
        points.push(point(values[0]!, values[1]!));
        endpoint = point(values[2]!, values[3]!);
        break;
      case "a": {
        endpoint = point(values[5]!, values[6]!);
        if (
          Math.abs(values[0]!) > 0 &&
          Math.abs(values[1]!) > 0 &&
          (endpoint[0] !== currentX || endpoint[1] !== currentY)
        ) {
          const arc: ArcSegment = {
            end: endpoint,
            largeArc: values[3]!,
            radiusX: Math.abs(values[0]!),
            radiusY: Math.abs(values[1]!),
            rotation: values[2]!,
            start: [currentX, currentY],
            sweep: values[4]!,
          };
          const reverseIndex = reverseArcIndex(unmatchedArcs, arc);
          if (reverseIndex === -1) unmatchedArcs.push(arc);
          else unmatchedArcs.splice(reverseIndex, 1);
        }
        break;
      }
      default:
        return finishSubpath();
    }

    currentX = endpoint[0];
    currentY = endpoint[1];
    points.push(endpoint);
    if (lower === "m") {
      startX = currentX;
      startY = currentY;
      command = relative ? "l" : "L";
    }
  }

  return finishSubpath();
}

type GeometryBounds = Readonly<{
  height: number;
  width: number;
  x: number;
  y: number;
}>;

function geometryBounds(
  element: SVGElement,
  presentation?: PresentationMap,
): GeometryBounds | undefined {
  const measured = presentation?.get(element);
  if (measured) {
    const x = Number.parseFloat(measured.get(PRESENTATION_BOUNDS_X) ?? "");
    const y = Number.parseFloat(measured.get(PRESENTATION_BOUNDS_Y) ?? "");
    const width = Number.parseFloat(
      measured.get(PRESENTATION_BOUNDS_WIDTH) ?? "",
    );
    const height = Number.parseFloat(
      measured.get(PRESENTATION_BOUNDS_HEIGHT) ?? "",
    );
    if ([x, y, width, height].every(Number.isFinite)) {
      return { height, width, x, y };
    }
  }

  try {
    const getBBox = Reflect.get(element, "getBBox");
    if (typeof getBBox !== "function") return undefined;
    const { height, width, x, y } = Reflect.apply(
      getBBox,
      element,
      [],
    ) as DOMRect;
    return [x, y, width, height].every(Number.isFinite)
      ? { height, width, x, y }
      : undefined;
  } catch {
    return undefined;
  }
}

function positiveGeometryBounds(
  element: SVGElement,
  presentation?: PresentationMap,
): boolean | undefined {
  const bounds = geometryBounds(element, presentation);
  return bounds ? bounds.width > 0 && bounds.height > 0 : undefined;
}

function positiveAttribute(element: SVGElement, name: string): boolean {
  const value = Number.parseFloat(element.getAttribute(name) ?? "");
  return Number.isFinite(value) && value > 0;
}

const ATTRIBUTE_D_PRESENTATION_CACHE = new WeakMap<
  Document,
  Map<string, string>
>();

function isolatedAttributePathPresentation(
  element: SVGElement,
  attribute: string,
): string | undefined {
  if (!attribute) return undefined;
  const ownerDocument = element.ownerDocument;
  const probeDocument =
    ownerDocument.defaultView !== null && ownerDocument.body
      ? ownerDocument
      : typeof document !== "undefined"
        ? document
        : undefined;
  const view = probeDocument?.defaultView;
  if (!probeDocument?.body || !view) return undefined;

  const cached =
    ATTRIBUTE_D_PRESENTATION_CACHE.get(probeDocument)?.get(attribute);
  if (cached !== undefined) return cached;

  let host: HTMLDivElement | undefined;
  try {
    host = probeDocument.createElement("div");
    host.hidden = true;
    const shadow = host.attachShadow({ mode: "closed" });
    const svg = probeDocument.createElementNS(SVG_NAMESPACE, "svg");
    const path = probeDocument.createElementNS(SVG_NAMESPACE, "path");
    path.setAttribute("d", attribute);
    svg.append(path);
    shadow.append(svg);
    probeDocument.body.append(host);
    const presented = view.getComputedStyle(path).getPropertyValue("d").trim();
    if (!presented) return undefined;
    let documentCache = ATTRIBUTE_D_PRESENTATION_CACHE.get(probeDocument);
    if (!documentCache) {
      documentCache = new Map();
      ATTRIBUTE_D_PRESENTATION_CACHE.set(probeDocument, documentCache);
    }
    documentCache.set(attribute, presented);
    return presented;
  } catch {
    return undefined;
  } finally {
    host?.remove();
  }
}

function pathDataCandidates(
  element: SVGElement,
  presentation?: PresentationMap,
): readonly string[] {
  if (element.localName !== "path") {
    const coordinates = (element.getAttribute("points") ?? "")
      .match(/[-+]?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/gi)
      ?.map(Number);
    if (!coordinates || coordinates.length < 4) return [""];
    const points: string[] = [];
    for (let index = 0; index + 1 < coordinates.length; index += 2) {
      points.push(`${coordinates[index]} ${coordinates[index + 1]}`);
    }
    return [
      `${points.map((point, index) => `${index === 0 ? "M" : "L"} ${point}`).join(" ")}${element.localName === "polygon" ? " Z" : ""}`,
    ];
  }

  const presented = presentationValue(element, "d", presentation).trim();
  const presentedCandidates: string[] = [];
  if (/^path\s*\(/i.test(presented)) {
    const match = presented.match(/^path\s*\(\s*(["'])([\s\S]*)\1\s*\)$/i);
    if (match?.[2] !== undefined)
      presentedCandidates.push(decodeCssEscapes(match[2]));
  }
  const attribute = element.getAttribute("d") ?? "";
  if (presented.toLowerCase() === "none") return [""];
  const isolatedPresentation = isolatedAttributePathPresentation(
    element,
    attribute,
  );
  const rawAttributeIsEffective =
    presented === attribute ||
    (isolatedPresentation !== undefined && presented === isolatedPresentation);
  return rawAttributeIsEffective
    ? [attribute, ...presentedCandidates.filter((data) => data !== attribute)]
    : [
        ...presentedCandidates,
        ...(!presentedCandidates.includes(attribute) ? [attribute] : []),
      ];
}

type NativePathSegment = Readonly<{
  data: string;
  key: string;
  length?: number;
  reverseKey: string;
  samples?: readonly NativeBoundarySample[];
}>;

type NativeBoundarySample = Readonly<{
  point: GeometryPoint;
  scale: number;
  tangent: GeometryPoint;
}>;

function geometryNumber(value: number): string {
  return String(Object.is(value, -0) ? 0 : value);
}

function geometryPointKey(point: GeometryPoint): string {
  return `${geometryNumber(point[0])},${geometryNumber(point[1])}`;
}

const PATH_SAMPLE_FRACTIONS = [0.2, 0.5, 0.8] as const;

function lineBoundarySamples(
  start: GeometryPoint,
  end: GeometryPoint,
): readonly NativeBoundarySample[] {
  const tangent: GeometryPoint = [end[0] - start[0], end[1] - start[1]];
  const scale = Math.hypot(tangent[0], tangent[1]);
  return PATH_SAMPLE_FRACTIONS.map((fraction) => ({
    point: [start[0] + tangent[0] * fraction, start[1] + tangent[1] * fraction],
    scale,
    tangent,
  }));
}

function quadraticBoundarySamples(
  start: GeometryPoint,
  control: GeometryPoint,
  end: GeometryPoint,
): readonly NativeBoundarySample[] {
  const scale =
    Math.hypot(control[0] - start[0], control[1] - start[1]) +
    Math.hypot(end[0] - control[0], end[1] - control[1]);
  return PATH_SAMPLE_FRACTIONS.map((fraction) => {
    const inverse = 1 - fraction;
    return {
      point: [
        inverse ** 2 * start[0] +
          2 * inverse * fraction * control[0] +
          fraction ** 2 * end[0],
        inverse ** 2 * start[1] +
          2 * inverse * fraction * control[1] +
          fraction ** 2 * end[1],
      ],
      scale,
      tangent: [
        2 *
          (inverse * (control[0] - start[0]) +
            fraction * (end[0] - control[0])),
        2 *
          (inverse * (control[1] - start[1]) +
            fraction * (end[1] - control[1])),
      ],
    };
  });
}

function cubicBoundarySamples(
  start: GeometryPoint,
  first: GeometryPoint,
  second: GeometryPoint,
  end: GeometryPoint,
): readonly NativeBoundarySample[] {
  const scale =
    Math.hypot(first[0] - start[0], first[1] - start[1]) +
    Math.hypot(second[0] - first[0], second[1] - first[1]) +
    Math.hypot(end[0] - second[0], end[1] - second[1]);
  return PATH_SAMPLE_FRACTIONS.map((fraction) => {
    const inverse = 1 - fraction;
    return {
      point: [
        inverse ** 3 * start[0] +
          3 * inverse ** 2 * fraction * first[0] +
          3 * inverse * fraction ** 2 * second[0] +
          fraction ** 3 * end[0],
        inverse ** 3 * start[1] +
          3 * inverse ** 2 * fraction * first[1] +
          3 * inverse * fraction ** 2 * second[1] +
          fraction ** 3 * end[1],
      ],
      scale,
      tangent: [
        3 * inverse ** 2 * (first[0] - start[0]) +
          6 * inverse * fraction * (second[0] - first[0]) +
          3 * fraction ** 2 * (end[0] - second[0]),
        3 * inverse ** 2 * (first[1] - start[1]) +
          6 * inverse * fraction * (second[1] - first[1]) +
          3 * fraction ** 2 * (end[1] - second[1]),
      ],
    };
  });
}

function controlsTraceMonotoneLine(
  start: GeometryPoint,
  controls: readonly GeometryPoint[],
  end: GeometryPoint,
): boolean {
  const directionX = end[0] - start[0];
  const directionY = end[1] - start[1];
  const squaredLength = directionX ** 2 + directionY ** 2;
  if (!Number.isFinite(squaredLength) || squaredLength <= 0) return false;
  const parameterTolerance = Number.EPSILON * 128;
  let previousParameter = 0;
  for (const control of controls) {
    const cross =
      (control[0] - start[0]) * directionY -
      (control[1] - start[1]) * directionX;
    if (cross !== 0) return false;
    const parameter =
      ((control[0] - start[0]) * directionX +
        (control[1] - start[1]) * directionY) /
      squaredLength;
    if (
      parameter < previousParameter - parameterTolerance ||
      parameter > 1 + parameterTolerance
    ) {
      return false;
    }
    previousParameter = parameter;
  }
  return true;
}

function pathGeometrySegments(
  pathData: string,
): readonly NativePathSegment[] | undefined {
  const tokens = pathData.match(
    /[AaCcHhLlMmQqSsTtVvZz]|[-+]?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/gi,
  );
  if (!tokens) return undefined;

  const segments: NativePathSegment[] = [];
  let command = "";
  let cursor = 0;
  let current: GeometryPoint = [0, 0];
  let subpathStart: GeometryPoint = [0, 0];
  let previousCommand = "";
  let previousCubicControl: GeometryPoint | undefined;
  let previousQuadraticControl: GeometryPoint | undefined;

  const absolute = (x: number, y: number, relative: boolean): GeometryPoint => [
    relative ? current[0] + x : x,
    relative ? current[1] + y : y,
  ];
  const addLine = (start: GeometryPoint, end: GeometryPoint) => {
    if (sameGeometryPoint(start, end)) return;
    const startKey = geometryPointKey(start);
    const endKey = geometryPointKey(end);
    segments.push({
      data: `M ${startKey.replace(",", " ")} L ${endKey.replace(",", " ")}`,
      key: `L:${startKey}>${endKey}`,
      length: Math.hypot(end[0] - start[0], end[1] - start[1]),
      reverseKey: `L:${endKey}>${startKey}`,
      samples: lineBoundarySamples(start, end),
    });
  };

  while (cursor < tokens.length) {
    const token = tokens[cursor]!;
    if (/^[a-z]$/i.test(token)) {
      command = token;
      cursor += 1;
      if (command.toLowerCase() === "z") {
        addLine(current, subpathStart);
        current = subpathStart;
        previousCommand = "z";
        previousCubicControl = undefined;
        previousQuadraticControl = undefined;
        command = "";
        continue;
      }
    }

    const lower = command.toLowerCase();
    const parameterCount = PATH_PARAMETER_COUNT[lower];
    if (!parameterCount || cursor + parameterCount > tokens.length) {
      return undefined;
    }
    const values = tokens.slice(cursor, cursor + parameterCount).map(Number);
    if (values.some((value) => !Number.isFinite(value))) return undefined;
    cursor += parameterCount;
    const relative = command === lower;

    if (lower === "m") {
      current = absolute(values[0]!, values[1]!, relative);
      subpathStart = current;
      previousCommand = "m";
      previousCubicControl = undefined;
      previousQuadraticControl = undefined;
      command = command === lower ? "l" : "L";
      continue;
    }

    const start = current;
    let end: GeometryPoint;
    if (lower === "h") {
      end = [relative ? current[0] + values[0]! : values[0]!, current[1]];
      addLine(start, end);
      previousCubicControl = undefined;
      previousQuadraticControl = undefined;
    } else if (lower === "v") {
      end = [current[0], relative ? current[1] + values[0]! : values[0]!];
      addLine(start, end);
      previousCubicControl = undefined;
      previousQuadraticControl = undefined;
    } else if (lower === "l") {
      end = absolute(values[0]!, values[1]!, relative);
      addLine(start, end);
      previousCubicControl = undefined;
      previousQuadraticControl = undefined;
    } else if (lower === "c" || lower === "s") {
      const firstControl =
        lower === "s"
          ? previousCommand === "c" || previousCommand === "s"
            ? ([
                current[0] * 2 - (previousCubicControl?.[0] ?? current[0]),
                current[1] * 2 - (previousCubicControl?.[1] ?? current[1]),
              ] satisfies GeometryPoint)
            : current
          : absolute(values[0]!, values[1]!, relative);
      const secondControl =
        lower === "s"
          ? absolute(values[0]!, values[1]!, relative)
          : absolute(values[2]!, values[3]!, relative);
      end =
        lower === "s"
          ? absolute(values[2]!, values[3]!, relative)
          : absolute(values[4]!, values[5]!, relative);
      const startKey = geometryPointKey(start);
      const firstKey = geometryPointKey(firstControl);
      const secondKey = geometryPointKey(secondControl);
      const endKey = geometryPointKey(end);
      if (
        controlsTraceMonotoneLine(start, [firstControl, secondControl], end)
      ) {
        addLine(start, end);
      } else {
        segments.push({
          data: `M ${startKey.replace(",", " ")} C ${firstKey.replace(",", " ")} ${secondKey.replace(",", " ")} ${endKey.replace(",", " ")}`,
          key: `C:${startKey}|${firstKey}|${secondKey}|${endKey}`,
          reverseKey: `C:${endKey}|${secondKey}|${firstKey}|${startKey}`,
          samples: cubicBoundarySamples(
            start,
            firstControl,
            secondControl,
            end,
          ),
        });
      }
      previousCubicControl = secondControl;
      previousQuadraticControl = undefined;
    } else if (lower === "q" || lower === "t") {
      const control =
        lower === "t"
          ? previousCommand === "q" || previousCommand === "t"
            ? ([
                current[0] * 2 - (previousQuadraticControl?.[0] ?? current[0]),
                current[1] * 2 - (previousQuadraticControl?.[1] ?? current[1]),
              ] satisfies GeometryPoint)
            : current
          : absolute(values[0]!, values[1]!, relative);
      end =
        lower === "t"
          ? absolute(values[0]!, values[1]!, relative)
          : absolute(values[2]!, values[3]!, relative);
      const startKey = geometryPointKey(start);
      const controlKey = geometryPointKey(control);
      const endKey = geometryPointKey(end);
      if (controlsTraceMonotoneLine(start, [control], end)) {
        addLine(start, end);
      } else {
        segments.push({
          data: `M ${startKey.replace(",", " ")} Q ${controlKey.replace(",", " ")} ${endKey.replace(",", " ")}`,
          key: `Q:${startKey}|${controlKey}|${endKey}`,
          reverseKey: `Q:${endKey}|${controlKey}|${startKey}`,
          samples: quadraticBoundarySamples(start, control, end),
        });
      }
      previousCubicControl = undefined;
      previousQuadraticControl = control;
    } else if (lower === "a") {
      end = absolute(values[5]!, values[6]!, relative);
      const radiusX = Math.abs(values[0]!);
      const radiusY = Math.abs(values[1]!);
      if (radiusX === 0 || radiusY === 0) {
        addLine(start, end);
      } else if (!sameGeometryPoint(start, end)) {
        const rotation = values[2]!;
        const largeArc = values[3]! === 0 ? 0 : 1;
        const sweep = values[4]! === 0 ? 0 : 1;
        const startKey = geometryPointKey(start);
        const endKey = geometryPointKey(end);
        const geometry = `${geometryNumber(radiusX)},${geometryNumber(radiusY)},${geometryNumber(rotation)},${largeArc}`;
        segments.push({
          data: `M ${startKey.replace(",", " ")} A ${geometryNumber(radiusX)} ${geometryNumber(radiusY)} ${geometryNumber(rotation)} ${largeArc} ${sweep} ${endKey.replace(",", " ")}`,
          key: `A:${startKey}|${geometry},${sweep}|${endKey}`,
          reverseKey: `A:${endKey}|${geometry},${sweep === 0 ? 1 : 0}|${startKey}`,
        });
      }
      previousCubicControl = undefined;
      previousQuadraticControl = undefined;
    } else {
      return undefined;
    }
    current = end;
    previousCommand = lower;
  }

  return segments;
}

function hasUnmatchedPathSegments(
  segments: readonly NativePathSegment[],
  fillRule: string,
) {
  if (fillRule === "evenodd") {
    const oddSegments = new Set<string>();
    for (const segment of segments) {
      const key =
        segment.key < segment.reverseKey ? segment.key : segment.reverseKey;
      if (oddSegments.has(key)) oddSegments.delete(key);
      else oddSegments.add(key);
    }
    return oddSegments.size > 0;
  }

  const unmatched = new Map<string, number>();
  for (const segment of segments) {
    const reverseCount = unmatched.get(segment.reverseKey) ?? 0;
    if (reverseCount > 0) {
      if (reverseCount === 1) unmatched.delete(segment.reverseKey);
      else unmatched.set(segment.reverseKey, reverseCount - 1);
    } else {
      unmatched.set(segment.key, (unmatched.get(segment.key) ?? 0) + 1);
    }
  }
  return unmatched.size > 0;
}

type CircularArcInput = Readonly<{
  end: GeometryPoint;
  largeArc: number;
  radius: number;
  start: GeometryPoint;
  sweep: number;
}>;

function exactCircularContour(
  arcs: readonly CircularArcInput[],
): Readonly<{ key: string; winding: number }> | undefined {
  if (arcs.length < 2 || !sameGeometryPoint(arcs[0]!.start, arcs.at(-1)!.end)) {
    return undefined;
  }
  const points = [arcs[0]!.start, ...arcs.map(({ end }) => end)];
  const first = points[0]!;
  const second = points.find((point) => !sameGeometryPoint(point, first));
  if (!second) return undefined;
  const third = points.find(
    (point) =>
      (second[0] - first[0]) * (point[1] - first[1]) -
        (second[1] - first[1]) * (point[0] - first[0]) !==
      0,
  );
  let center: GeometryPoint;
  if (third) {
    const divisor =
      2 *
      (first[0] * (second[1] - third[1]) +
        second[0] * (third[1] - first[1]) +
        third[0] * (first[1] - second[1]));
    if (!Number.isFinite(divisor) || divisor === 0) return undefined;
    const firstSquared = first[0] ** 2 + first[1] ** 2;
    const secondSquared = second[0] ** 2 + second[1] ** 2;
    const thirdSquared = third[0] ** 2 + third[1] ** 2;
    center = [
      (firstSquared * (second[1] - third[1]) +
        secondSquared * (third[1] - first[1]) +
        thirdSquared * (first[1] - second[1])) /
        divisor,
      (firstSquared * (third[0] - second[0]) +
        secondSquared * (first[0] - third[0]) +
        thirdSquared * (second[0] - first[0])) /
        divisor,
    ];
  } else {
    center = [(first[0] + second[0]) / 2, (first[1] + second[1]) / 2];
  }
  center = [
    Object.is(center[0], -0) ? 0 : center[0],
    Object.is(center[1], -0) ? 0 : center[1],
  ];
  const radiusSquared =
    (first[0] - center[0]) ** 2 + (first[1] - center[1]) ** 2;
  if (!Number.isFinite(radiusSquared) || radiusSquared <= 0) return undefined;
  if (
    points.some(
      ([x, y]) => (x - center[0]) ** 2 + (y - center[1]) ** 2 !== radiusSquared,
    ) ||
    arcs.some(({ radius }) => radius ** 2 !== radiusSquared)
  ) {
    return undefined;
  }

  let angleSum = 0;
  for (const arc of arcs) {
    const startVector: GeometryPoint = [
      arc.start[0] - center[0],
      arc.start[1] - center[1],
    ];
    const endVector: GeometryPoint = [
      arc.end[0] - center[0],
      arc.end[1] - center[1],
    ];
    let angle = Math.atan2(
      startVector[0] * endVector[1] - startVector[1] * endVector[0],
      startVector[0] * endVector[0] + startVector[1] * endVector[1],
    );
    if (arc.sweep === 1 && angle < 0) angle += Math.PI * 2;
    if (arc.sweep === 0 && angle > 0) angle -= Math.PI * 2;
    if (
      Math.abs(angle) !== Math.PI &&
      Math.abs(angle) > Math.PI !== (arc.largeArc === 1)
    ) {
      return undefined;
    }
    angleSum += angle;
  }
  const winding = Math.round(angleSum / (Math.PI * 2));
  const tolerance =
    Math.PI * 2 * Number.EPSILON * 128 * Math.max(1, arcs.length);
  if (winding === 0 || Math.abs(angleSum - winding * Math.PI * 2) > tolerance) {
    return undefined;
  }
  return {
    key: `circle:${geometryPointKey(center)}:${geometryNumber(Math.sqrt(radiusSquared))}`,
    winding,
  };
}

function circularArcPathHasFill(
  pathData: string,
  fillRule: string,
): boolean | undefined {
  const tokens = pathData.match(
    /[AaMmZz]|[-+]?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/gi,
  );
  if (!tokens) return undefined;

  const contours: Array<Readonly<{ key: string; winding: number }>> = [];
  let command = "";
  let cursor = 0;
  let current: GeometryPoint = [0, 0];
  let start: GeometryPoint | undefined;
  let contourArcs: CircularArcInput[] = [];
  const finishContour = (): boolean => {
    if (!start) return true;
    const contour = exactCircularContour(contourArcs);
    if (!contour) return false;
    contours.push(contour);
    start = undefined;
    contourArcs = [];
    return true;
  };

  while (cursor < tokens.length) {
    const token = tokens[cursor]!;
    if (/^[a-z]$/i.test(token)) {
      command = token;
      cursor += 1;
      if (command.toLowerCase() === "z") {
        if (!finishContour()) return undefined;
        command = "";
        continue;
      }
    }

    const lower = command.toLowerCase();
    if (lower === "m") {
      if (cursor + 2 > tokens.length || !finishContour()) return undefined;
      const x = Number(tokens[cursor]);
      const y = Number(tokens[cursor + 1]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;
      current = command === lower ? [current[0] + x, current[1] + y] : [x, y];
      start = current;
      cursor += 2;
      command = "";
      continue;
    }
    if (lower !== "a" || cursor + 7 > tokens.length || !start) {
      return undefined;
    }

    const values = tokens.slice(cursor, cursor + 7).map(Number);
    if (values.some((value) => !Number.isFinite(value))) return undefined;
    cursor += 7;
    const radiusX = Math.abs(values[0]!);
    const radiusY = Math.abs(values[1]!);
    const largeArc = values[3]! === 0 ? 0 : values[3]! === 1 ? 1 : -1;
    const sweep = values[4]! === 0 ? 0 : values[4]! === 1 ? 1 : -1;
    if (radiusX <= 0 || radiusX !== radiusY || largeArc < 0 || sweep < 0) {
      return undefined;
    }
    const end: GeometryPoint =
      command === lower
        ? [current[0] + values[5]!, current[1] + values[6]!]
        : [values[5]!, values[6]!];
    contourArcs.push({
      end,
      largeArc,
      radius: radiusX,
      start: current,
      sweep,
    });
    current = end;
  }
  if (!finishContour() || contours.length === 0) return undefined;

  const windingByCircle = new Map<string, number>();
  for (const contour of contours) {
    const winding =
      fillRule === "evenodd" ? Math.abs(contour.winding) % 2 : contour.winding;
    windingByCircle.set(
      contour.key,
      fillRule === "evenodd"
        ? (windingByCircle.get(contour.key) ?? 0) ^ winding
        : (windingByCircle.get(contour.key) ?? 0) + winding,
    );
  }
  return [...windingByCircle.values()].some((winding) => winding !== 0);
}

function cumulativePathSegmentLengths(
  element: SVGElement,
  segments: readonly NativePathSegment[],
  totalLength: number,
): readonly number[] | undefined {
  try {
    const probe = element.ownerDocument.createElementNS(SVG_NAMESPACE, "path");
    const getTotalLength = Reflect.get(probe, "getTotalLength");
    if (typeof getTotalLength !== "function") return undefined;
    const lengths: number[] = [];
    let cumulative = 0;
    for (const segment of segments) {
      let length = segment.length;
      if (length === undefined) {
        probe.setAttribute("d", segment.data);
        length = Number(Reflect.apply(getTotalLength, probe, []));
      }
      if (!Number.isFinite(length) || length < 0) return undefined;
      if (length > 0) {
        cumulative += length;
        lengths.push(cumulative);
      }
    }
    const tolerance = Math.max(1e-4, totalLength * 1e-4);
    if (Math.abs(cumulative - totalLength) > tolerance) return undefined;
    return lengths;
  } catch {
    return undefined;
  }
}

function boundarySampleHasFill(
  element: SVGElement,
  Point: typeof DOMPoint,
  sample: NativeBoundarySample,
): boolean {
  const [x, y] = sample.point;
  const [tangentX, tangentY] = sample.tangent;
  const tangentLength = Math.hypot(tangentX, tangentY);
  if (!Number.isFinite(tangentLength) || tangentLength <= 0) return false;
  const normalX = -tangentY / tangentLength;
  const normalY = tangentX / tangentLength;
  const coordinatePrecision =
    Math.max(Math.abs(x), Math.abs(y), 1) * Number.EPSILON * 64;
  const browserCoordinateEpsilon = Math.max(Math.abs(x), Math.abs(y), 1) * 1e-7;
  const epsilons = new Set([
    browserCoordinateEpsilon,
    sample.scale * 1e-3,
    sample.scale * 1e-5,
    sample.scale * 1e-7,
    sample.scale * 1e-9,
    coordinatePrecision,
  ]);
  const getScreenCtm = Reflect.get(element, "getScreenCTM");
  if (typeof getScreenCtm === "function") {
    const matrix = Reflect.apply(getScreenCtm, element, []) as DOMMatrix | null;
    if (matrix) {
      const screenNormalScale = Math.hypot(
        matrix.a * normalX + matrix.c * normalY,
        matrix.b * normalX + matrix.d * normalY,
      );
      if (Number.isFinite(screenNormalScale) && screenNormalScale > 0) {
        epsilons.add(
          Math.max(coordinatePrecision, 1 / (256 * screenNormalScale)),
        );
      }
    }
  }
  const isPointInFill = Reflect.get(element, "isPointInFill");
  if (typeof isPointInFill !== "function") return false;
  for (const epsilon of epsilons) {
    if (!Number.isFinite(epsilon) || epsilon <= 0) continue;
    const positive = Boolean(
      Reflect.apply(isPointInFill, element, [
        new Point(x + normalX * epsilon, y + normalY * epsilon),
      ]),
    );
    const negative = Boolean(
      Reflect.apply(isPointInFill, element, [
        new Point(x - normalX * epsilon, y - normalY * epsilon),
      ]),
    );
    if (positive !== negative) return true;
  }
  return false;
}

function renderedPathHasFillArea(
  element: SVGElement,
  presentation?: PresentationMap,
): boolean {
  const measured = presentation?.get(element)?.get(PRESENTATION_PATH_HAS_FILL);
  if (measured !== undefined) return measured === "true";
  try {
    const fillRule = presentationValue(
      element,
      "fill-rule",
      presentation,
    ).toLowerCase();
    const getPointAtLength = Reflect.get(element, "getPointAtLength");
    const getTotalLength = Reflect.get(element, "getTotalLength");
    const isPointInFill = Reflect.get(element, "isPointInFill");
    if (
      typeof getPointAtLength !== "function" ||
      typeof getTotalLength !== "function" ||
      typeof isPointInFill !== "function"
    ) {
      const pathData =
        element.localName === "path"
          ? (element.getAttribute("d") ?? "")
          : (pathDataCandidates(element, presentation)[0] ?? "");
      const segments = pathGeometrySegments(pathData);
      return (
        segments !== undefined &&
        hasUnmatchedPathSegments(segments, fillRule) &&
        pathDataHasPotentialFill(pathData)
      );
    }

    const Point =
      element.ownerDocument.defaultView?.DOMPoint ?? globalThis.DOMPoint;
    if (typeof Point !== "function") return false;
    const sourceCandidates = pathDataCandidates(element, presentation);
    const circularFill = circularArcPathHasFill(
      sourceCandidates[0] ?? "",
      fillRule,
    );
    if (circularFill !== undefined) return circularFill;
    const candidates = sourceCandidates
      .map((data) => ({ data, segments: pathGeometrySegments(data) }))
      .filter(
        (
          candidate,
        ): candidate is Readonly<{
          data: string;
          segments: readonly NativePathSegment[];
        }> => candidate.segments !== undefined,
      );
    if (
      candidates.length === 0 ||
      candidates.every(
        ({ segments }) => !hasUnmatchedPathSegments(segments, fillRule),
      )
    ) {
      return false;
    }

    const selectedSegments = candidates.find(({ segments }) =>
      hasUnmatchedPathSegments(segments, fillRule),
    )!.segments;
    for (const segment of selectedSegments) {
      for (const sample of segment.samples ?? []) {
        if (boundarySampleHasFill(element, Point, sample)) return true;
      }
    }
    if (selectedSegments.every((segment) => segment.samples !== undefined)) {
      return false;
    }

    const totalLength = Number(Reflect.apply(getTotalLength, element, []));
    if (!Number.isFinite(totalLength) || totalLength <= 0) return false;
    const segmentLengths = cumulativePathSegmentLengths(
      element,
      selectedSegments,
      totalLength,
    );
    if (!segmentLengths) return false;

    let segmentStart = 0;
    for (const segmentEnd of segmentLengths) {
      const segmentLength = segmentEnd - segmentStart;
      if (segmentLength <= 0) continue;
      for (const fraction of [0.2, 0.5, 0.8]) {
        const offset = segmentStart + segmentLength * fraction;
        const tangentWindow = Math.max(
          segmentLength * 0.1,
          totalLength * 1e-10,
        );
        const before = Reflect.apply(getPointAtLength, element, [
          Math.max(segmentStart, offset - tangentWindow),
        ]) as DOMPoint;
        const after = Reflect.apply(getPointAtLength, element, [
          Math.min(segmentEnd, offset + tangentWindow),
        ]) as DOMPoint;
        const boundary = Reflect.apply(getPointAtLength, element, [
          offset,
        ]) as DOMPoint;
        const x = boundary.x;
        const y = boundary.y;
        const tangentX = after.x - before.x;
        const tangentY = after.y - before.y;
        const tangentLength = Math.hypot(tangentX, tangentY);
        if (!Number.isFinite(tangentLength) || tangentLength <= 0) continue;
        const normalX = -tangentY / tangentLength;
        const normalY = tangentX / tangentLength;
        const coordinatePrecision =
          Math.max(Math.abs(x), Math.abs(y), 1) * Number.EPSILON * 64;
        const browserCoordinateEpsilon =
          Math.max(Math.abs(x), Math.abs(y), 1) * 1e-7;
        const epsilons = new Set([
          browserCoordinateEpsilon,
          segmentLength * 1e-3,
          segmentLength * 1e-5,
          segmentLength * 1e-7,
          segmentLength * 1e-9,
          coordinatePrecision,
        ]);
        const getScreenCtm = Reflect.get(element, "getScreenCTM");
        if (typeof getScreenCtm === "function") {
          const matrix = Reflect.apply(
            getScreenCtm,
            element,
            [],
          ) as DOMMatrix | null;
          if (matrix) {
            const screenNormalScale = Math.hypot(
              matrix.a * normalX + matrix.c * normalY,
              matrix.b * normalX + matrix.d * normalY,
            );
            if (Number.isFinite(screenNormalScale) && screenNormalScale > 0) {
              epsilons.add(
                Math.max(coordinatePrecision, 1 / (256 * screenNormalScale)),
              );
            }
          }
        }
        for (const epsilon of epsilons) {
          if (!Number.isFinite(epsilon) || epsilon <= 0) continue;
          const positive = Boolean(
            Reflect.apply(isPointInFill, element, [
              new Point(x + normalX * epsilon, y + normalY * epsilon),
            ]),
          );
          const negative = Boolean(
            Reflect.apply(isPointInFill, element, [
              new Point(x - normalX * epsilon, y - normalY * epsilon),
            ]),
          );
          if (positive !== negative) return true;
        }
      }
      segmentStart = segmentEnd;
    }
    return false;
  } catch {
    // Native geometry failures fail closed rather than reveal unpainted paths.
    return false;
  }
}

function fillApplies(
  element: SVGElement,
  presentation?: PresentationMap,
): boolean {
  switch (element.localName.toLowerCase()) {
    case "line":
      return false;
    case "polyline":
    case "polygon":
      return renderedPathHasFillArea(element, presentation);
    case "path":
      return renderedPathHasFillArea(element, presentation);
    case "rect":
      return (
        positiveGeometryBounds(element, presentation) ??
        (positiveAttribute(element, "width") &&
          positiveAttribute(element, "height"))
      );
    case "circle":
      return (
        positiveGeometryBounds(element, presentation) ??
        positiveAttribute(element, "r")
      );
    case "ellipse":
      return (
        positiveGeometryBounds(element, presentation) ??
        (positiveAttribute(element, "rx") && positiveAttribute(element, "ry"))
      );
    default:
      return true;
  }
}

function effectiveGeometryPaint(
  element: SVGElement,
  length: number,
  presentation?: PresentationMap,
): DrawableGeometry | undefined {
  const fill = presentationValue(element, "fill", presentation);
  const fillOpacity = presentationNumber(
    element,
    "fill-opacity",
    1,
    presentation,
  );
  const stroke = presentationValue(element, "stroke", presentation);
  const strokeOpacity = presentationNumber(
    element,
    "stroke-opacity",
    1,
    presentation,
  );
  const strokeWidth = presentationNumber(
    element,
    "stroke-width",
    1,
    presentation,
  );
  const fillVisible =
    fillApplies(element, presentation) && hasPaint(fill) && fillOpacity > 0;
  const strokeVisible =
    hasPaint(stroke) && strokeOpacity > 0 && strokeWidth > 0;

  return fillVisible || strokeVisible
    ? { length, fill, fillOpacity, fillVisible, strokeVisible }
    : undefined;
}

function isVisible(
  element: SVGElement,
  presentation?: PresentationMap,
): boolean {
  const visibility = presentationValue(
    element,
    "visibility",
    presentation,
  ).toLowerCase();
  if (visibility === "hidden" || visibility === "collapse") return false;

  for (
    let current: Element | null = element;
    isSvgNamespaceElement(current);
    current = current.parentElement
  ) {
    if (NON_RENDERED_ELEMENTS.has(current.localName.toLowerCase()))
      return false;

    const display = presentationValue(
      current,
      "display",
      presentation,
    ).toLowerCase();
    const opacity = Number.parseFloat(
      presentationValue(current, "opacity", presentation),
    );
    if (display === "none" || (Number.isFinite(opacity) && opacity <= 0)) {
      return false;
    }

    if (current.localName === "svg") break;
  }

  return true;
}

function isVisibleLeaf(
  element: SVGElement,
  presentation?: PresentationMap,
): boolean {
  return element.children.length === 0 && isVisible(element, presentation);
}

function snapshotAttributes(
  snapshots: AttributeSnapshot[],
  element: SVGElement,
  names: readonly string[],
): void {
  snapshots.push({
    element,
    attributes: new Map(
      names.map((name) => [name, element.getAttribute(name)]),
    ),
  });
}

function restoreSnapshots(snapshots: readonly AttributeSnapshot[]): void {
  for (const snapshot of snapshots) {
    for (const [name, value] of snapshot.attributes) {
      if (value === null) snapshot.element.removeAttribute(name);
      else snapshot.element.setAttribute(name, value);
    }
  }
}

function setInlineStyleProperties(
  element: SVGElement,
  properties: Readonly<Record<string, string>>,
): void {
  const scratch = element.ownerDocument.createElementNS(SVG_NAMESPACE, "g");
  const current = element.getAttribute("style");
  if (current !== null) scratch.setAttribute("style", current);
  for (const [property, value] of Object.entries(properties)) {
    scratch.style.setProperty(property, value);
  }
  const prepared = scratch.getAttribute("style");
  if (prepared === null) element.removeAttribute("style");
  else element.setAttribute("style", prepared);
}

function geometryLength(element: SVGElement): number | undefined {
  const getTotalLength = (element as SVGGeometryElement).getTotalLength;
  if (typeof getTotalLength !== "function") throw animationSetupError();
  const length = getTotalLength.call(element);
  if (Number.isFinite(length) && length > 0) return length;
  if (Object.prototype.hasOwnProperty.call(element, "getTotalLength")) {
    return undefined;
  }
  if (["path", "polygon", "polyline"].includes(element.localName)) {
    for (const data of pathDataCandidates(element)) {
      const segments = pathGeometrySegments(data);
      if (!segments) continue;
      const fallback = segments.reduce(
        (total, segment) =>
          total + (segment.length ?? segment.samples?.[0]?.scale ?? 0),
        0,
      );
      if (Number.isFinite(fallback) && fallback > 0) return fallback;
    }
  }
  return undefined;
}

function animationTiming(
  options: ResolvedMotionOptions,
  delay: number,
  iterations = options.iterations,
): KeyframeAnimationOptions {
  return {
    delay,
    direction: options.direction,
    duration: options.duration,
    easing: options.easing,
    fill: "both",
    iterations,
  };
}

function rootPlan(
  svg: SVGSVGElement,
  keyframes: Keyframe[],
  options: ResolvedMotionOptions,
  iterations = options.iterations,
): MotionPlan {
  return {
    target: svg,
    keyframes,
    timing: animationTiming(options, options.delay, iterations),
  };
}

function staggerStep(stagger: "auto" | number, count: number): number {
  if (typeof stagger === "number") return stagger;
  return count > 1 ? 600 / (count - 1) : 0;
}

function applyOrderingAndStagger(
  plans: MotionPlan[],
  options: ResolvedMotionOptions,
): MotionPlan[] {
  const ordered = options.order === "reverse" ? [...plans].reverse() : plans;
  const step = staggerStep(options.stagger, ordered.length);
  return ordered.map((plan, index) => ({
    ...plan,
    timing: animationTiming(options, options.delay + step * index),
  }));
}

function buildDrawPlans(
  svg: SVGSVGElement,
  options: ResolvedMotionOptions,
  snapshots: AttributeSnapshot[],
  diagnostics: SvgDiagnostic[],
): MotionPlan[] {
  const selected = selectElements(svg, options.selector);
  const drawable = new Map<SVGElement, DrawableGeometry>();
  const presentation = detachedPresentation(svg);

  for (const element of selected) {
    if (
      !DRAWABLE_GEOMETRY.has(element.localName) ||
      !isVisible(element, presentation)
    )
      continue;
    const length = geometryLength(element);
    if (length === undefined) continue;
    const paint = effectiveGeometryPaint(element, length, presentation);
    if (paint) drawable.set(element, paint);
  }

  if (drawable.size === 0) {
    diagnostics.push({ code: "NO_DRAWABLE_GEOMETRY", count: 1 });
    return [rootPlan(svg, [{ opacity: 0 }, { opacity: 1 }], options)];
  }

  const plans: MotionPlan[] = [];
  for (const element of selected) {
    const paint = drawable.get(element);
    if (paint) {
      const { fill, fillOpacity, fillVisible, length, strokeVisible } = paint;
      const startFrame: Keyframe = {
        strokeDasharray: String(length),
        strokeDashoffset: String(length),
      };
      const drawnFrame: Keyframe = {
        offset: 0.8,
        strokeDasharray: String(length),
        strokeDashoffset: "0",
      };
      const finalFrame: Keyframe = {
        strokeDasharray: String(length),
        strokeDashoffset: "0",
      };
      if (fillVisible) {
        startFrame.fillOpacity = 0;
        drawnFrame.fillOpacity = 0;
        finalFrame.fillOpacity = fillOpacity;
      }
      snapshotAttributes(snapshots, element, ["style"]);
      plans.push({
        target: element,
        keyframes: [startFrame, drawnFrame, finalFrame],
        timing: animationTiming(options, options.delay),
        prepare: () => {
          const temporaryStyles: Record<string, string> = {
            "stroke-dasharray": String(length),
            "stroke-dashoffset": String(length),
          };
          if (!strokeVisible) {
            temporaryStyles.stroke = fillVisible ? fill : "currentColor";
            temporaryStyles["stroke-width"] = "1";
            temporaryStyles["stroke-opacity"] = "1";
          }
          setInlineStyleProperties(element, temporaryStyles);
        },
      });
    } else if (
      !DRAWABLE_GEOMETRY.has(element.localName) &&
      isVisibleLeaf(element, presentation)
    ) {
      plans.push({
        target: element,
        keyframes: [{ opacity: 0 }, { opacity: 1 }],
        timing: animationTiming(options, options.delay),
      });
    }
  }

  return applyOrderingAndStagger(plans, options);
}

function buildPlans(
  svg: SVGSVGElement,
  options: ResolvedMotionOptions,
  snapshots: AttributeSnapshot[],
  diagnostics: SvgDiagnostic[],
): MotionPlan[] {
  if (options.preset === "fade") {
    return [rootPlan(svg, [{ opacity: 0 }, { opacity: 1 }], options)];
  }
  if (options.preset === "scale") {
    return [
      rootPlan(
        svg,
        [
          { opacity: 0, transform: "scale(0.92)", transformOrigin: "center" },
          { opacity: 1, transform: "scale(1)", transformOrigin: "center" },
        ],
        options,
      ),
    ];
  }
  if (options.preset === "pulse") {
    return [
      rootPlan(
        svg,
        [
          { transform: "scale(1)", transformOrigin: "center" },
          { transform: "scale(1.05)", transformOrigin: "center" },
          { transform: "scale(1)", transformOrigin: "center" },
        ],
        options,
      ),
    ];
  }
  if (options.preset === "stagger") {
    const presentation = detachedPresentation(svg);
    const plans = selectElements(svg, options.selector)
      .filter((element) => isVisibleLeaf(element, presentation))
      .map((target) => ({
        target,
        keyframes: [{ opacity: 0 }, { opacity: 1 }],
        timing: animationTiming(options, options.delay),
      }));
    return plans.length > 0
      ? applyOrderingAndStagger(plans, options)
      : [rootPlan(svg, [{ opacity: 0 }, { opacity: 1 }], options)];
  }
  return buildDrawPlans(svg, options, snapshots, diagnostics);
}

function createSettledPromise(): {
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: SvgAnimationError) => void;
} {
  let resolve!: () => void;
  let reject!: (error: SvgAnimationError) => void;
  const promise = new Promise<void>((settle, fail) => {
    resolve = settle;
    reject = fail;
  });
  void promise.catch(() => undefined);
  return { promise, resolve, reject };
}

function animationSetupError(): SvgAnimationError {
  return new SvgAnimationError(
    SVG_ANIMATION_ERROR_CODES.setupFailed,
    "The SVG animation could not be created.",
  );
}

function animationFailedError(): SvgAnimationError {
  return new SvgAnimationError(
    SVG_ANIMATION_ERROR_CODES.animationFailed,
    "The SVG animation did not complete.",
  );
}

function retryFailedSetupAnimations(svg: SVGSVGElement): void {
  const pending = FAILED_SETUP_ANIMATIONS.get(svg);
  if (!pending) return;

  const retained: Animation[] = [];
  for (const animation of pending) {
    try {
      animation.cancel();
    } catch {
      retained.push(animation);
    }
  }
  if (retained.length > 0) {
    FAILED_SETUP_ANIMATIONS.set(svg, retained);
    throw animationSetupError();
  }
  FAILED_SETUP_ANIMATIONS.delete(svg);
}

export function animateSvg(
  svg: SVGSVGElement,
  options: SvgMotionOptions = {},
): SvgMotionController {
  assertAnimationEnvironment(svg);
  const resolved = resolveMotionOptions(options);
  retryFailedSetupAnimations(svg);
  const snapshots: AttributeSnapshot[] = [];
  const diagnostics: SvgDiagnostic[] = [];
  let plans: MotionPlan[];
  try {
    plans = buildPlans(svg, resolved, snapshots, diagnostics);
  } catch {
    restoreSnapshots(snapshots);
    throw animationSetupError();
  }

  let animations: Animation[] = [];
  let state: SvgMotionControllerState = resolved.autoplay ? "running" : "idle";
  let generation = 0;
  let currentRun = createSettledPromise();

  const restore = () => restoreSnapshots(snapshots);

  const stopAnimations = (): boolean => {
    const owned = animations;
    const retained: Animation[] = [];
    for (const animation of owned) {
      try {
        animation.cancel();
      } catch {
        retained.push(animation);
      }
    }
    animations = retained;
    restore();
    return retained.length === 0;
  };

  const settle = (
    nextState: SvgMotionControllerState,
  ): SvgAnimationError | undefined => {
    generation += 1;
    if (!stopAnimations()) {
      const error = animationFailedError();
      state = "failed";
      currentRun.reject(error);
      return error;
    }
    state = nextState;
    currentRun.resolve();
    return undefined;
  };

  const failCurrentRun = (error: SvgAnimationError) => {
    generation += 1;
    stopAnimations();
    state = "failed";
    currentRun.reject(error);
  };

  const fail = (runGeneration: number) => {
    if (
      generation !== runGeneration ||
      (state !== "running" && state !== "paused" && state !== "idle")
    ) {
      return;
    }
    failCurrentRun(animationFailedError());
  };

  const watchCurrentRun = (
    runGeneration: number,
    completions: readonly Promise<Animation>[],
  ) => {
    void Promise.all(completions).then(
      () => {
        if (
          generation === runGeneration &&
          (state === "running" || state === "paused" || state === "idle")
        ) {
          settle("finished");
        }
      },
      () => {
        fail(runGeneration);
      },
    );
  };

  const createAnimations = (autoplay: boolean) => {
    restore();
    const created: Animation[] = [];
    const completions: Promise<Animation>[] = [];
    try {
      for (const plan of plans) {
        plan.prepare?.();
        const animation = plan.target.animate(plan.keyframes, plan.timing);
        created.push(animation);
        const completion = animation.finished;
        void completion.catch(() => undefined);
        completions.push(completion);
        if (!autoplay) animation.pause();
      }
    } catch {
      const retained: Animation[] = [];
      for (const animation of created) {
        try {
          animation.cancel();
        } catch {
          retained.push(animation);
        }
      }
      animations = retained;
      restore();
      throw animationSetupError();
    }
    animations = created;
    generation += 1;
    watchCurrentRun(generation, completions);
  };

  try {
    createAnimations(resolved.autoplay);
  } catch (error) {
    stopAnimations();
    if (animations.length > 0) {
      FAILED_SETUP_ANIMATIONS.set(svg, [...animations]);
    }
    throw error;
  }

  const beginFreshRun = (autoplay: boolean, activate?: () => void) => {
    generation += 1;
    const cleanupSucceeded = stopAnimations();
    currentRun.resolve();
    currentRun = createSettledPromise();
    if (!cleanupSucceeded) {
      const error = animationFailedError();
      state = "failed";
      currentRun.reject(error);
      throw error;
    }
    try {
      createAnimations(autoplay);
      activate?.();
    } catch (error) {
      const typed =
        error instanceof SvgAnimationError ? error : animationSetupError();
      failCurrentRun(typed);
      throw typed;
    }
  };

  const runActiveOperation = (operation: () => void) => {
    try {
      operation();
    } catch {
      const error = animationFailedError();
      failCurrentRun(error);
      throw error;
    }
  };

  const settleOrThrow = (nextState: SvgMotionControllerState) => {
    const error = settle(nextState);
    if (error) throw error;
  };

  const controller: SvgMotionController = {
    get state() {
      return state;
    },
    get finished() {
      return currentRun.promise;
    },
    diagnostics,
    play() {
      if (state === "destroyed") return;
      if (state === "failed" || animations.length === 0) beginFreshRun(true);
      else
        runActiveOperation(() => {
          for (const animation of animations) animation.play();
        });
      state = "running";
    },
    pause() {
      if (
        state === "destroyed" ||
        state === "failed" ||
        animations.length === 0
      )
        return;
      runActiveOperation(() => {
        for (const animation of animations) animation.pause();
      });
      state = "paused";
    },
    reverse() {
      if (state === "destroyed") return;
      if (state === "failed" || animations.length === 0) {
        beginFreshRun(false, () => {
          for (const animation of animations) animation.reverse();
        });
      } else {
        runActiveOperation(() => {
          for (const animation of animations) animation.reverse();
        });
      }
      state = "running";
    },
    restart() {
      if (state === "destroyed") return;
      beginFreshRun(false, () => {
        for (const animation of animations) {
          animation.currentTime = 0;
          animation.play();
        }
      });
      state = "running";
    },
    finish() {
      if (
        state === "destroyed" ||
        state === "failed" ||
        animations.length === 0
      )
        return;
      runActiveOperation(() => {
        for (const [index, animation] of animations.entries()) {
          const plan = plans[index];
          if (plan?.timing.iterations === Infinity) {
            animation.currentTime =
              Number(plan.timing.delay ?? 0) +
              Number(plan.timing.duration ?? 0);
          } else {
            animation.finish();
          }
        }
      });
      settleOrThrow("finished");
    },
    cancel() {
      if (state === "destroyed") return;
      settleOrThrow("cancelled");
    },
    seek(progress: number) {
      if (state === "destroyed") return;
      if (!Number.isFinite(progress) || progress < 0 || progress > 1) {
        throw new RangeError("seek progress must be between 0 and 1.");
      }
      if (state === "failed") return;
      const timelineDuration = Math.max(
        0,
        ...plans.map((plan) => {
          const delay = Number(plan.timing.delay ?? 0);
          const duration = Number(plan.timing.duration ?? 0);
          const iterations = Number(plan.timing.iterations ?? 1);
          return delay + duration * (iterations === Infinity ? 1 : iterations);
        }),
      );
      runActiveOperation(() => {
        for (const animation of animations) {
          animation.currentTime = timelineDuration * progress;
        }
      });
    },
    destroy() {
      if (state === "destroyed") return;
      settleOrThrow("destroyed");
    },
  };

  return controller;
}

export async function mountSvgMotion(
  container: Element,
  source: SvgSource,
  options: MountSvgMotionOptions = {},
): Promise<SvgMotionInstance> {
  const { trust, maxBytes, signal, ...motionOptions } = options;
  const prepareOptions: PrepareSvgOptions = {};
  if (trust !== undefined) prepareOptions.trust = trust;
  if (maxBytes !== undefined) prepareOptions.maxBytes = maxBytes;
  if (signal !== undefined) prepareOptions.signal = signal;

  const prepared = await prepareSvg(source, prepareOptions);
  container.append(prepared.svg);

  let controller: SvgMotionController;
  try {
    controller = animateSvg(prepared.svg, motionOptions);
  } catch (error) {
    prepared.svg.remove();
    throw error;
  }

  const diagnostics = [...prepared.diagnostics, ...controller.diagnostics];
  let destroyed = false;
  return {
    svg: prepared.svg,
    controller,
    diagnostics,
    destroy() {
      if (destroyed) return;
      controller.destroy();
      destroyed = true;
      prepared.svg.remove();
    },
  };
}
