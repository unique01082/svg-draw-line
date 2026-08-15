import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { SiteRoutes } from "./SiteApp";
import "./styles.css";
import { canHydratePrerenderedRoute } from "./hydration";

const root = document.getElementById("root")!;
const app = (
  <StrictMode>
    <BrowserRouter>
      <SiteRoutes />
    </BrowserRouter>
  </StrictMode>
);

if (
  canHydratePrerenderedRoute(
    root.dataset.prerenderedRoute,
    `${window.location.pathname}${window.location.search}`,
    Boolean(root.querySelector(".site-shell")),
  )
) {
  hydrateRoot(root, app);
} else {
  root.replaceChildren();
  createRoot(root).render(app);
}
