// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SiteRoutes } from "./SiteApp";
import { SiteErrorBoundary } from "./components/SiteErrorBoundary";
import { docPages } from "./routes/manifest";

afterEach(() => document.body.replaceChildren());

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SiteRoutes />
    </MemoryRouter>,
  );
}

describe("documentation application", () => {
  it("renders a versioned article with sidebar and table of contents", () => {
    renderAt("/docs/0.1/core");
    expect(
      screen.getByRole("heading", { name: "Core API", level: 1 }),
    ).toBeTruthy();
    expect(
      screen.getByRole("navigation", { name: "Documentation" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("navigation", { name: "On this page" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "prepareSvg" }).getAttribute("href"),
    ).toBe("#prepare-svg");
    expect(document.getElementById("prepare-svg")?.textContent).toBe(
      "prepareSvg",
    );
    expect(document.querySelector("pre .hljs-keyword")).not.toBeNull();
  });

  it("preserves the slug through the version selector", () => {
    renderAt("/docs/0.1/react");
    const selector = screen.getByLabelText("Documentation version");
    fireEvent.change(selector, { target: { value: "0.1" } });
    expect(
      screen.getByRole("heading", { name: "React adapter", level: 1 }),
    ).toBeTruthy();
  });

  it("resolves every table-of-contents anchor in its article", () => {
    for (const page of docPages) {
      const view = renderAt(`/docs/0.1/${page.slug}`);
      for (const heading of page.headings) {
        expect(
          document.getElementById(heading.id),
          `${page.slug}#${heading.id}`,
        ).not.toBeNull();
      }
      view.unmount();
    }
  });

  it("resolves latest and renders a version-aware missing page", () => {
    const latest = renderAt("/docs/latest/motion");
    expect(
      screen.getByRole("heading", { name: "Motion system", level: 1 }),
    ).toBeTruthy();
    latest.unmount();

    renderAt("/docs/9.9/unknown");
    expect(
      screen.getByRole("heading", { name: "Version 9.9 is not available" }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Read version 0.1" })
        .getAttribute("href"),
    ).toBe("/docs/0.1/getting-started");
  });

  it("renders the home, playground and changelog routes", () => {
    for (const [path, heading] of [
      ["/", "Motion, measured."],
      ["/playground", "SVG Motion Playground"],
      ["/changelog", "Changelog"],
    ] as const) {
      const view = renderAt(path);
      expect(
        screen.getByRole("heading", { name: heading, level: 1 }),
      ).toBeTruthy();
      view.unmount();
    }
  });

  it("keeps Playground transport disabled until a controller is ready", () => {
    renderAt("/playground");
    expect(
      (screen.getByRole("button", { name: "Play" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByLabelText("Progress") as HTMLInputElement).disabled,
    ).toBe(true);
    expect(screen.getByRole("tab", { name: "source" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "diagnostics" })).toBeTruthy();
  });

  it("provides copy and replay controls for runnable documentation examples", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    renderAt("/docs/0.1/getting-started");
    fireEvent.click(screen.getAllByRole("button", { name: "Copy" })[0]!);
    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Replay" })).toBeTruthy();
  });

  it("contains route rendering failures behind an actionable boundary", () => {
    function BrokenPage(): never {
      throw new Error("private details");
    }
    const previous = console.error;
    const preventError = (event: ErrorEvent) => event.preventDefault();
    console.error = () => undefined;
    window.addEventListener("error", preventError);
    try {
      render(
        <SiteErrorBoundary>
          <BrokenPage />
        </SiteErrorBoundary>,
      );
      expect(screen.getByRole("alert").textContent).toContain(
        "This page could not be rendered",
      );
      expect(screen.getByRole("alert").textContent).not.toContain(
        "private details",
      );
    } finally {
      window.removeEventListener("error", preventError);
      console.error = previous;
    }
  });
});
