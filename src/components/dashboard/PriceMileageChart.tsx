"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ExternalLink, X, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";

interface Point {
  mileage: number;
  price: number;
  title?: string;
  url?: string;
}

interface Props {
  good: Point[];
  fair: Point[];
  overpriced: Point[];
}

type Category = "good" | "fair" | "overpriced";

const COLORS: Record<Category, string> = {
  good: "#16a34a",
  fair: "#d97706",
  overpriced: "#dc2626",
};
const LABELS: Record<Category, string> = {
  good: "Good Deal",
  fair: "Fair",
  overpriced: "Overpriced",
};
const CATEGORIES: Category[] = ["good", "fair", "overpriced"];

const M = { top: 12, right: 16, bottom: 44, left: 52 }; // margins

interface ZoomState { x: number; y: number; k: number }

function niceStep(range: number): number {
  const rough = range / 5;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const steps = [1, 2, 2.5, 5, 10];
  for (const s of steps) if (s * mag >= rough) return s * mag;
  return 10 * mag;
}

export function PriceMileageChart({ good, fair, overpriced }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [w, setW] = useState(360);
  const [h, setH] = useState(300);
  const [zoom, setZoom] = useState<ZoomState>({ x: 0, y: 0, k: 1 });
  const [visible, setVisible] = useState<Record<Category, boolean>>({ good: true, fair: true, overpriced: true });
  const [popup, setPopup] = useState<(Point & { cat: Category; px: number; py: number }) | null>(null);

  // Track touch/drag state
  const drag = useRef<{ active: boolean; lastX: number; lastY: number; lastDist: number | null; moved: boolean }>({
    active: false, lastX: 0, lastY: 0, lastDist: null, moved: false,
  });

  // Measure container
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const cw = e.contentRect.width;
      setW(cw);
      setH(Math.round(Math.min(380, Math.max(260, cw * 0.72))));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const cw = w - M.left - M.right;
  const ch = h - M.top - M.bottom;

  const all = [...good, ...fair, ...overpriced];
  const mMax = Math.max(...all.map(p => p.mileage), 15000) * 1.06;
  const pMin = Math.min(...all.map(p => p.price), 40000) * 0.97;
  const pMax = Math.max(...all.map(p => p.price), 80000) * 1.03;

  // Base chart coords (before zoom)
  const bx = (m: number) => (m / mMax) * cw;
  const by = (p: number) => ch * (1 - (p - pMin) / (pMax - pMin));

  // Screen coords inside chart area (after zoom)
  const sx = (m: number) => bx(m) * zoom.k + zoom.x;
  const sy = (p: number) => by(p) * zoom.k + zoom.y;

  const clamp = useCallback((z: ZoomState): ZoomState => {
    const k = Math.min(12, Math.max(1, z.k));
    const x = k <= 1 ? 0 : Math.min(0, Math.max(cw - cw * k, z.x));
    const y = k <= 1 ? 0 : Math.min(0, Math.max(ch - ch * k, z.y));
    return { x, y, k };
  }, [cw, ch]);

  // Zoom toward a point in chart-local coords
  const zoomAt = useCallback((factor: number, cx_: number, cy_: number) => {
    setZoom(prev => {
      const k2 = prev.k * factor;
      const x2 = cx_ - (cx_ - prev.x) * (k2 / prev.k);
      const y2 = cy_ - (cy_ - prev.y) * (k2 / prev.k);
      return clamp({ x: x2, y: y2, k: k2 });
    });
  }, [clamp]);

  // Mouse wheel
  function onWheel(e: React.WheelEvent<SVGSVGElement>) {
    e.preventDefault();
    const rect = svgRef.current!.getBoundingClientRect();
    const cx_ = e.clientX - rect.left - M.left;
    const cy_ = e.clientY - rect.top - M.top;
    zoomAt(e.deltaY < 0 ? 1.25 : 0.8, cx_, cy_);
  }

  // Touch handlers
  function onTouchStart(e: React.TouchEvent) {
    drag.current.moved = false;
    if (e.touches.length === 1) {
      drag.current.active = true;
      drag.current.lastX = e.touches[0].clientX;
      drag.current.lastY = e.touches[0].clientY;
      drag.current.lastDist = null;
    } else if (e.touches.length === 2) {
      drag.current.active = false;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      drag.current.lastDist = Math.hypot(dx, dy);
      drag.current.lastX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      drag.current.lastY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
    }
  }

  function onTouchMove(e: React.TouchEvent) {
    e.preventDefault();
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const mx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const my = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      const rect = svgRef.current!.getBoundingClientRect();
      const cx_ = mx - rect.left - M.left;
      const cy_ = my - rect.top - M.top;
      if (drag.current.lastDist) {
        zoomAt(dist / drag.current.lastDist, cx_, cy_);
        drag.current.moved = true;
      }
      drag.current.lastDist = dist;
      drag.current.lastX = mx;
      drag.current.lastY = my;
    } else if (e.touches.length === 1 && drag.current.active) {
      const ddx = e.touches[0].clientX - drag.current.lastX;
      const ddy = e.touches[0].clientY - drag.current.lastY;
      if (Math.abs(ddx) > 2 || Math.abs(ddy) > 2) {
        drag.current.moved = true;
        setZoom(prev => clamp({ ...prev, x: prev.x + ddx, y: prev.y + ddy }));
      }
      drag.current.lastX = e.touches[0].clientX;
      drag.current.lastY = e.touches[0].clientY;
    }
  }

  function onTouchEnd() {
    drag.current.active = false;
    drag.current.lastDist = null;
  }

  // Mouse drag for desktop
  function onMouseDown(e: React.MouseEvent) {
    drag.current.active = true;
    drag.current.moved = false;
    drag.current.lastX = e.clientX;
    drag.current.lastY = e.clientY;
  }
  function onMouseMove(e: React.MouseEvent) {
    if (!drag.current.active) return;
    const ddx = e.clientX - drag.current.lastX;
    const ddy = e.clientY - drag.current.lastY;
    if (Math.abs(ddx) > 1 || Math.abs(ddy) > 1) {
      drag.current.moved = true;
      setZoom(prev => clamp({ ...prev, x: prev.x + ddx, y: prev.y + ddy }));
      drag.current.lastX = e.clientX;
      drag.current.lastY = e.clientY;
    }
  }
  function onMouseUp() { drag.current.active = false; }

  // Axis ticks based on visible data range
  const visMinM = Math.max(0, (-zoom.x / zoom.k) * mMax / cw);
  const visMaxM = Math.min(mMax, ((cw - zoom.x) / zoom.k) * mMax / cw);
  const visMinP = pMin + (1 - (ch - zoom.y) / zoom.k / ch) * (pMax - pMin);
  const visMaxP = pMin + (1 - (-zoom.y) / zoom.k / ch) * (pMax - pMin);

  const mStep = niceStep(visMaxM - visMinM);
  const pStep = niceStep(visMaxP - visMinP);
  const mTicks: number[] = [];
  for (let v = Math.ceil(visMinM / mStep) * mStep; v <= visMaxM; v += mStep) mTicks.push(v);
  const pTicks: number[] = [];
  for (let v = Math.ceil(visMinP / pStep) * pStep; v <= visMaxP; v += pStep) pTicks.push(v);

  const data: Record<Category, Point[]> = { good, fair, overpriced };
  const isZoomed = zoom.k > 1.05;

  return (
    <div ref={containerRef} className="relative" style={{ userSelect: "none" }}>

      {/* Interactive legend */}
      <div className="flex flex-wrap gap-2 mb-3">
        {CATEGORIES.map(cat => {
          const count = data[cat].length;
          const on = visible[cat];
          return (
            <button
              key={cat}
              onClick={() => setVisible(v => ({ ...v, [cat]: !v[cat] }))}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all active:scale-95 ${
                on ? "border-transparent text-white shadow-sm" : "bg-white border-border text-muted-foreground"
              }`}
              style={on ? { backgroundColor: COLORS[cat] } : {}}
            >
              <span className="w-2 h-2 rounded-full flex-shrink-0 border border-current/30"
                style={{ backgroundColor: on ? "rgba(255,255,255,0.5)" : COLORS[cat] }} />
              {LABELS[cat]}
              <span className={`text-[10px] ${on ? "opacity-70" : "opacity-50"}`}>({count})</span>
            </button>
          );
        })}
      </div>

      {/* Zoom buttons */}
      <div className="absolute top-10 right-0 z-10 flex flex-col gap-1">
        <button
          onClick={() => zoomAt(1.5, cw / 2, ch / 2)}
          className="w-8 h-8 rounded-lg bg-white border border-border shadow-sm flex items-center justify-center hover:bg-gray-50 active:scale-95 text-foreground"
        ><ZoomIn className="w-3.5 h-3.5" /></button>
        <button
          onClick={() => zoomAt(1 / 1.5, cw / 2, ch / 2)}
          className="w-8 h-8 rounded-lg bg-white border border-border shadow-sm flex items-center justify-center hover:bg-gray-50 active:scale-95 text-foreground"
        ><ZoomOut className="w-3.5 h-3.5" /></button>
        {isZoomed && (
          <button
            onClick={() => setZoom({ x: 0, y: 0, k: 1 })}
            className="w-8 h-8 rounded-lg bg-white border border-border shadow-sm flex items-center justify-center hover:bg-gray-50 active:scale-95 text-foreground"
          ><RotateCcw className="w-3.5 h-3.5" /></button>
        )}
      </div>

      {/* SVG chart */}
      <svg
        ref={svgRef}
        width="100%"
        height={h}
        className="overflow-visible"
        style={{ touchAction: "none", cursor: drag.current.active ? "grabbing" : "grab" }}
        onWheel={onWheel}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        <defs>
          <clipPath id="pm-clip">
            <rect x={0} y={0} width={cw} height={ch} />
          </clipPath>
        </defs>

        <g transform={`translate(${M.left},${M.top})`}>
          {/* Grid lines */}
          <g clipPath="url(#pm-clip)">
            {mTicks.map(v => (
              <line key={`gx-${v}`}
                x1={sx(v)} y1={0} x2={sx(v)} y2={ch}
                stroke="#e5e7eb" strokeDasharray="3 4" strokeWidth={1} />
            ))}
            {pTicks.map(v => (
              <line key={`gy-${v}`}
                x1={0} y1={sy(v)} x2={cw} y2={sy(v)}
                stroke="#e5e7eb" strokeDasharray="3 4" strokeWidth={1} />
            ))}
          </g>

          {/* Chart border */}
          <rect x={0} y={0} width={cw} height={ch} fill="none" stroke="#e5e7eb" strokeWidth={1} />

          {/* Data points */}
          <g clipPath="url(#pm-clip)">
            {CATEGORIES.map(cat =>
              visible[cat] && data[cat].map((p, i) => {
                const cx_ = sx(p.mileage);
                const cy_ = sy(p.price);
                return (
                  <g key={`${cat}-${i}`}>
                    {/* Large invisible touch/click target */}
                    <circle
                      cx={cx_} cy={cy_} r={20}
                      fill="transparent"
                      style={{ cursor: "pointer" }}
                      onClick={(e) => {
                        if (drag.current.moved) return;
                        e.stopPropagation();
                        const rect = containerRef.current!.getBoundingClientRect();
                        setPopup({ ...p, cat, px: e.clientX - rect.left, py: e.clientY - rect.top });
                      }}
                      onTouchEnd={(e) => {
                        if (drag.current.moved) return;
                        e.preventDefault();
                        e.stopPropagation();
                        const t = e.changedTouches[0];
                        const rect = containerRef.current!.getBoundingClientRect();
                        setPopup({ ...p, cat, px: t.clientX - rect.left, py: t.clientY - rect.top });
                      }}
                    />
                    {/* Visible dot */}
                    <circle
                      cx={cx_} cy={cy_} r={6}
                      fill={COLORS[cat]}
                      stroke="white"
                      strokeWidth={1.5}
                      opacity={0.85}
                      style={{ pointerEvents: "none" }}
                    />
                  </g>
                );
              })
            )}
          </g>

          {/* X axis ticks */}
          <g>
            {mTicks.map(v => {
              const x = sx(v);
              if (x < -5 || x > cw + 5) return null;
              return (
                <text key={`tx-${v}`} x={x} y={ch + 16}
                  textAnchor="middle" fontSize={10} fill="hsl(215 15% 44%)">
                  {v === 0 ? "0" : `${(v / 1000).toFixed(0)}k`}
                </text>
              );
            })}
            <text x={cw / 2} y={ch + 34} textAnchor="middle" fontSize={10} fill="hsl(215 15% 55%)">Mileage</text>
          </g>

          {/* Y axis ticks */}
          {pTicks.map(v => {
            const y = sy(v);
            if (y < -5 || y > ch + 5) return null;
            return (
              <text key={`ty-${v}`} x={-8} y={y + 4}
                textAnchor="end" fontSize={10} fill="hsl(215 15% 44%)">
                ${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}
              </text>
            );
          })}
        </g>
      </svg>

      {/* Hint text */}
      <p className="text-center text-[10px] text-muted-foreground mt-1">
        {isZoomed ? "Drag to pan · Pinch or scroll to zoom" : "Tap a dot to see details · Pinch or use +/− to zoom in"}
      </p>

      {/* Backdrop to close popup */}
      {popup && (
        <div className="fixed inset-0 z-20" onClick={() => setPopup(null)} />
      )}

      {/* Popup card */}
      {popup && (() => {
        const pw = 230;
        const ph = 130;
        const contW = containerRef.current?.getBoundingClientRect().width ?? w;
        const contH = containerRef.current?.getBoundingClientRect().height ?? h;
        let left = popup.px - pw / 2;
        let top = popup.py - ph - 14;
        if (left < 4) left = 4;
        if (left + pw > contW - 4) left = contW - pw - 4;
        if (top < 4) top = popup.py + 18;
        if (top + ph > contH) top = popup.py - ph - 14;
        return (
          <div
            className="absolute z-30 bg-white rounded-2xl border border-border shadow-2xl p-4"
            style={{ left, top, width: pw, pointerEvents: "auto" }}
            onClick={e => e.stopPropagation()}
            onTouchEnd={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: COLORS[popup.cat] }}>
                {LABELS[popup.cat]}
              </span>
              <button onClick={() => setPopup(null)} className="text-muted-foreground hover:text-foreground -mr-1 -mt-1 p-1">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            {popup.title && (
              <p className="text-sm font-semibold text-foreground leading-snug mb-2" style={{
                display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden"
              }}>
                {popup.title}
              </p>
            )}
            <div className="flex items-center gap-3 mb-3">
              <span className="text-base font-black text-foreground">${popup.price.toLocaleString()}</span>
              <span className="text-xs text-muted-foreground">{popup.mileage.toLocaleString()} mi</span>
            </div>
            {popup.url && (
              <a
                href={popup.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-2 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90 active:opacity-80"
                style={{ backgroundColor: COLORS[popup.cat] }}
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Open Listing
              </a>
            )}
          </div>
        );
      })()}
    </div>
  );
}
