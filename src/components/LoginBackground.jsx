import { useEffect, useRef } from "react";

/**
 * HELIOS login backdrop — pure 2D canvas (no three.js).
 * A low sun over a receding solar-grid horizon with drifting embers.
 * Renders behind the login layout; theme tunes sky + intensity.
 * Respects prefers-reduced-motion (single static frame).
 */
export default function LoginBackground({ theme = "dark" }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;

    const prefersReducedMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)"
    )?.matches;

    const isDark = theme === "dark";
    let raf = 0;
    let width = 0;
    let height = 0;
    let dpr = 1;

    const EMBER_COUNT = 70;
    const embers = Array.from({ length: EMBER_COUNT }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: 0.6 + Math.random() * 1.7,
      speed: 0.008 + Math.random() * 0.03,
      drift: (Math.random() - 0.5) * 0.012,
      phase: Math.random() * Math.PI * 2
    }));

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = (t) => {
      const time = t * 0.001;
      // sun anchor — left third, low
      const sunX = width * 0.32;
      const sunY = height * 0.58;
      const sunR = Math.min(width, height) * 0.16;

      // ── sky
      const sky = ctx.createLinearGradient(0, 0, 0, height);
      if (isDark) {
        sky.addColorStop(0, "#06080c");
        sky.addColorStop(0.55, "#0b0e15");
        sky.addColorStop(1, "#13100a");
      } else {
        sky.addColorStop(0, "#0d1016");
        sky.addColorStop(0.5, "#1a1a17");
        sky.addColorStop(1, "#2b2013");
      }
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, width, height);

      // ── sun glow
      const glow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunR * 4.2);
      const glowStrength = isDark ? 0.5 : 0.62;
      glow.addColorStop(0, `rgba(255, 178, 36, ${glowStrength})`);
      glow.addColorStop(0.35, "rgba(255, 140, 20, 0.16)");
      glow.addColorStop(1, "rgba(255, 140, 20, 0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);

      // ── rotating rays (very subtle)
      const rayCount = 18;
      const spin = prefersReducedMotion ? 0 : time * 0.03;
      ctx.save();
      ctx.translate(sunX, sunY);
      ctx.rotate(spin);
      for (let i = 0; i < rayCount; i += 1) {
        const angle = (i / rayCount) * Math.PI * 2;
        ctx.save();
        ctx.rotate(angle);
        const ray = ctx.createLinearGradient(0, 0, sunR * 5, 0);
        ray.addColorStop(0, "rgba(255, 178, 36, 0.05)");
        ray.addColorStop(1, "rgba(255, 178, 36, 0)");
        ctx.fillStyle = ray;
        ctx.fillRect(sunR * 1.1, -0.75, sunR * 5, 1.5);
        ctx.restore();
      }
      ctx.restore();

      // ── sun disc
      const disc = ctx.createRadialGradient(
        sunX - sunR * 0.25,
        sunY - sunR * 0.25,
        sunR * 0.1,
        sunX,
        sunY,
        sunR
      );
      disc.addColorStop(0, "#ffd489");
      disc.addColorStop(0.55, "#ffb224");
      disc.addColorStop(1, "#e07c00");
      ctx.fillStyle = disc;
      ctx.beginPath();
      ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
      ctx.fill();

      // thin technical rings around the sun
      ctx.strokeStyle = "rgba(255, 210, 130, 0.35)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(sunX, sunY, sunR * 1.22, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([2, 6]);
      ctx.strokeStyle = "rgba(255, 210, 130, 0.22)";
      ctx.beginPath();
      ctx.arc(sunX, sunY, sunR * 1.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // ── horizon + perspective grid (solar field)
      const horizonY = height * 0.72;
      ctx.strokeStyle = isDark ? "rgba(255, 178, 36, 0.28)" : "rgba(255, 178, 36, 0.34)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, horizonY);
      ctx.lineTo(width, horizonY);
      ctx.stroke();

      const gridAlpha = isDark ? 0.1 : 0.14;
      ctx.strokeStyle = `rgba(255, 178, 36, ${gridAlpha})`;

      // receding horizontal lines, spacing grows toward viewer
      const rows = 14;
      const scroll = prefersReducedMotion ? 0 : (time * 0.35) % 1;
      for (let i = 0; i < rows; i += 1) {
        const p = (i + scroll) / rows;
        const y = horizonY + Math.pow(p, 2.1) * (height - horizonY);
        ctx.globalAlpha = Math.max(0, 1 - p * 0.65);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // converging vertical lines
      const cols = 22;
      const vanishX = sunX;
      for (let i = 0; i <= cols; i += 1) {
        const xBottom = (i / cols) * width * 1.6 - width * 0.3;
        ctx.beginPath();
        ctx.moveTo(vanishX + (xBottom - vanishX) * 0.08, horizonY);
        ctx.lineTo(xBottom, height);
        ctx.stroke();
      }

      // ── embers
      for (const e of embers) {
        if (!prefersReducedMotion) {
          e.y -= e.speed * 0.016;
          e.x += e.drift * 0.016 + Math.sin(time + e.phase) * 0.00008;
          if (e.y < -0.05) {
            e.y = 1.05;
            e.x = Math.random();
          }
        }
        const ex = e.x * width;
        const ey = e.y * height;
        const twinkle = 0.35 + 0.3 * Math.sin(time * 2 + e.phase);
        ctx.fillStyle = `rgba(255, 190, 80, ${twinkle})`;
        ctx.beginPath();
        ctx.arc(ex, ey, e.r, 0, Math.PI * 2);
        ctx.fill();
      }

      if (!prefersReducedMotion) {
        raf = window.requestAnimationFrame(draw);
      }
    };

    resize();
    window.addEventListener("resize", resize);
    if (prefersReducedMotion) {
      draw(0);
    } else {
      raf = window.requestAnimationFrame(draw);
    }

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [theme]);

  return <canvas ref={canvasRef} className="hx-login-canvas" aria-hidden="true" />;
}
