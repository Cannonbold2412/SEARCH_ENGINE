"use client";

import { useEffect, useRef, useMemo, useCallback } from "react";
import { cn } from "@/lib/utils";

type AiSphereProps = {
  /** 0 = idle, 0–1 = intensity of activity (speech volume / AI thinking) */
  intensity?: number;
  /** Who is currently active */
  active?: "idle" | "user" | "ai" | "connecting";
  size?: number;
  className?: string;
  onClick?: () => void;
  "aria-label"?: string;
};

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(1, s));
  l = Math.max(0, Math.min(1, l));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

export function AiSphere({
  intensity = 0,
  active = "idle",
  size = 64,
  className,
  onClick,
  "aria-label": ariaLabelOverride,
}: AiSphereProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const phaseRef = useRef(0);
  const smoothIntensity = useRef(0);

  const canvasSize = size * 3.5;

  const palette = useMemo(() => {
    switch (active) {
      case "user":
        return { hueBase: 235, hueRange: 50, sat: 0.82, lum: 0.58, glowColor: "99,120,241" };
      case "ai":
        return { hueBase: 270, hueRange: 60, sat: 0.78, lum: 0.55, glowColor: "168,100,247" };
      case "connecting":
        return { hueBase: 42, hueRange: 30, sat: 0.9, lum: 0.52, glowColor: "234,179,50" };
      default:
        return { hueBase: 220, hueRange: 30, sat: 0.25, lum: 0.6, glowColor: "148,163,200" };
    }
  }, [active]);

  const draw = useCallback(function drawFrame() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Ensure smooth scaling/anti-aliasing
    (ctx as any).imageSmoothingEnabled = true;
    (ctx as any).imageSmoothingQuality = "high";

    phaseRef.current += 0.018;
    const t = phaseRef.current;

    const target = Math.min(1, Math.max(0, intensity));
    smoothIntensity.current += (target - smoothIntensity.current) * 0.08;
    const si = smoothIntensity.current;

    const cs = canvasSize;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(cs * dpr)) {
      canvas.width = Math.round(cs * dpr);
      canvas.height = Math.round(cs * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    const cx = cs / 2;
    const cy = cs / 2;
    const baseR = size * 0.3;
    const pulse = si * 0.12 * Math.sin(t * 2.2) + (1 - si) * 0.04 * Math.sin(t * 0.9);
    const orbR = baseR * (1 + pulse);

    ctx.clearRect(0, 0, cs, cs);

    // -- Outer soft glow (larger, smoother falloff) --
    const glowR = orbR * (2.6 + si * 1.2);
    const glowA = 0.04 + si * 0.12;
    const g1 = ctx.createRadialGradient(cx, cy, orbR * 0.2, cx, cy, glowR);
    g1.addColorStop(0, `rgba(${palette.glowColor}, ${glowA})`);
    g1.addColorStop(0.25, `rgba(${palette.glowColor}, ${glowA * 0.6})`);
    g1.addColorStop(0.5, `rgba(${palette.glowColor}, ${glowA * 0.25})`);
    g1.addColorStop(1, `rgba(${palette.glowColor}, 0)`);
    ctx.fillStyle = g1;
    ctx.fillRect(0, 0, cs, cs);

    // -- Mid glow halo --
    const haloR = orbR * (1.6 + si * 0.5);
    const haloA = 0.07 + si * 0.14;
    const g2 = ctx.createRadialGradient(cx, cy, orbR * 0.4, cx, cy, haloR);
    g2.addColorStop(0, `rgba(${palette.glowColor}, ${haloA})`);
    g2.addColorStop(0.5, `rgba(${palette.glowColor}, ${haloA * 0.4})`);
    g2.addColorStop(1, `rgba(${palette.glowColor}, 0)`);
    ctx.fillStyle = g2;
    ctx.beginPath();
    ctx.arc(cx, cy, haloR, 0, Math.PI * 2);
    ctx.fill();

    // -- Iridescent sphere body (ImageData = one buffer write, ~0.25px resolution, fast) --
    const width = canvas.width;
    const height = canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    const iMin = Math.max(0, Math.floor((cx - orbR) * dpr));
    const iMax = Math.min(width, Math.ceil((cx + orbR) * dpr));
    const jMin = Math.max(0, Math.floor((cy - orbR) * dpr));
    const jMax = Math.min(height, Math.ceil((cy + orbR) * dpr));
    const orbR2 = orbR * orbR;
    for (let j = jMin; j < jMax; j++) {
      for (let i = iMin; i < iMax; i++) {
        const lx = (i + 0.5) / dpr - cx;
        const ly = (j + 0.5) / dpr - cy;
        if (lx * lx + ly * ly > orbR2) continue;
        const nx = lx / orbR;
        const ny = ly / orbR;
        const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
        const flowX = nx * 2.5 + t * 1.2;
        const flowY = ny * 2.5 + t * 0.8;
        const pattern =
          Math.cos(flowX + Math.sin(flowY * 1.3)) * 0.5 +
          Math.sin(flowY * 1.7 + Math.cos(flowX * 0.9)) * 0.3 +
          Math.cos((flowX + flowY) * 0.8 + t * 0.5) * 0.2;
        const pattern2 = Math.sin(flowX * 1.5 - flowY * 1.2 + t * 0.7) * 0.15;
        const hue = palette.hueBase + (pattern + pattern2) * palette.hueRange + si * 22 * Math.sin(t + nx * 3);
        const sat = Math.min(1, palette.sat + 0.12 * pattern + 0.05 * nz);
        const lumBase = palette.lum + nz * 0.32 - 0.12 * (1 - nz) + 0.06 * pattern;
        const shadow = (1 - nz) * 0.25;
        const lum = Math.max(0.1, Math.min(1, lumBase - shadow));
        const [r, g, b] = hslToRgb(hue, sat, lum);
        const edgeFade = Math.pow(nz, 0.35);
        const idx = (j * width + i) * 4;
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = Math.round(edgeFade * 255);
      }
    }
    ctx.putImageData(imageData, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, orbR, 0, Math.PI * 2);
    ctx.clip();

    // -- Specular highlight (crisp glass reflection) --
    const specX = cx - orbR * 0.32;
    const specY = cy - orbR * 0.32;
    const specR = orbR * 0.5;
    const specGrad = ctx.createRadialGradient(specX, specY, 0, specX, specY, specR);
    specGrad.addColorStop(0, `rgba(255,255,255,${0.55 + si * 0.25})`);
    specGrad.addColorStop(0.35, `rgba(255,255,255,${0.15 + si * 0.1})`);
    specGrad.addColorStop(0.7, `rgba(255,255,255,${0.03})`);
    specGrad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = specGrad;
    ctx.fillRect(0, 0, cs, cs);

    // -- Secondary specular (smaller kick) --
    const spec2X = cx - orbR * 0.5;
    const spec2Y = cy - orbR * 0.55;
    const spec2Grad = ctx.createRadialGradient(spec2X, spec2Y, 0, spec2X, spec2Y, orbR * 0.2);
    spec2Grad.addColorStop(0, `rgba(255,255,255,${0.2 + si * 0.15})`);
    spec2Grad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = spec2Grad;
    ctx.fillRect(0, 0, cs, cs);

    // -- Rim light (fresnel-style edge) --
    const rimGrad = ctx.createRadialGradient(cx, cy, orbR * 0.75, cx, cy, orbR * 1.08);
    const rimHue = palette.hueBase + 45;
    const [rimR, rimG, rimB] = hslToRgb(rimHue, 0.85, 0.75);
    rimGrad.addColorStop(0, "rgba(255,255,255,0)");
    rimGrad.addColorStop(0.6, "rgba(255,255,255,0)");
    rimGrad.addColorStop(0.85, `rgba(${rimR},${rimG},${rimB},${0.06 + si * 0.09})`);
    rimGrad.addColorStop(1, `rgba(${rimR},${rimG},${rimB},${0.02})`);
    ctx.fillStyle = rimGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, orbR * 1.08, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // -- Floating particles (softer, more when active) --
    if (si > 0.06) {
      const count = Math.floor(6 + si * 12);
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 + t * 1.1 + i * 0.5;
        const drift = Math.sin(t * 2.2 + i * 1.5) * 5;
        const dist = orbR * (1.15 + si * 0.7) + drift;
        const px = cx + Math.cos(angle) * dist;
        const py = cy + Math.sin(angle) * dist;
        const pSize = 1.2 + si * 2;
        const pAlpha = (0.12 + si * 0.28) * (0.7 + 0.3 * Math.sin(t * 2 + i));
        ctx.beginPath();
        ctx.arc(px, py, pSize, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${palette.glowColor},${pAlpha})`;
        ctx.fill();
      }
    }

    animRef.current = requestAnimationFrame(drawFrame);
  }, [intensity, canvasSize, size, palette]);

  useEffect(() => {
    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [draw]);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "appearance-none border-0 bg-transparent p-0 m-0 outline-none flex-shrink-0",
        "transition-transform duration-200",
        onClick && "cursor-pointer hover:scale-105 active:scale-95",
        !onClick && "cursor-default",
        className
      )}
      style={{
        width: canvasSize,
        height: canvasSize,
        lineHeight: 0,
        margin: -(canvasSize - size) / 2,
      }}
      aria-label={
        ariaLabelOverride
          ?? (active === "idle"
            ? "Start voice"
            : active === "connecting"
            ? "Connecting..."
            : active === "user"
            ? "Listening to you"
            : "AI is speaking")
      }
    >
      <canvas
        ref={canvasRef}
        style={{ width: canvasSize, height: canvasSize, display: "block" }}
      />
    </button>
  );
}
