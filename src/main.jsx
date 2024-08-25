import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
import { createFromIconfontCN } from "@ant-design/icons";
import Icon from "./Icon.jsx";

const icons = [
  "apd-tu",
  "apd-she",
  "apd-hu",
  "apd-gou",
  "apd-ji",
  "apd-niu",
  "apd-long",
  "apd-yang",
  "apd-shu",
  "apd-ma",
  "apd-hou",
  "apd-zhu",
  "apd-baiyang",
  "apd-jinniu",
  "apd-mojie",
  "apd-sheshou",
  "apd-chunv",
  "apd-shizi",
  "apd-shuangyu",
  "apd-shuiping",
  "apd-juxie",
  "apd-tiancheng",
  "apd-shuangzi",
  "apd-tianxie",
];

createFromIconfontCN({
  scriptUrl: `/icons/animated-icons.js`,
});

createRoot(document.getElementById("root")).render(
  <div
    style={{
      display: "grid",
      gridAutoRows: 128,
      gridTemplateColumns: "repeat(2, 1fr)",
      gap: 32,
    }}
  >
    {icons.map((icon) => (
      <Icon key={icon} type={icon} style={{ fontSize: 128 }} />
    ))}
  </div>
);
