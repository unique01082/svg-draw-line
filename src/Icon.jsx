import anime from "animejs";
import { useEffect, useRef } from "react";

function revisedRandId() {
  return Math.random()
    .toString(36)
    .replace(/[^a-z]+/g, "")
    .substring(2, 10);
}

function Icon({ type, style, ...rest }) {
  const { current: id } = useRef(revisedRandId());
  const ref = useRef();
  const animateRef = useRef();
  useEffect(() => {
    setTimeout(() => {
      const source = document.querySelector(`#${type}`);
      const clone = source.cloneNode(true);
      console.log("clone :>> ", clone);
      clone.id = id;
      const els = clone.querySelectorAll("path");
      els.forEach((el) => {
        el.setAttribute("stroke", el.getAttribute("fill"));
        // el.setAttribute("fill", "none");
        el.setAttribute("fill", el.getAttribute("fill"));
      });
      ref.current.prepend(clone);
      console.log(
        "ref.current.querySelectorAll(`#${id} path`) :>> ",
        ref.current.querySelectorAll(`#${id} path`)
      );

      const animate = anime({
        targets: ref.current.querySelectorAll(`#${id} path`),
        strokeDashoffset: [anime.setDashoffset, 0],
        strokeWidth: [15, 10, 5, 0],
        fillOpacity: { value: [0, 1], delay: 2500, duration: 1000 },
        // fill: ['#793ee6', '#c3de2c'],
        easing: "easeInOutSine",
        duration: 3000,
        delay: (el, i) => i * 300,
        direction: "normal",
      });

      animateRef.current = animate;
    }, 100);
  }, [id]);

  return (
    <span
      role="img"
      className="anticon"
      style={style}
      data-type={type}
      onClick={() => {
        animateRef.current.restart();
      }}
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
        <use xlinkHref={`#${id}`} />
      </svg>
    </span>
  );
}

export default Icon;
