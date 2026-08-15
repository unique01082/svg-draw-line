import type { DocsVersionMeta } from "./contracts";

export const LATEST_DOCS_VERSION = "0.1";

export const docsVersions: readonly DocsVersionMeta[] = [
  {
    id: "0.1",
    packageVersion: "0.1.0",
    label: "0.1",
    isLatest: true,
    supportedRoutes: [
      "getting-started",
      "core",
      "motion",
      "react",
      "guides",
      "reference",
    ],
  },
] as const;

export function resolveDocsVersion(version: string): DocsVersionMeta | null {
  const resolved = version === "latest" ? LATEST_DOCS_VERSION : version;
  return docsVersions.find(({ id }) => id === resolved) ?? null;
}

export function switchVersionPath(
  pathname: string,
  targetVersion: string,
): string {
  const version = resolveDocsVersion(targetVersion);
  if (!version) return `/docs/${LATEST_DOCS_VERSION}/getting-started`;
  const slug = pathname.match(/^\/docs\/[^/]+\/([^/?#]+)/)?.[1];
  const targetSlug =
    slug && version.supportedRoutes.includes(slug) ? slug : "getting-started";
  return `/docs/${version.id}/${targetSlug}`;
}
