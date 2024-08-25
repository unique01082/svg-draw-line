import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
import { createFromIconfontCN } from "@ant-design/icons";
import Icon from "./Icon.jsx";

const icons = [
  "apd-a-haitunkatongdongwu",
  "apd-a-daxiangkatongdongwu",
  "apd-a-houzikatongdongwu",
  "apd-a-hudiekunchongkatong",
  "apd-a-jikatongdongwu",
  "apd-a-laohukatongdongwu",
  "apd-a-goukatongdongwu",
  "apd-a-haimakatongdongwu",
  "apd-a-mianyangkatongdongwu",
  "apd-a-niukatongdongwu",
  "apd-a-mifengkunchong",
  "apd-a-qiekatongdongwu",
  "apd-a-mumamakatongdongwu",
  "apd-a-nainiukatongdongwu",
  "apd-a-shekatongdongwu",
  "apd-a-shayukatongdongwu",
  "apd-a-zhukatongdongwu",
  "apd-a-wuguikatongdongwu",
  "apd-a-lukatongdongwu",
  "apd-a-yujinyukatongdongwu",
  "apd-a-yuhaiyukatongdongwu",
  "apd-a-yukatongdongwu",
  "apd-woniu",
  "apd-a-yingkatongdongwu",
  "apd-a-zhangyukatongdongwu",
  "apd-a-pangxiekatongdongwu",
  "apd-a-birdniaodongwukatong",
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
  scriptUrl: `/icons/iconfont.js`,
});

createRoot(document.getElementById("root")).render(
  <div
    style={{
      display: "grid",
      gridAutoRows: 128,
      gridTemplateColumns: "repeat(6, 1fr)",
      gap: 32,
    }}
  >
    {icons.map((icon) => (
      <Icon key={icon} type={icon} style={{ fontSize: 128 }} />
    ))}
  </div>
);
