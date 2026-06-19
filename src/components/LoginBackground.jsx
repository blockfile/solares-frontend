import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * Animated WebGL "solar energy field" backdrop for the login screen.
 *
 * Renders a deep-navy space with a softly pulsing solar glow, a drifting
 * gold/azure particle field, and a slowly rotating orbital ring — a thematic
 * nod to Solares' energy business. It is purely decorative:
 *   - falls back silently to the CSS gradient if WebGL is unavailable
 *   - respects prefers-reduced-motion (renders a single static frame)
 *   - pauses while the tab is hidden
 *   - caps the device pixel ratio and disposes everything on unmount
 */
export default function LoginBackground({ theme = "dark" }) {
  const mountRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    const prefersReducedMotion = window.matchMedia
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false;

    // Palette — the hero stays dark in both themes for a premium, dramatic feel.
    const GOLD = new THREE.Color("#f0ba1f");
    const AZURE = new THREE.Color("#7eb6ff");

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "high-performance" });
    } catch (err) {
      // WebGL not supported — the CSS gradient behind the canvas is the fallback.
      return undefined;
    }

    const width = mount.clientWidth || window.innerWidth;
    const height = mount.clientHeight || window.innerHeight;

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 100);
    camera.position.z = 14;

    const root = new THREE.Group();
    scene.add(root);

    // ── Soft radial sprite texture (reused for the glow + round particles) ──
    const makeGlowTexture = () => {
      const size = 128;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(0.25, "rgba(255,255,255,0.85)");
      g.addColorStop(0.55, "rgba(255,255,255,0.25)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    };
    const glowTexture = makeGlowTexture();

    // ── The "sun" — a large, gently pulsing solar glow ──
    const sunMaterial = new THREE.SpriteMaterial({
      map: glowTexture,
      color: GOLD,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const sun = new THREE.Sprite(sunMaterial);
    sun.scale.set(22, 22, 1);
    sun.position.set(7, 5, -6);
    scene.add(sun);

    // ── Drifting particle field (gold + azure embers) ──
    const COUNT = prefersReducedMotion ? 420 : 1100;
    const positions = new Float32Array(COUNT * 3);
    const colors = new Float32Array(COUNT * 3);
    const scales = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i += 1) {
      const r = 6 + Math.random() * 16;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.7;
      positions[i * 3 + 2] = r * Math.cos(phi) - 4;

      const tint = Math.random() > 0.5 ? GOLD : AZURE;
      const shade = 0.55 + Math.random() * 0.45;
      colors[i * 3] = tint.r * shade;
      colors[i * 3 + 1] = tint.g * shade;
      colors[i * 3 + 2] = tint.b * shade;
      scales[i] = 0.4 + Math.random() * 1.4;
    }
    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    particleGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const particleMat = new THREE.PointsMaterial({
      size: 0.5,
      map: glowTexture,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true
    });
    const particles = new THREE.Points(particleGeo, particleMat);
    root.add(particles);

    // ── Orbital rings — a subtle "energy network" accent ──
    const ringGroup = new THREE.Group();
    const ringColors = [GOLD, AZURE, GOLD];
    [6.5, 9, 11.5].forEach((radius, idx) => {
      const ringGeo = new THREE.TorusGeometry(radius, 0.012, 8, 140);
      const ringMat = new THREE.MeshBasicMaterial({
        color: ringColors[idx],
        transparent: true,
        opacity: 0.16 - idx * 0.03,
        blending: THREE.AdditiveBlending
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2.3 + idx * 0.12;
      ring.rotation.y = idx * 0.4;
      ringGroup.add(ring);
    });
    ringGroup.position.set(0, 0, -3);
    root.add(ringGroup);

    // ── Pointer parallax ──
    const pointer = { x: 0, y: 0 };
    const target = { x: 0, y: 0 };
    const onPointerMove = (e) => {
      target.x = (e.clientX / window.innerWidth - 0.5) * 2;
      target.y = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    if (!prefersReducedMotion) window.addEventListener("pointermove", onPointerMove, { passive: true });

    // ── Resize ──
    const handleResize = () => {
      const w = mount.clientWidth || window.innerWidth;
      const h = mount.clientHeight || window.innerHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", handleResize);

    // ── Animation loop ──
    let frameId;
    let running = true;
    const clock = new THREE.Clock();

    const renderFrame = () => {
      const t = clock.getElapsedTime();
      pointer.x += (target.x - pointer.x) * 0.04;
      pointer.y += (target.y - pointer.y) * 0.04;

      root.rotation.y = t * 0.04 + pointer.x * 0.25;
      root.rotation.x = pointer.y * 0.18;
      ringGroup.rotation.z = t * 0.06;
      particles.rotation.y = t * 0.015;

      const pulse = 0.5 + Math.sin(t * 0.9) * 0.08;
      sunMaterial.opacity = pulse;
      sun.scale.setScalar(22 + Math.sin(t * 0.7) * 1.2);

      camera.position.x += (pointer.x * 1.2 - camera.position.x) * 0.04;
      camera.position.y += (-pointer.y * 0.9 - camera.position.y) * 0.04;
      camera.lookAt(scene.position);

      renderer.render(scene, camera);
    };

    const animate = () => {
      if (!running) return;
      renderFrame();
      frameId = requestAnimationFrame(animate);
    };

    if (prefersReducedMotion) {
      renderFrame(); // one static frame
    } else {
      animate();
    }

    // Pause rendering while the tab is hidden to save CPU/GPU.
    const onVisibility = () => {
      if (document.hidden) {
        running = false;
        if (frameId) cancelAnimationFrame(frameId);
      } else if (!prefersReducedMotion && !running) {
        running = true;
        clock.start();
        animate();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    // ── Cleanup ──
    return () => {
      running = false;
      if (frameId) cancelAnimationFrame(frameId);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("visibilitychange", onVisibility);

      particleGeo.dispose();
      particleMat.dispose();
      sunMaterial.dispose();
      glowTexture.dispose();
      ringGroup.children.forEach((ring) => {
        ring.geometry.dispose();
        ring.material.dispose();
      });
      renderer.dispose();
      if (renderer.domElement && renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
    // theme intentionally excluded — hero palette is fixed for visual consistency
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={mountRef} className="login-fx" aria-hidden="true" />;
}
