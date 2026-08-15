import { Component, type ReactNode } from "react";
import { useLocation } from "react-router-dom";

export class SiteErrorBoundary extends Component<
  { readonly children: ReactNode },
  { readonly failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    // The boundary deliberately avoids reflecting error details into public HTML.
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="empty-page" role="alert">
        <p className="eyebrow">RENDER BOUNDARY</p>
        <h1>This page could not be rendered</h1>
        <p>Reload this route or return to the versioned documentation index.</p>
        <a className="button button--primary" href="/docs/0.1/getting-started">
          Open documentation
        </a>
      </main>
    );
  }
}

export function RouteErrorBoundary({
  children,
}: {
  readonly children: ReactNode;
}) {
  const location = useLocation();
  return (
    <SiteErrorBoundary key={location.pathname}>{children}</SiteErrorBoundary>
  );
}
