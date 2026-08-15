import type { Specimen } from "../contracts";
import manifest from "./manifest.json";

export const specimens: readonly Specimen[] = manifest.specimens.map(
  (specimen) => ({
    ...specimen,
    source: `/specimens/${specimen.file}`,
  }),
);

export function specimenBySlug(slug: string): Specimen {
  return specimens.find((specimen) => specimen.slug === slug) ?? specimens[0]!;
}
