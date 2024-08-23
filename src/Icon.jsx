import anime from "animejs";
import { useEffect, useRef } from "react";

function revisedRandId() {
  return Math.random().toString(36).replace(/[^a-z]+/g, '').substring(2, 10);
}

function Icon({ type, style, ...rest }) {
  const { current: id } = useRef(revisedRandId());
  const ref = useRef();
  const animate = () =>{
    console.log(1);
    anime({
      targets: ref.current.querySelectorAll(`#${id} path`),
      strokeDashoffset: [anime.setDashoffset, 0],
      fillOpacity: [0, 1],
      easing: "easeInOutSine",
      duration: 1000,
      delay: (el, i) => i * 200,
      direction: "normal",
    });}
  useEffect(() => {
    setTimeout(() => {
      console.log("type :>> ", type);
      const content = document.querySelector(`#${type}`)?.outerHTML;
      console.log("content :>> ", content);
      ref.current.insertAdjacentHTML("afterBegin", content.replace(type, id));

      // animate();
    }, 100);
  }, [id]);

  return (
    <span
      role="img"
      className="anticon"
      style={style}
      data-type={type}
      onClick={animate}
    >
      <svg
        ref={ref}
        width="1em"
        height="1em"
        fill="currentColor"
        aria-hidden="true"
        focusable="false"
        {...rest}
      >
        <use xlinkHref={`#${id}`}></use>
      </svg>
    </span>
  );
}

export default Icon;
