import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
import { createFromIconfontCN } from "@ant-design/icons";

createFromIconfontCN({
  scriptUrl: `/icons/animated-icons.js`,
});

createRoot(document.getElementById("root")).render(<App />);
