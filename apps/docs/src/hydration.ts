export function canHydratePrerenderedRoute(
  prerenderedRoute: string | undefined,
  pathname: string,
  hasRenderedShell: boolean,
): boolean {
  return hasRenderedShell && prerenderedRoute === pathname;
}
