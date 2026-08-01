import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  X,
  Play,
  Pause,
  Maximize2,
  Minimize2,
  Eye,
  Ruler,
  Grid2X2,
  Split,
  FileCode,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useLang } from "@/lib/i18n";

export interface DicomStudyProps {
  id?: string;
  patientName?: string;
  mrn?: string;
  modality?: string;
  examTitle?: string;
  date?: string;
  totalSlices?: number;
  studyInstanceUid?: string;
}

interface DicomViewerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  study: DicomStudyProps | null;
}

type WlPreset = "soft" | "bone" | "lung" | "brain";
type ActiveTool = "select" | "pan" | "ruler" | "hu";

const PRESETS: Record<WlPreset, { name: string; width: number; level: number }> = {
  soft: { name: "Soft Tissue", width: 400, level: 40 },
  bone: { name: "Bone", width: 2000, level: 500 },
  lung: { name: "Lung", width: 1500, level: -600 },
  brain: { name: "Brain", width: 80, level: 40 },
};

export function DicomViewerModal({ open, onOpenChange, study }: DicomViewerModalProps) {
  const { t } = useLang();
  const totalSlices = study?.totalSlices || 48;
  const [currentSlice, setCurrentSlice] = useState(Math.floor(totalSlices / 2));
  const [preset, setPreset] = useState<WlPreset>("soft");
  const [zoom, setZoom] = useState(1);
  const [invert, setInvert] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showMetadata, setShowMetadata] = useState(false);
  const [layoutMode, setLayoutMode] = useState<"1x1" | "1x2">("1x1");
  const [activeTool, setActiveTool] = useState<ActiveTool>("select");
  const [measurementDistance, setMeasurementDistance] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasSecondaryRef = useRef<HTMLCanvasElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);

  // Reset ALL viewport state when opening a new study
  useEffect(() => {
    if (open) {
      setCurrentSlice(Math.floor(totalSlices / 2));
      setZoom(1);
      setInvert(false);
      setIsPlaying(false);
      setIsFullscreen(false);
      setShowMetadata(false);
      setLayoutMode("1x1");
      setActiveTool("select");
      setMeasurementDistance(null);
      setPreset("soft");
    }
  }, [open, totalSlices]);

  // Cine loop animation
  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    if (isPlaying) {
      timer = setInterval(() => {
        setCurrentSlice((prev) => (prev >= totalSlices ? 1 : prev + 1));
      }, 120);
    }
    return () => clearInterval(timer);
  }, [isPlaying, totalSlices]);

  // Draw procedural DICOM slice simulation on Canvas
  const drawSlice = useCallback(
    (
      canvas: HTMLCanvasElement | null,
      sliceIdx: number,
      presetType: WlPreset,
      isInv: boolean,
      secondary = false,
    ) => {
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const width = canvas.width;
      const height = canvas.height;

      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, width, height);

      const centerX = width / 2;
      const centerY = height / 2;
      const radius = Math.min(width, height) * 0.38;

      ctx.save();
      ctx.translate(centerX, centerY);

      // Anatomical structure background
      const gradient = ctx.createRadialGradient(0, 0, 10, 0, 0, radius);
      if (presetType === "bone") {
        gradient.addColorStop(0, "rgba(220, 220, 225, 0.95)");
        gradient.addColorStop(0.5, "rgba(160, 160, 170, 0.7)");
        gradient.addColorStop(0.85, "rgba(255, 255, 255, 0.9)");
        gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
      } else if (presetType === "lung") {
        gradient.addColorStop(0, "rgba(30, 30, 35, 0.9)");
        gradient.addColorStop(0.4, "rgba(10, 10, 15, 0.95)");
        gradient.addColorStop(0.8, "rgba(120, 120, 130, 0.8)");
        gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
      } else if (presetType === "brain") {
        gradient.addColorStop(0, "rgba(180, 180, 190, 0.9)");
        gradient.addColorStop(0.3, "rgba(110, 110, 120, 0.85)");
        gradient.addColorStop(0.7, "rgba(140, 140, 150, 0.75)");
        gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
      } else {
        gradient.addColorStop(0, "rgba(140, 140, 150, 0.85)");
        gradient.addColorStop(0.4, "rgba(90, 90, 100, 0.75)");
        gradient.addColorStop(0.8, "rgba(210, 210, 220, 0.9)");
        gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
      }

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.ellipse(
        0,
        0,
        radius * 0.9,
        radius,
        (secondary ? 90 : 0) * (Math.PI / 180),
        0,
        Math.PI * 2,
      );
      ctx.fill();

      // Internal details modulated by slice number
      const sliceFactor = (sliceIdx / totalSlices) * Math.PI;
      const innerRadius = radius * 0.5 * Math.sin(sliceFactor);

      ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
      ctx.lineWidth = 2;

      for (let i = 0; i < 4; i++) {
        const angle = (i * Math.PI) / 2 + sliceFactor;
        const x = Math.cos(angle) * innerRadius;
        const y = Math.sin(angle) * innerRadius;
        ctx.beginPath();
        ctx.arc(x, y, radius * 0.2, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.restore();

      // Apply color inversion if toggled
      if (isInv) {
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
          data[i] = 255 - data[i];
          data[i + 1] = 255 - data[i + 1];
          data[i + 2] = 255 - data[i + 2];
        }
        ctx.putImageData(imageData, 0, 0);
      }
    },
    [totalSlices],
  );

  // Draw canvas whenever relevant state changes — use rAF to ensure canvas is mounted
  useEffect(() => {
    if (!open) return;
    const frameId = requestAnimationFrame(() => {
      drawSlice(canvasRef.current, currentSlice, preset, invert, false);
      if (layoutMode === "1x2") {
        drawSlice(
          canvasSecondaryRef.current,
          Math.max(1, totalSlices - currentSlice),
          preset,
          invert,
          true,
        );
      }
    });
    return () => cancelAnimationFrame(frameId);
  }, [open, currentSlice, preset, invert, layoutMode, totalSlices, drawSlice]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp" || e.key === "ArrowRight") {
        e.preventDefault();
        setCurrentSlice((s) => Math.min(totalSlices, s + 1));
      } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
        e.preventDefault();
        setCurrentSlice((s) => Math.max(1, s - 1));
      } else if (e.key === " ") {
        e.preventDefault();
        setIsPlaying((v) => !v);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, totalSlices]);

  // Scroll wheel slice navigation on viewport
  useEffect(() => {
    if (!open) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.deltaY > 0) {
        setCurrentSlice((s) => Math.min(totalSlices, s + 1));
      } else if (e.deltaY < 0) {
        setCurrentSlice((s) => Math.max(1, s - 1));
      }
    };
    viewport.addEventListener("wheel", handleWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", handleWheel);
  }, [open, totalSlices]);

  const activeWl = PRESETS[preset];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={`${
          isFullscreen
            ? "max-w-none w-screen h-screen rounded-none"
            : "max-w-6xl h-[92vh] rounded-3xl"
        } border border-zinc-800 bg-zinc-950 text-zinc-100 shadow-2xl overflow-hidden p-0 flex flex-col [&>button]:hidden transition-all`}
      >
        {/* Header Bar */}
        <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/90 px-6 py-3.5 select-none">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/20 text-primary border border-primary/30">
              <Eye className="h-5 w-5" />
            </span>
            <div>
              <DialogTitle className="flex items-center gap-2 text-base font-semibold text-white">
                {study?.patientName || "Medical Study"}
                <span className="rounded bg-zinc-800 px-2 py-0.5 font-mono text-[10px] text-zinc-300">
                  MRN: {study?.mrn || "PAT-RECORD"}
                </span>
              </DialogTitle>
              <DialogDescription className="text-xs text-zinc-400">
                {study?.examTitle || study?.modality || "Radiology Scan"} ·{" "}
                {t("portal.dicomWorkstation", "RCMS DICOM Workstation")}
              </DialogDescription>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* W/L Preset selector */}
            <div className="flex rounded-xl border border-zinc-800 bg-zinc-900 p-1 text-xs">
              {(["soft", "bone", "lung", "brain"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPreset(p)}
                  className={`rounded-lg px-2.5 py-1 transition ${
                    preset === p
                      ? "bg-primary text-white font-semibold shadow-soft"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {PRESETS[p].name}
                </button>
              ))}
            </div>

            {/* Layout switcher */}
            <div className="flex rounded-xl border border-zinc-800 bg-zinc-900 p-1 text-xs">
              <button
                onClick={() => setLayoutMode("1x1")}
                className={`rounded-lg p-1.5 transition ${layoutMode === "1x1" ? "bg-primary text-white" : "text-zinc-400 hover:text-zinc-200"}`}
                title="Single Viewport (1x1)"
              >
                <Grid2X2 className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setLayoutMode("1x2")}
                className={`rounded-lg p-1.5 transition ${layoutMode === "1x2" ? "bg-primary text-white" : "text-zinc-400 hover:text-zinc-200"}`}
                title="Dual Comparison Viewport (1x2)"
              >
                <Split className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Tools */}
            <button
              onClick={() => {
                setActiveTool(activeTool === "ruler" ? "select" : "ruler");
                setMeasurementDistance(activeTool === "ruler" ? null : "34.8 mm");
              }}
              className={`rounded-xl border border-zinc-800 px-3 py-1.5 text-xs font-medium transition ${
                activeTool === "ruler"
                  ? "border-primary-500/40 bg-primary-500/20 text-primary-300"
                  : "bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
              }`}
            >
              <Ruler className="h-3.5 w-3.5 inline-block mr-1" /> Ruler
            </button>

            <button
              onClick={() => setInvert((v) => !v)}
              className={`rounded-xl border border-zinc-800 px-3 py-1.5 text-xs font-medium transition ${
                invert
                  ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                  : "bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
              }`}
            >
              Invert
            </button>

            <button
              onClick={() => setShowMetadata((v) => !v)}
              className={`rounded-xl border border-zinc-800 p-2 text-xs transition ${
                showMetadata
                  ? "bg-primary text-white"
                  : "bg-zinc-900 text-zinc-400 hover:text-zinc-200"
              }`}
              title="Toggle DICOM Header Tags"
            >
              <FileCode className="h-4 w-4" />
            </button>

            <button
              onClick={() => setIsFullscreen((v) => !v)}
              className="rounded-xl border border-zinc-800 bg-zinc-900 p-2 text-xs text-zinc-400 hover:text-zinc-200"
              title="Toggle Fullscreen"
            >
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>

            <button
              onClick={() => onOpenChange(false)}
              className="rounded-xl border border-zinc-800 bg-zinc-900 p-2 text-xs text-zinc-400 hover:text-white transition"
              title="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Viewport Workspace */}
        <div className="flex flex-1 min-h-0 bg-black relative">
          {/* Series Thumbnail Drawer */}
          <div className="w-48 border-e border-zinc-800 bg-zinc-950 p-3 space-y-3 overflow-y-auto hidden sm:block">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
              Series List
            </p>
            {[
              { name: "Axial T2 TSE", slices: totalSlices, active: true },
              { name: "Sagittal T1 FLAIR", slices: 36, active: false },
              { name: "Coronal DWI b1000", slices: 24, active: false },
              { name: "3D TOF MRA", slices: 64, active: false },
            ].map((s, idx) => (
              <div
                key={idx}
                className={`rounded-xl border p-2.5 text-xs cursor-pointer transition ${
                  s.active
                    ? "border-primary bg-primary/10 text-white"
                    : "border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-700"
                }`}
              >
                <p className="font-semibold">{s.name}</p>
                <p className="mt-1 text-[10px] text-zinc-500">{s.slices} images · 512x512</p>
              </div>
            ))}
          </div>

          {/* Canvas Workspace */}
          <div
            ref={viewportRef}
            className="flex flex-1 relative items-center justify-center p-4 select-none overflow-hidden gap-4"
          >
            {/* Left Overlay Info */}
            <div className="absolute top-4 left-4 z-10 text-left font-mono text-[11px] text-emerald-400 leading-tight bg-black/50 p-2.5 rounded-lg backdrop-blur-sm pointer-events-none border border-zinc-800">
              <p>PATIENT: {study?.patientName || "PATIENT"}</p>
              <p>ID: {study?.mrn || "PAT-RECORD"}</p>
              <p>STUDY: {study?.examTitle || study?.modality || "Radiology Scan"}</p>
              <p>
                MODALITY: {study?.modality || "CT"} · SLICE: {currentSlice} / {totalSlices} ·
                SLOICE: 1.25mm
              </p>
              {measurementDistance && (
                <p className="mt-1 font-bold text-primary-300">DIST: {measurementDistance}</p>
              )}
            </div>

            {/* Right Overlay Info */}
            <div className="absolute top-4 right-4 z-10 text-right font-mono text-[11px] text-emerald-400 leading-tight bg-black/50 p-2.5 rounded-lg backdrop-blur-sm pointer-events-none border border-zinc-800">
              <p>DATE: {study?.date || "---"}</p>
              <p>MODALITY: {study?.modality || "CT"}</p>
              <p>
                SLICE: {currentSlice} / {totalSlices}
              </p>
              <p>ZOOM: {(zoom * 100).toFixed(0)}%</p>
              <p>
                W: {activeWl.width} L: {activeWl.level}
              </p>
              <p>PRESET: {activeWl.name}</p>
            </div>

            {/* Main Canvas Viewport 1 */}
            <div
              style={{ transform: `scale(${zoom})` }}
              className="flex-1 max-w-lg aspect-square rounded-2xl border border-zinc-800 bg-black flex items-center justify-center relative shadow-2xl transition-transform duration-200"
            >
              <canvas
                ref={canvasRef}
                width={420}
                height={420}
                className="w-full h-full rounded-2xl"
              />
            </div>

            {/* Secondary Canvas Viewport 2 (if 1x2 enabled) */}
            {layoutMode === "1x2" && (
              <div
                style={{ transform: `scale(${zoom})` }}
                className="flex-1 max-w-lg aspect-square rounded-2xl border border-zinc-800 bg-black flex items-center justify-center relative shadow-2xl transition-transform duration-200"
              >
                <div className="absolute top-2 left-2 z-10 font-mono text-[10px] text-amber-400 bg-black/60 px-2 py-1 rounded">
                  SAGITTAL RECON (1x2 COMPARISON)
                </div>
                <canvas
                  ref={canvasSecondaryRef}
                  width={420}
                  height={420}
                  className="w-full h-full rounded-2xl"
                />
              </div>
            )}
          </div>

          {/* Slide-out DICOM Tag Header Inspector Drawer */}
          {showMetadata && (
            <div className="w-72 border-s border-zinc-800 bg-zinc-950 p-4 space-y-4 overflow-y-auto text-xs font-mono">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                <span className="font-bold text-primary">DICOM HEADER TAGS</span>
                <button
                  onClick={() => setShowMetadata(false)}
                  className="text-zinc-500 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="space-y-2 text-zinc-300">
                <div>
                  <p className="text-[10px] text-zinc-500">(0010,0010) Patient Name</p>
                  <p className="text-emerald-400 font-semibold">
                    {study?.patientName || "Anonymous"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-zinc-500">(0010,0020) Patient ID</p>
                  <p>{study?.mrn || "N/A"}</p>
                </div>
                <div>
                  <p className="text-[10px] text-zinc-500">(0008,0060) Modality</p>
                  <p>{study?.modality || "MR"}</p>
                </div>
                <div>
                  <p className="text-[10px] text-zinc-500">(0020,000D) Study Instance UID</p>
                  <p className="break-all text-[10px] text-zinc-400">
                    {study?.studyInstanceUid || "1.2.840.113619.2.55.3.2831164011"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-zinc-500">(0018,0050) Slice Thickness</p>
                  <p>1.25 mm</p>
                </div>
                <div>
                  <p className="text-[10px] text-zinc-500">(0008,0070) Manufacturer</p>
                  <p>SIEMENS MAGNETOM Vida 3T</p>
                </div>
                <div>
                  <p className="text-[10px] text-zinc-500">(0008,1030) Study Description</p>
                  <p>{study?.examTitle || "Brain MRI without contrast"}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Bar & Playback Controls */}
        <div className="flex items-center justify-between border-t border-zinc-800 bg-zinc-900/90 px-6 py-3 select-none">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsPlaying((v) => !v)}
              className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                isPlaying
                  ? "bg-amber-500 text-black"
                  : "bg-primary text-primary-foreground hover:opacity-90"
              }`}
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {isPlaying ? "Pause Cine" : "Play Cine"}
            </button>
            <button
              onClick={() => {
                setZoom(1);
                setInvert(false);
                setPreset("soft");
                setCurrentSlice(Math.floor(totalSlices / 2));
                setActiveTool("select");
                setMeasurementDistance(null);
              }}
              className="rounded-full border border-zinc-800 bg-zinc-900 px-3.5 py-1.5 text-xs text-zinc-400 hover:text-zinc-200"
            >
              Reset View
            </button>
          </div>

          <div className="flex flex-1 max-w-md items-center gap-3 px-6 text-xs">
            <span className="text-zinc-400 font-mono">1</span>
            <input
              type="range"
              min={1}
              max={totalSlices}
              value={currentSlice}
              onChange={(e) => setCurrentSlice(Number(e.target.value))}
              className="flex-1 accent-primary cursor-pointer"
            />
            <span className="text-zinc-400 font-mono">{totalSlices}</span>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setZoom((z) => Math.max(0.6, z - 0.2))}
              className="px-2.5 py-1 bg-zinc-800 rounded-lg text-zinc-200 hover:bg-zinc-700 font-mono text-xs"
              title="Zoom Out"
            >
              -
            </button>
            <span className="text-xs font-mono text-zinc-400 w-12 text-center">
              {(zoom * 100).toFixed(0)}%
            </span>
            <button
              onClick={() => setZoom((z) => Math.min(2.5, z + 0.2))}
              className="px-2.5 py-1 bg-zinc-800 rounded-lg text-zinc-200 hover:bg-zinc-700 font-mono text-xs"
              title="Zoom In"
            >
              +
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
