import anime from "animejs";
import { useEffect, useRef } from "react";

function revisedRandId() {
  return Math.random()
    .toString(36)
    .replace(/[^a-z]+/g, "")
    .substring(2, 10);
}

function Icon({
  type,
  style,
  options = {},
  path = true,
  fill = true,
  ...rest
}) {
  const { current: id } = useRef(revisedRandId());
  const ref = useRef();
  const animateRef = useRef();
  useEffect(() => {
    setTimeout(() => {
      const source = document.querySelector(`#${type}`);
      if (!source || source.querySelector(`#${id}`)) {
        return;
      }

      const clone = source.cloneNode(true);
      console.log("clone :>> ", clone);
      clone.id = id;
      const els = clone.querySelectorAll("path");
      els.forEach((el) => {
        el.setAttribute(
          "stroke",
          path
            ? el.getAttribute("stroke") ?? el.getAttribute("fill") ?? "white"
            : "none"
        );
        // el.setAttribute("fill", "none");
        el.setAttribute("fill", fill ? el.getAttribute("fill") : "none");
      });
      ref.current.prepend(clone);
      console.log(
        "ref.current.querySelectorAll(`#${id} path`) :>> ",
        ref.current.querySelectorAll(`#${id} path`)
      );

      const animate = anime.timeline({
        targets: ref.current.querySelectorAll(`#${id} path`),
        easing: "easeInOutSine",
        direction: "normal",
        duration: 2000,
        ...options,
        autoplay: false,
      });
      
      if (path) {
        animate.add({
          strokeDashoffset: [anime.setDashoffset, 0],
          strokeWidth: [15, 30, 20, 10],
          delay: (el, i) => i * 300,
        });
      }

      if (fill) {
        animate.add({
          fillOpacity: [0, 1],
          // fill: ['#793ee6', '#c3de2c'],
          duration: 500,
        }, '-=500');
      }

      animate.play();
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
