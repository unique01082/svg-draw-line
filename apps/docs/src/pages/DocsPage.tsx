import { Navigate, useParams } from "react-router-dom";
import { DocsLayout } from "../layouts/DocsLayout";
import { resolveDocPage } from "../routes/manifest";
import { resolveDocsVersion } from "../versions";
import { contentRegistry } from "../content/registry";
import { mdxComponents } from "../content/MdxComponents";
import { usePageMeta } from "../hooks/usePageMeta";
import { VersionNotFoundPage } from "./NotFoundPage";

export function DocsPage() {
  const { version = "0.1", slug = "getting-started" } = useParams();
  const versionMeta = resolveDocsVersion(version);
  const page = resolveDocPage(version, slug);
  if (!versionMeta) return <VersionNotFoundPage version={version} />;
  if (!page)
    return <Navigate replace to={`/docs/${versionMeta.id}/getting-started`} />;
  return <ResolvedDocsPage page={page} />;
}

function ResolvedDocsPage({
  page,
}: {
  readonly page: NonNullable<ReturnType<typeof resolveDocPage>>;
}) {
  usePageMeta({
    title: page.title,
    description: page.description,
    canonicalPath: `/docs/${page.version}/${page.slug}`,
  });
  const Component =
    contentRegistry[page.version as "0.1"][
      page.slug as keyof (typeof contentRegistry)["0.1"]
    ];
  return (
    <DocsLayout page={page}>
      <Component components={mdxComponents} />
    </DocsLayout>
  );
}
