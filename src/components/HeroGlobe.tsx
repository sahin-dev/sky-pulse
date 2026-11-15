"use client";

import { useEffect, useRef } from "react";
import points from "@/data/globe-points.json";

/** Major hubs used for the animated flight arcs: [lat, lon]. */
const HUBS: [number, number][] = [
  [40.64, -73.78], // JFK
  [51.47, -0.45], // LHR
  [25.25, 55.36], // DXB
  [1.36, 103.99], // SIN
  [35.55, 139.78], // HND
  [33.94, -118.41], // LAX
  [-33.94, 151.18], // SYD
  [-23.43, -46.47], // GRU
  [50.03, 8.56], // FRA
  [22.31, 113.91], // HKG
  [28.56, 77.1], // DEL
  [-26.14, 28.24], // JNB
  [49.19, -123.18], // YVR
  [41.98, -87.9], // ORD
  [19.43, -99.07], // MEX
  [55.97, 37.41], // SVO
];

const ROUTES: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [3, 6], [7, 8], [2, 10], [9, 12],
  [13, 1], [11, 2], [14, 0], [8, 15], [10, 9], [6, 5], [1, 7], [12, 4],
];

const rad = Math.PI / 180;

type Vec = [number, number, number];
const toVec = (lat: number, lon: number): Vec => [
  Math.cos(lat * rad) * Math.cos(lon * rad),
  Math.cos(lat * rad) * Math.sin(lon * rad),
  Math.sin(lat * rad),
];

function slerp(a: Vec, b: Vec, t: number): Vec {
  const dot = Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  const om = Math.acos(dot);
  if (om < 1e-6) return a;
  const s = Math.sin(om);
  const k1 = Math.sin((1 - t) * om) / s;
  const k2 = Math.sin(t * om) / s;
  return [a[0] * k1 + b[0] * k2, a[1] * k1 + b[1] * k2, a[2] * k1 + b[2] * k2];
}

export function HeroGlobe({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const dots: Vec[] = [];
    const flat = points as number[];
    for (let i = 0; i < flat.length; i += 2) dots.push(toVec(flat[i], flat[i + 1]));

    const arcs = ROUTES.map(([a, b], i) => {
      const A = toVec(...HUBS[a]);
      const B = toVec(...HUBS[b]);
      const samples: Vec[] = [];
      const n = 72;
      const dist = Math.acos(Math.min(1, A[0] * B[0] + A[1] * B[1] + A[2] * B[2]));
      const lift = 0.08 + dist * 0.12;
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        const p = slerp(A, B, t);
        const h = 1 + lift * Math.sin(Math.PI * t);
        samples.push([p[0] * h, p[1] * h, p[2] * h]);
      }
      return { samples, offset: (i * 0.137) % 1, speed: 0.05 + ((i * 7) % 5) * 0.012 };
    });
    const hubVecs = HUBS.map((h) => toVec(...h));

    let w = 0, h = 0, dpr = 1;
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = canvas.getBoundingClientRect();
      w = r.width;
      h = r.height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    };
    resize();
    const ro = new ResizeObserver(() => {
      resize();
      if (reduced) draw(performance.now());
    });
    ro.observe(canvas);

    let visible = true;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(canvas);

    let raf = 0;
    let rot = -30 * rad;
    const tilt = 18 * rad;
    let last = performance.now();
    let elapsed = 0;

    // Project a unit-sphere vector -> screen; z>0 means facing the viewer.
    const project = (v: Vec, R: number, cx: number, cy: number) => {
      const cosr = Math.cos(rot), sinr = Math.sin(rot);
      // rotate around z (longitude spin)
      const x1 = v[0] * cosr - v[1] * sinr;
      const y1 = v[0] * sinr + v[1] * cosr;
      const z1 = v[2];
      // tilt around y-axis view: viewer looks along +x
      const ct = Math.cos(tilt), st = Math.sin(tilt);
      const depth = x1 * ct + z1 * st;
      const up = -x1 * st + z1 * ct;
      return { x: cx + y1 * R, y: cy - up * R, z: depth };
    };

    const draw = (now: number) => {
      // rAF timestamps can precede the performance.now() taken at setup → clamp to avoid negative time
      const dt = Math.max(0, Math.min(64, now - last));
      last = now;
      if (!reduced) {
        rot -= dt * 0.00006;
        elapsed += dt / 1000;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const R = Math.min(w, h) * 0.36; // glow (1.35R) stays inside the canvas
      if (R <= 1) return;
      const cx = w / 2, cy = h / 2;

      // Atmosphere glow
      const glow = ctx.createRadialGradient(cx, cy, R * 0.85, cx, cy, R * 1.35);
      glow.addColorStop(0, "rgba(56,189,248,0.22)");
      glow.addColorStop(0.4, "rgba(99,102,241,0.08)");
      glow.addColorStop(1, "rgba(56,189,248,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 1.35, 0, Math.PI * 2);
      ctx.fill();

      // Sphere body
      const body = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
      body.addColorStop(0, "#14224a");
      body.addColorStop(0.7, "#0a1229");
      body.addColorStop(1, "#060a18");
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(125,211,252,0.25)";
      ctx.lineWidth = 1;
      ctx.stroke();

      // Land dots (airports)
      for (const d of dots) {
        const p = project(d, R, cx, cy);
        if (p.z <= 0) continue;
        const a = 0.3 + p.z * 0.7;
        ctx.fillStyle = `rgba(165,210,255,${a.toFixed(3)})`;
        const s = 0.9 + p.z * 1.1;
        ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
      }

      // Arcs + comets
      ctx.lineCap = "round";
      for (const arc of arcs) {
        const n = arc.samples.length - 1;
        // faint full path
        ctx.beginPath();
        let pen = false;
        for (let k = 0; k <= n; k++) {
          const p = project(arc.samples[k], R, cx, cy);
          if (p.z < -0.05) { pen = false; continue; }
          if (!pen) { ctx.moveTo(p.x, p.y); pen = true; } else ctx.lineTo(p.x, p.y);
        }
        ctx.strokeStyle = "rgba(125,211,252,0.13)";
        ctx.lineWidth = 1;
        ctx.stroke();

        // comet: head travels 0 → 1.25 so it fully exits before looping
        const t = ((((elapsed * arc.speed + arc.offset) % 1) + 1) % 1) * 1.3;
        const head = Math.max(0, Math.min(n, Math.floor(t * n)));
        const tail = Math.max(0, head - Math.floor(n * 0.28));
        for (let k = tail; k < head; k++) {
          const p1 = project(arc.samples[k], R, cx, cy);
          const p2 = project(arc.samples[k + 1], R, cx, cy);
          if (p1.z < -0.05 || p2.z < -0.05) continue;
          const f = (k - tail) / Math.max(1, head - tail);
          ctx.strokeStyle = `rgba(${Math.round(56 + 111 * f)},${Math.round(189 - 50 * f)},${Math.round(248)},${(f * 0.95).toFixed(3)})`;
          ctx.lineWidth = 0.6 + f * 1.8;
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
        }
        if (t <= 1) {
          const hp = project(arc.samples[head], R, cx, cy);
          if (hp.z > -0.05) {
            ctx.fillStyle = "rgba(255,255,255,0.95)";
            ctx.shadowColor = "rgba(167,139,250,0.9)";
            ctx.shadowBlur = 10;
            ctx.beginPath();
            ctx.arc(hp.x, hp.y, 1.8, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
          }
        }
      }

      // Hubs
      for (const v of hubVecs) {
        const p = project(v, R, cx, cy);
        if (p.z <= 0) continue;
        const pulse = (((elapsed * 0.8 + v[0]) % 1) + 1) % 1; // keep in [0,1) — v[0] can be negative
        ctx.strokeStyle = `rgba(56,189,248,${(0.6 * (1 - pulse) * p.z).toFixed(3)})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2 + pulse * 7, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = `rgba(224,242,254,${(0.4 + 0.6 * p.z).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
        ctx.fill();
      }

      // Specular rim
      const rim = ctx.createRadialGradient(cx + R * 0.3, cy + R * 0.35, R * 0.6, cx, cy, R);
      rim.addColorStop(0, "rgba(0,0,0,0)");
      rim.addColorStop(1, "rgba(3,5,13,0.55)");
      ctx.fillStyle = rim;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fill();
    };

    const loop = (t: number) => {
      if (visible) draw(t);
      else last = t;
      raf = requestAnimationFrame(loop);
    };
    if (reduced) draw(performance.now());
    else raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
    };
  }, []);

  return <canvas ref={ref} className={className} aria-hidden />;
}
