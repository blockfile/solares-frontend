import { useEffect } from "react";

let activeLockCount = 0;
let lockedScrollY = 0;
let previousBodyStyles = null;
let previousHtmlStyles = null;

function applyBodyScrollLock() {
  if (typeof document === "undefined" || typeof window === "undefined") return;

  const body = document.body;
  const html = document.documentElement;

  if (activeLockCount === 0) {
    lockedScrollY = window.scrollY || window.pageYOffset || 0;
    previousBodyStyles = {
      overflow: body.style.overflow,
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width
    };
    previousHtmlStyles = {
      overflow: html.style.overflow,
      overscrollBehavior: html.style.overscrollBehavior
    };

    body.classList.add("body-scroll-locked");
    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${lockedScrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";

    html.style.overflow = "hidden";
    html.style.overscrollBehavior = "none";
  }

  activeLockCount += 1;
}

function releaseBodyScrollLock() {
  if (typeof document === "undefined" || typeof window === "undefined") return;
  if (activeLockCount === 0) return;

  activeLockCount -= 1;
  if (activeLockCount > 0) return;

  const body = document.body;
  const html = document.documentElement;

  body.classList.remove("body-scroll-locked");
  body.style.overflow = previousBodyStyles?.overflow || "";
  body.style.position = previousBodyStyles?.position || "";
  body.style.top = previousBodyStyles?.top || "";
  body.style.left = previousBodyStyles?.left || "";
  body.style.right = previousBodyStyles?.right || "";
  body.style.width = previousBodyStyles?.width || "";

  html.style.overflow = previousHtmlStyles?.overflow || "";
  html.style.overscrollBehavior = previousHtmlStyles?.overscrollBehavior || "";

  window.scrollTo(0, lockedScrollY);
}

export default function useBodyScrollLock(locked) {
  useEffect(() => {
    if (!locked) return undefined;

    applyBodyScrollLock();
    return () => releaseBodyScrollLock();
  }, [locked]);
}
