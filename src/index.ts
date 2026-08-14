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
  "clipPath",
  "mask",
  "marker",
  "pattern",
  "symbol",
  "linearGradient",
  "radialGradient",
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
    (element): element is SVGElement => element instanceof SVGElement,
  );
}

function presentationValue(element: SVGElement, property: string): string {
  if (element.isConnected) {
    try {
      const computed = getComputedStyle(element)
        .getPropertyValue(property)
        .trim();
      if (computed) return computed;
    } catch {
      // Fall through to local presentation for incomplete DOM implementations.
    }
  }

  const inline = element.style.getPropertyValue(property).trim();
  if (inline) return inline;
  const attribute = element.getAttribute(property)?.trim();
  if (attribute) return attribute;

  return property === "fill" ? "black" : property === "stroke" ? "none" : "";
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
): number {
  const value = presentationValue(element, property).trim();
  const number = Number.parseFloat(value);
  if (!Number.isFinite(number)) return fallback;
  return value.endsWith("%") ? number / 100 : number;
}

function pointsHaveFillArea(element: SVGElement): boolean {
  const coordinates = (element.getAttribute("points") ?? "")
    .match(/[-+]?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/gi)
    ?.map(Number);
  if (!coordinates || coordinates.length < 6) return false;

  const points: Array<readonly [number, number]> = [];
  for (let index = 0; index + 1 < coordinates.length; index += 2) {
    const x = coordinates[index];
    const y = coordinates[index + 1];
    if (x !== undefined && y !== undefined) points.push([x, y]);
  }
  if (points.length < 3) return false;

  const origin = points[0];
  if (!origin) return false;
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
      if (Math.abs(crossProduct) > Number.EPSILON) return true;
    }
  }
  return false;
}

function fillApplies(element: SVGElement): boolean {
  if (element.localName === "line") return false;
  if (element.localName === "polyline" || element.localName === "polygon") {
    return pointsHaveFillArea(element);
  }
  return true;
}

function effectiveGeometryPaint(
  element: SVGElement,
  length: number,
): DrawableGeometry | undefined {
  const fill = presentationValue(element, "fill");
  const fillOpacity = presentationNumber(element, "fill-opacity", 1);
  const stroke = presentationValue(element, "stroke");
  const strokeOpacity = presentationNumber(element, "stroke-opacity", 1);
  const strokeWidth = presentationNumber(element, "stroke-width", 1);
  const fillVisible = fillApplies(element) && hasPaint(fill) && fillOpacity > 0;
  const strokeVisible =
    hasPaint(stroke) && strokeOpacity > 0 && strokeWidth > 0;

  return fillVisible || strokeVisible
    ? { length, fill, fillOpacity, fillVisible, strokeVisible }
    : undefined;
}

function isVisible(element: SVGElement): boolean {
  for (
    let current: Element | null = element;
    current instanceof SVGElement;
    current = current.parentElement
  ) {
    if (NON_RENDERED_ELEMENTS.has(current.localName)) return false;

    const display = presentationValue(current, "display").toLowerCase();
    const visibility = presentationValue(current, "visibility").toLowerCase();
    const opacity = Number.parseFloat(presentationValue(current, "opacity"));
    if (
      display === "none" ||
      visibility === "hidden" ||
      visibility === "collapse" ||
      (Number.isFinite(opacity) && opacity <= 0)
    ) {
      return false;
    }

    if (current.localName === "svg") break;
  }

  return true;
}

function isVisibleLeaf(element: SVGElement): boolean {
  return element.children.length === 0 && isVisible(element);
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

function geometryLength(element: SVGElement): number | undefined {
  try {
    const length = (element as SVGGeometryElement).getTotalLength();
    return Number.isFinite(length) && length > 0 ? length : undefined;
  } catch {
    return undefined;
  }
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

  for (const element of selected) {
    if (!DRAWABLE_GEOMETRY.has(element.localName) || !isVisible(element))
      continue;
    const length = geometryLength(element);
    if (length === undefined) continue;
    const paint = effectiveGeometryPaint(element, length);
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
          if (!strokeVisible) {
            element.style.setProperty(
              "stroke",
              fillVisible ? fill : "currentColor",
            );
            element.style.setProperty("stroke-width", "1");
            element.style.setProperty("stroke-opacity", "1");
          }
          element.style.setProperty("stroke-dasharray", String(length));
          element.style.setProperty("stroke-dashoffset", String(length));
        },
      });
    } else if (
      !DRAWABLE_GEOMETRY.has(element.localName) &&
      isVisibleLeaf(element)
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
    const plans = selectElements(svg, options.selector)
      .filter(isVisibleLeaf)
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

export function animateSvg(
  svg: SVGSVGElement,
  options: SvgMotionOptions = {},
): SvgMotionController {
  assertAnimationEnvironment(svg);
  const resolved = resolveMotionOptions(options);
  const snapshots: AttributeSnapshot[] = [];
  const diagnostics: SvgDiagnostic[] = [];
  const plans = buildPlans(svg, resolved, snapshots, diagnostics);

  let animations: Animation[] = [];
  let state: SvgMotionControllerState = resolved.autoplay ? "running" : "idle";
  let generation = 0;
  let currentRun = createSettledPromise();

  const restore = () => restoreSnapshots(snapshots);

  const stopAnimations = () => {
    const owned = animations;
    animations = [];
    for (const animation of owned) {
      try {
        animation.cancel();
      } catch {
        // Restoration and settlement must not depend on native cancellation.
      }
    }
    restore();
  };

  const settle = (nextState: SvgMotionControllerState) => {
    generation += 1;
    stopAnimations();
    state = nextState;
    currentRun.resolve();
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
      for (const animation of created) {
        try {
          animation.cancel();
        } catch {
          // Continue rolling back every animation and presentation snapshot.
        }
      }
      restore();
      throw animationSetupError();
    }
    animations = created;
    generation += 1;
    watchCurrentRun(generation, completions);
  };

  createAnimations(resolved.autoplay);

  const beginFreshRun = (autoplay: boolean, activate?: () => void) => {
    generation += 1;
    stopAnimations();
    currentRun.resolve();
    currentRun = createSettledPromise();
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
      if (animations.length === 0) beginFreshRun(true);
      else
        runActiveOperation(() => {
          for (const animation of animations) animation.play();
        });
      state = "running";
    },
    pause() {
      if (state === "destroyed" || animations.length === 0) return;
      for (const animation of animations) animation.pause();
      state = "paused";
    },
    reverse() {
      if (state === "destroyed") return;
      if (animations.length === 0) {
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
      if (state === "destroyed" || animations.length === 0) return;
      for (const [index, animation] of animations.entries()) {
        const plan = plans[index];
        if (plan?.timing.iterations === Infinity) {
          animation.currentTime =
            Number(plan.timing.delay ?? 0) + Number(plan.timing.duration ?? 0);
        } else {
          animation.finish();
        }
      }
      settle("finished");
    },
    cancel() {
      if (state === "destroyed") return;
      settle("cancelled");
    },
    seek(progress: number) {
      if (state === "destroyed") return;
      if (!Number.isFinite(progress) || progress < 0 || progress > 1) {
        throw new RangeError("seek progress must be between 0 and 1.");
      }
      const timelineDuration = Math.max(
        0,
        ...plans.map((plan) => {
          const delay = Number(plan.timing.delay ?? 0);
          const duration = Number(plan.timing.duration ?? 0);
          const iterations = Number(plan.timing.iterations ?? 1);
          return delay + duration * (iterations === Infinity ? 1 : iterations);
        }),
      );
      for (const animation of animations) {
        animation.currentTime = timelineDuration * progress;
      }
    },
    destroy() {
      if (state === "destroyed") return;
      settle("destroyed");
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
      destroyed = true;
      controller.destroy();
      prepared.svg.remove();
    },
  };
}
