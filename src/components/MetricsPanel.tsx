import React, { useState, useEffect } from "react";
import {
  Activity, AlertTriangle, BookmarkPlus, Brain, Camera, ClipboardList,
  Clock, Eye, Gauge, Hand, Menu, Minus, Palette, PanelRightClose,
  PanelRightOpen, Pause, Play, Plus, RotateCcw, ShieldCheck,
  SlidersHorizontal, SwitchCamera, Target, Timer, Trophy, Zap,
} from "lucide-react";
import type {
  FullAnalysis, TrackerSettings, StrokeFocus, SwimmerProfile, InterfaceStyle,
  ArmChainStatus, SessionMark, ArmEVF, EVFResult, TechniqueFeedback,
  CameraViewMode, InterfaceStyleOption, PredictionMode, AnalysisView, PanelView
} from "@/types/glide";
import { clamp } from "@/lib/biomechanics";
import {
  EVF_ANGLE_MIN, EVF_ANGLE_MAX, MIN_STYLE_CHECK_INTERVAL_MS,
  MAX_STYLE_CHECK_INTERVAL_MS, STYLE_CHECK_INTERVAL_STEP_MS,
  STROKE_FOCUS_OPTIONS, CAMERA_VIEW_OPTIONS, INTERFACE_STYLE_OPTIONS
} from "@/lib/constants";
import { isTopLikeView, createProfileGeometry } from "@/lib/biomechanics";

export function predictionModeLabel(mode: PredictionMode): string {
  if (mode === "extended") return "Extended";
  if (mode === "assist") return "Assist";
  return "Off";
}

export function cameraViewModeLabel(mode: CameraViewMode): string {
  if (mode === "auto") return "Auto";
  if (mode === "top") return "Top";
  if (mode === "side") return "Side";
  if (mode === "top-side") return "Top 45";
  return "Front";
}

export function analysisViewLabel(view: AnalysisView): string {
  if (view === "top") return "Top";
  if (view === "side") return "Side";
  if (view === "top-side") return "Top 45";
  if (view === "front") return "Front";
  return "Unknown";
}

export function cameraViewBadgeLabel(mode: CameraViewMode, view: AnalysisView | null): string {
  if (mode !== "auto") return `${cameraViewModeLabel(mode)} View`;
  if (!view || view === "unknown") return "Auto View";
  return `${analysisViewLabel(view)} View`;
}

export function getInterfaceStyleOption(style: InterfaceStyle): InterfaceStyleOption {
  return INTERFACE_STYLE_OPTIONS.find((option) => option.id === style) ?? INTERFACE_STYLE_OPTIONS[0];
}

export function getPrimaryCue(analysis: FullAnalysis | null, strokeFocus: StrokeFocus): string {
  if (!analysis) {
    return strokeFocus === "Auto"
      ? "Bring your upper body into frame to start live cues."
      : `Bring your upper body into frame to coach ${strokeFocus}.`;
  }
  const { technique, evf, tracking } = analysis;
  const criticalCue = technique.feedback.find((item) => item.severity === "critical");
  const warningCue = technique.feedback.find((item) => item.severity === "warning");

  if (criticalCue) return criticalCue.message;
  if (strokeFocus !== "Auto" && technique.rawStroke !== "Unknown" && technique.rawStroke !== strokeFocus) {
    return `Focus is set to ${strokeFocus}; auto-detect currently sees ${technique.rawStroke}.`;
  }
  if (tracking.quality < 0.45) {
    return "Improve lighting or keep one shoulder-elbow-wrist chain visible.";
  }
  if (evf.left.isEVF || evf.right.isEVF) {
    return "EVF is active; keep the elbow high as the forearm tips down.";
  }
  if (warningCue) return warningCue.message;
  return "Tracking is stable; hold a clean line through entry and catch.";
}

function pickDisplayArm(evf: EVFResult): ArmEVF {
  const leftScore = evf.left.confidence + (evf.left.valid ? 0.35 : 0) + (evf.left.inCatchPhase ? 0.25 : 0) + (evf.left.isEVF ? 0.35 : 0);
  const rightScore = evf.right.confidence + (evf.right.valid ? 0.35 : 0) + (evf.right.inCatchPhase ? 0.25 : 0) + (evf.right.isEVF ? 0.35 : 0);
  if (leftScore <= 0 && rightScore <= 0) return evf.left;
  return leftScore >= rightScore ? evf.left : evf.right;
}

function feedbackColor(severity: TechniqueFeedback["severity"]) {
  if (severity === "good") return "border-emerald-800/70 bg-emerald-950/35 text-emerald-100";
  if (severity === "critical") return "border-red-800/70 bg-red-950/35 text-red-100";
  return "border-amber-800/70 bg-amber-950/35 text-amber-100";
}

function formatSeconds(ms: number): string {
  const seconds = ms / 1000;
  return seconds >= 10 || Number.isInteger(seconds) ? `${seconds.toFixed(0)}s` : `${seconds.toFixed(1)}s`;
}

function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

function createSessionSummary(marks: SessionMark[], lapCount: number, elapsedMs: number, strokeFocus: StrokeFocus): string {
  const lines = ["GlideAI session", `Duration: ${formatClock(elapsedMs)}`, `Laps: ${lapCount}`, `Focus: ${strokeFocus}`];
  if (marks.length === 0) return [...lines, "Marks: none"].join("\n");
  return [...lines, "Marks:", ...marks.map((mark) => `${mark.timeLabel} - ${mark.stroke} - quality ${mark.quality}% - EVF ${Math.round(mark.evfConfidence * 100)}% - ${mark.cue}`)].join("\n");
}

function statusDotClass(active: boolean) {
  return active ? "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]" : "bg-zinc-600";
}

function metricCardClass(accent: "cyan" | "emerald" | "amber" | "zinc" = "zinc") {
  const accentClass =
    accent === "cyan" ? "border-[color:var(--glide-accent-border)] bg-[color:var(--glide-panel-strong)]" :
    accent === "emerald" ? "border-emerald-900/60" :
    accent === "amber" ? "border-amber-900/60" :
    "border-[color:var(--glide-card-border)] bg-[color:var(--glide-panel)]";
  const semanticBg = (accent === "emerald" || accent === "amber") ? "bg-[color:var(--glide-panel)]" : "";
  return `rounded-lg border ${accentClass} ${semanticBg} p-4 shadow-lg shadow-black/35`;
}

function controlButtonClass(active: boolean) {
  return active
    ? "border-[color:var(--glide-accent-border)] bg-[color:var(--glide-accent-soft)] text-[color:var(--glide-accent-muted)]"
    : "border-zinc-800 bg-zinc-900/70 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200";
}

function chainDotClass(active: boolean) {
  return active ? "bg-[color:var(--glide-accent)]" : "bg-zinc-700";
}

function ReferencePicture({ type }: { type: "evf" | "top" | "water" }) {
  if (type === "top") {
    return (
      <svg viewBox="0 0 240 140" role="img" aria-label="Top-view swimmer reference" className="h-28 w-full">
        <rect width="240" height="140" rx="8" fill="#061018" />
        <path d="M24 33c22 12 42 12 64 0s42-12 64 0 42 12 64 0" fill="none" stroke="#155e75" strokeWidth="4" opacity="0.65" />
        <path d="M24 103c22-12 42-12 64 0s42 12 64 0 42-12 64 0" fill="none" stroke="#155e75" strokeWidth="4" opacity="0.65" />
        <ellipse cx="120" cy="70" rx="25" ry="48" fill="#0f766e" opacity="0.42" />
        <circle cx="120" cy="45" r="10" fill="#e5e7eb" />
        <line x1="96" y1="58" x2="72" y2="42" stroke="#facc15" strokeWidth="7" strokeLinecap="round" />
        <line x1="72" y1="42" x2="43" y2="49" stroke="#39FF14" strokeWidth="7" strokeLinecap="round" />
        <line x1="144" y1="58" x2="168" y2="42" stroke="#facc15" strokeWidth="7" strokeLinecap="round" />
        <line x1="168" y1="42" x2="197" y2="49" stroke="#39FF14" strokeWidth="7" strokeLinecap="round" />
        <line x1="105" y1="100" x2="90" y2="125" stroke="#64748b" strokeWidth="6" strokeLinecap="round" />
        <line x1="135" y1="100" x2="150" y2="125" stroke="#64748b" strokeWidth="6" strokeLinecap="round" />
        <circle cx="43" cy="49" r="6" fill="#38bdf8" />
        <circle cx="197" cy="49" r="6" fill="#38bdf8" />
      </svg>
    );
  }
  if (type === "water") {
    return (
      <svg viewBox="0 0 240 140" role="img" aria-label="Partial-submersion hand reference" className="h-28 w-full">
        <rect width="240" height="140" rx="8" fill="#07111f" />
        <path d="M0 76c24-10 48-10 72 0s48 10 72 0 48-10 96 0v64H0Z" fill="#0e7490" opacity="0.42" />
        <path d="M0 75c24-10 48-10 72 0s48 10 72 0 48-10 96 0" fill="none" stroke="#67e8f9" strokeWidth="4" opacity="0.85" />
        <circle cx="83" cy="50" r="9" fill="#e5e7eb" />
        <line x1="91" y1="58" x2="121" y2="72" stroke="#facc15" strokeWidth="8" strokeLinecap="round" />
        <line x1="121" y1="72" x2="154" y2="84" stroke="#39FF14" strokeWidth="8" strokeLinecap="round" />
        <circle cx="154" cy="84" r="8" fill="#38bdf8" />
        <circle cx="166" cy="88" r="4" fill="#38bdf8" opacity="0.85" />
        <circle cx="176" cy="91" r="3" fill="#38bdf8" opacity="0.7" />
        <line x1="83" y1="59" x2="72" y2="96" stroke="#64748b" strokeWidth="7" strokeLinecap="round" />
        <line x1="72" y1="96" x2="55" y2="125" stroke="#64748b" strokeWidth="6" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 240 140" role="img" aria-label="Early vertical forearm reference" className="h-28 w-full">
      <rect width="240" height="140" rx="8" fill="#080f1a" />
      <path d="M0 106c30-9 60-9 90 0s60 9 90 0 40-9 60 0v34H0Z" fill="#164e63" opacity="0.38" />
      <path d="M18 105c24-8 48-8 72 0s48 8 72 0 40-8 60 0" fill="none" stroke="#38bdf8" strokeWidth="4" opacity="0.7" />
      <circle cx="72" cy="49" r="10" fill="#e5e7eb" />
      <line x1="82" y1="57" x2="125" y2="58" stroke="#facc15" strokeWidth="8" strokeLinecap="round" />
      <line x1="125" y1="58" x2="132" y2="106" stroke="#39FF14" strokeWidth="8" strokeLinecap="round" />
      <circle cx="125" cy="58" r="7" fill="#facc15" />
      <circle cx="132" cy="106" r="7" fill="#38bdf8" />
      <path d="M148 66a35 35 0 0 0-22-24" fill="none" stroke="#94a3b8" strokeWidth="3" strokeDasharray="4 5" />
      <text x="153" y="62" fill="#cbd5e1" fontSize="14" fontFamily="monospace">100-120</text>
    </svg>
  );
}

function ReferenceCard({ title, type, active }: { title: string; type: "evf" | "top" | "water"; active: boolean; }) {
  return (
    <div className={metricCardClass(active ? "cyan" : "zinc")}>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">{title}</span>
        <span className={`h-2.5 w-2.5 rounded-full ${statusDotClass(active)}`} />
      </div>
      <ReferencePicture type={type} />
    </div>
  );
}

function ArmChainRow({ label, chain }: { label: string; chain: ArmChainStatus | null; }) {
  const score = Math.round((chain?.score ?? 0) * 100);
  return (
    <div className="rounded-md border border-zinc-800/80 bg-zinc-900/50 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-zinc-300">{label}</span>
        <span className="font-mono text-xs text-cyan-300">{score}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${chainDotClass(Boolean(chain?.shoulder))}`} />
        <span className={`h-2.5 w-2.5 rounded-full ${chainDotClass(Boolean(chain?.elbow))}`} />
        <span className={`h-2.5 w-2.5 rounded-full ${chainDotClass(Boolean(chain?.wrist))}`} />
        <div className="ml-auto h-1.5 w-20 overflow-hidden rounded-full bg-zinc-800">
          <div className="h-full rounded-full bg-cyan-400" style={{ width: `${clamp(score, 0, 100)}%` }} />
        </div>
      </div>
    </div>
  );
}

export default function MetricsPanel({
  analysis,
  styleCheckIntervalMs,
  onStyleCheckIntervalChange,
  trackerSettings,
  onTrackerSettingsChange,
  onResetTracking,
  analysisPaused,
  onAnalysisPausedChange,
  strokeFocus,
  onStrokeFocusChange,
  swimmerProfile,
  onSwimmerProfileChange,
  interfaceStyle,
  onInterfaceStyleChange,
}: {
  analysis: FullAnalysis | null;
  styleCheckIntervalMs: number;
  onStyleCheckIntervalChange: (intervalMs: number) => void;
  trackerSettings: TrackerSettings;
  onTrackerSettingsChange: (patch: Partial<TrackerSettings>) => void;
  onResetTracking: () => void;
  analysisPaused: boolean;
  onAnalysisPausedChange: (paused: boolean) => void;
  strokeFocus: StrokeFocus;
  onStrokeFocusChange: (focus: StrokeFocus) => void;
  swimmerProfile: SwimmerProfile;
  onSwimmerProfileChange: (patch: Partial<SwimmerProfile>) => void;
  interfaceStyle: InterfaceStyle;
  onInterfaceStyleChange: (style: InterfaceStyle) => void;
}) {
  const [panelView, setPanelView] = useState<PanelView>("dashboard");
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);
  const [sessionRunning, setSessionRunning] = useState(true);
  const [sessionStartedAt, setSessionStartedAt] = useState(() => Date.now());
  const [elapsedMs, setElapsedMs] = useState(0);
  const [lapCount, setLapCount] = useState(0);
  const [sessionMarks, setSessionMarks] = useState<SessionMark[]>([]);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const evf = analysis?.evf ?? null;
  const technique = analysis?.technique ?? null;
  const styleCheck = analysis?.styleCheck ?? null;
  const armIdentity = analysis?.armIdentity ?? null;
  const tracking = analysis?.tracking ?? null;
  const arm = evf ? pickDisplayArm(evf) : null;
  const anyEVF = evf ? evf.left.isEVF || evf.right.isEVF : false;
  const selectedInterfaceStyle = getInterfaceStyleOption(interfaceStyle);
  const profileGeometry = createProfileGeometry(swimmerProfile);
  const coachCue = getPrimaryCue(analysis, strokeFocus);
  const topViewActive = isTopLikeView(technique?.shoulders.view ?? "unknown");
  const partialSubmersionActive = Boolean(technique?.feedback.some((item) => item.id === "partial-submerged"));
  const warningCount = technique?.feedback.filter((item) => item.severity !== "good").length ?? 0;
  const lastCheckLabel = styleCheck?.lastCheckedMsAgo === null || styleCheck?.lastCheckedMsAgo === undefined ? "Waiting" : `${formatSeconds(styleCheck.lastCheckedMsAgo)} ago`;
  const nextCheckLabel = styleCheck ? formatSeconds(styleCheck.nextCheckMs) : formatSeconds(styleCheckIntervalMs);
  const armIdentityLabel = !armIdentity ? "--" : armIdentity.locked ? (armIdentity.swapped ? "Locked swap" : "Locked") : "Learning";
  const trackedArmLabel = !armIdentity ? "--" : `L ${armIdentity.leftTracked ? "on" : "lost"} / R ${armIdentity.rightTracked ? "on" : "lost"}`;
  const viewLabel = !technique ? "--" : technique.shoulders.visible ? analysisViewLabel(technique.shoulders.view) : "--";
  const qualityPercent = Math.round((tracking?.quality ?? 0) * 100);
  const trackingStateLabel = tracking ? (tracking.state === "predicting" ? `Predict ${tracking.predictionFrames}/${tracking.maxPredictionFrames}` : tracking.state === "limited" ? "Limited" : tracking.state === "live" ? "Live" : "Lost") : "Waiting";
  const bestSessionEvf = Math.max(arm?.confidence ?? 0, ...sessionMarks.map((mark) => mark.evfConfidence));
  const averageMarkedQuality = sessionMarks.length > 0 ? Math.round(sessionMarks.reduce((total, mark) => total + mark.quality, 0) / sessionMarks.length) : qualityPercent;
  const drillSteps = [
    strokeFocus === "Auto" ? `Auto focus: ${technique?.stroke ?? "Scanning"}` : `${strokeFocus} focus`,
    anyEVF ? "EVF hold: keep the elbow high through pressure." : "Catch set: tip fingertips down before the pull.",
    tracking && tracking.quality < 0.55 ? "Camera set: keep one full arm chain visible." : "Line set: keep entry wide from the shoulder.",
  ];

  useEffect(() => {
    if (!sessionRunning) return;
    const updateElapsed = () => setElapsedMs(Date.now() - sessionStartedAt);
    updateElapsed();
    const timerId = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(timerId);
  }, [sessionRunning, sessionStartedAt]);

  const toggleSessionRunning = () => {
    if (sessionRunning) {
      setElapsedMs(Date.now() - sessionStartedAt);
      setSessionRunning(false);
      return;
    }
    setSessionStartedAt(Date.now() - elapsedMs);
    setSessionRunning(true);
  };

  const addSessionMark = () => {
    if (!analysis) return;
    const nextMark: SessionMark = {
      id: Date.now(),
      timeLabel: formatClock(elapsedMs),
      stroke: analysis.technique.stroke,
      quality: qualityPercent,
      evfConfidence: arm?.confidence ?? 0,
      cue: coachCue,
    };
    setSessionMarks((marks) => [nextMark, ...marks].slice(0, 8));
  };

  const resetSession = () => {
    setSessionStartedAt(Date.now());
    setElapsedMs(0);
    setLapCount(0);
    setSessionMarks([]);
    setCopyStatus(null);
    setSessionRunning(true);
  };

  const copySessionLog = () => {
    const summary = createSessionSummary(sessionMarks, lapCount, elapsedMs, strokeFocus);
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      setCopyStatus("Clipboard unavailable");
      return;
    }
    void navigator.clipboard.writeText(summary).then(() => setCopyStatus("Copied")).catch(() => setCopyStatus("Copy blocked"));
  };

  const themedButtonClass = (active: boolean) => active ? selectedInterfaceStyle.activeClass : "border-zinc-800 bg-zinc-900/70 text-zinc-400 hover:border-zinc-700 hover:text-zinc-100";
  const handleProfileNumberChange = (key: keyof SwimmerProfile, value: number, min: number, max: number) => {
    onSwimmerProfileChange({ [key]: clamp(Number.isFinite(value) ? value : min, min, max) } as Partial<SwimmerProfile>);
  };

  return (
    <div className="flex w-full flex-col gap-4 pr-1 xl:max-h-[calc(100vh-7.5rem)] xl:w-[22rem] xl:shrink-0 xl:overflow-y-auto">
      <div className={metricCardClass("zinc")}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Menu className="h-4 w-4 text-cyan-400" />
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Coach Menu</span>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => onAnalysisPausedChange(!analysisPaused)} className={`rounded-md border p-2 transition ${themedButtonClass(analysisPaused)}`} title={analysisPaused ? "Resume analysis" : "Pause analysis"}>
              {analysisPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
            </button>
            <button type="button" onClick={() => setIsPanelCollapsed((collapsed) => !collapsed)} className="rounded-md border border-zinc-800 bg-zinc-900/70 p-2 text-zinc-300 transition hover:border-cyan-900 hover:text-cyan-100" title={isPanelCollapsed ? "Open panel" : "Compact panel"}>
              {isPanelCollapsed ? <PanelRightOpen className="h-3.5 w-3.5" /> : <PanelRightClose className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
        {!isPanelCollapsed && (
          <div className="grid grid-cols-4 gap-2 text-xs">
            {(["dashboard", "coach", "settings", "history"] as const).map((view) => (
              <button key={view} type="button" onClick={() => setPanelView(view)} className={`rounded-md border px-2 py-2 font-semibold capitalize transition ${themedButtonClass(panelView === view)}`}>
                {view}
              </button>
            ))}
          </div>
        )}
      </div>

      {!isPanelCollapsed && (
        <>
          {panelView === "dashboard" && (
            <div className={metricCardClass(sessionRunning ? "emerald" : "zinc")}>
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Timer className="h-4 w-4 text-emerald-400" />
                  <span className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Session</span>
                </div>
                <span className="font-mono text-xs text-emerald-300">{formatClock(elapsedMs)}</span>
              </div>
              <div className="grid grid-cols-3 divide-x divide-zinc-800/80 text-center">
                <div className="px-2">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Laps</p>
                  <p className="mt-1 font-mono text-lg font-bold text-zinc-100">{lapCount}</p>
                </div>
                <div className="px-2">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Best EVF</p>
                  <p className="mt-1 font-mono text-lg font-bold text-zinc-100">{Math.round(bestSessionEvf * 100)}%</p>
                </div>
                <div className="px-2">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Marks</p>
                  <p className="mt-1 font-mono text-lg font-bold text-zinc-100">{sessionMarks.length}</p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-4 gap-2">
                <button type="button" onClick={toggleSessionRunning} className="rounded-md border border-zinc-800 bg-zinc-900/70 p-2 text-zinc-200 transition hover:border-emerald-900 hover:text-emerald-100" title={sessionRunning ? "Pause session timer" : "Resume session timer"}>
                  {sessionRunning ? <Pause className="mx-auto h-4 w-4" /> : <Play className="mx-auto h-4 w-4" />}
                </button>
                <button type="button" onClick={() => setLapCount((count) => Math.max(0, count - 1))} className="rounded-md border border-zinc-800 bg-zinc-900/70 p-2 text-zinc-200 transition hover:border-zinc-700" title="Remove lap">
                  <Minus className="mx-auto h-4 w-4" />
                </button>
                <button type="button" onClick={() => setLapCount((count) => count + 1)} className="rounded-md border border-zinc-800 bg-zinc-900/70 p-2 text-zinc-200 transition hover:border-zinc-700" title="Add lap">
                  <Plus className="mx-auto h-4 w-4" />
                </button>
                <button type="button" onClick={addSessionMark} disabled={!analysis} className="rounded-md border border-zinc-800 bg-zinc-900/70 p-2 text-zinc-200 transition hover:border-cyan-900 hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-40" title="Mark current cue">
                  <BookmarkPlus className="mx-auto h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {panelView === "coach" && (
            <>
              <div className={metricCardClass(anyEVF ? "emerald" : "amber")}>
                <div className="mb-3 flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-amber-300" />
                  <span className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Live Cue</span>
                </div>
                <p className="text-sm font-semibold leading-relaxed text-zinc-100">{coachCue}</p>
                <div className="mt-3 flex flex-col gap-2">
                  {drillSteps.map((step) => (
                    <p key={step} className="rounded-md border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-xs text-zinc-300">{step}</p>
                  ))}
                </div>
              </div>

              <div className={metricCardClass(strokeFocus === "Auto" ? "zinc" : "cyan")}>
                <div className="mb-3 flex items-center gap-2">
                  <Target className="h-4 w-4 text-cyan-400" />
                  <span className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Stroke Focus</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {STROKE_FOCUS_OPTIONS.map((style) => (
                    <button key={style} type="button" onClick={() => onStrokeFocusChange(style)} className={`rounded-md border px-3 py-2 text-left font-semibold transition ${themedButtonClass(strokeFocus === style)}`}>
                      {style}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {panelView === "settings" && (
            <>
              <div className={metricCardClass("zinc")}>
                <div className="mb-3 flex items-center gap-2">
                  <Palette className="h-4 w-4 text-cyan-400" />
                  <span className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Interface Style</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  {INTERFACE_STYLE_OPTIONS.map((style) => (
                    <button key={style.id} type="button" onClick={() => onInterfaceStyleChange(style.id)} className={`rounded-md border px-2 py-2 font-semibold transition ${themedButtonClass(interfaceStyle === style.id)}`} title={style.description}>
                      {style.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className={metricCardClass("cyan")}>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Hand className="h-4 w-4 text-cyan-400" />
                    <span className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Swimmer Profile</span>
                  </div>
                  <button type="button" onClick={() => { onSwimmerProfileChange(swimmerProfile); onResetTracking(); }} className="rounded-md border border-zinc-800 bg-zinc-900/70 px-2.5 py-1 text-xs text-zinc-300 transition hover:border-cyan-900 hover:text-cyan-100">
                    Reset
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    ["heightIn", "Height", swimmerProfile.heightIn, 48, 86, "in"],
                    ["weightLb", "Weight", swimmerProfile.weightLb, 70, 330, "lb"],
                    ["armSpanIn", "Arm span", swimmerProfile.armSpanIn, 46, 92, "in"],
                    ["shoulderWidthIn", "Shoulders", swimmerProfile.shoulderWidthIn, 11, 26, "in"],
                    ["upperArmIn", "Upper arm", swimmerProfile.upperArmIn, 7, 20, "in"],
                    ["forearmIn", "Forearm", swimmerProfile.forearmIn, 7, 19, "in"],
                  ].map(([key, label, value, min, max, unit]) => (
                    <label key={key} className="block">
                      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">{label}</span>
                      <div className="flex overflow-hidden rounded-md border border-zinc-800 bg-zinc-900/70 focus-within:border-cyan-700">
                        <input type="number" min={min} max={max} step={key === "weightLb" ? 1 : 0.5} value={value} onChange={(event) => handleProfileNumberChange(key as keyof SwimmerProfile, Number(event.currentTarget.value), Number(min), Number(max))} className="min-w-0 flex-1 bg-transparent px-2 py-2 text-sm font-semibold text-zinc-100 outline-none" />
                        <span className="flex w-8 items-center justify-center border-l border-zinc-800 text-[10px] uppercase text-zinc-500">{unit}</span>
                      </div>
                    </label>
                  ))}
                </div>
                <div className="mt-4">
                  <div className="mb-2 flex items-center justify-between text-[11px] text-zinc-500">
                    <span>Profile fit</span>
                    <span>{swimmerProfile.profileInfluence}%</span>
                  </div>
                  <input type="range" min={0} max={100} step={5} value={swimmerProfile.profileInfluence} onChange={(event) => handleProfileNumberChange("profileInfluence", Number(event.currentTarget.value), 0, 100)} className="w-full accent-cyan-400" aria-label="Swimmer profile influence" />
                </div>
                <div className="mt-3 grid grid-cols-3 divide-x divide-zinc-800/80 text-center">
                  <div className="px-2">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Ratio</p>
                    <p className="mt-1 font-mono text-xs text-zinc-100">{profileGeometry.expectedArmRatio.toFixed(2)}</p>
                  </div>
                  <div className="px-2">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Gate</p>
                    <p className="mt-1 font-mono text-xs text-zinc-100">{profileGeometry.armRatioMin.toFixed(2)}-{profileGeometry.armRatioMax.toFixed(2)}</p>
                  </div>
                  <div className="px-2">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Signal</p>
                    <p className="mt-1 font-mono text-xs text-zinc-100">{profileGeometry.minArmSignalScore.toFixed(2)}</p>
                  </div>
                </div>
              </div>
            </>
          )}

          {panelView === "history" && (
            <div className={metricCardClass("zinc")}>
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-cyan-400" />
                  <span className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Session Log</span>
                </div>
                <button type="button" onClick={copySessionLog} className="rounded-md border border-zinc-800 bg-zinc-900/70 px-2.5 py-1 text-xs text-zinc-300 transition hover:border-cyan-900 hover:text-cyan-100">
                  {copyStatus ?? "Copy"}
                </button>
              </div>
              <div className="grid grid-cols-3 divide-x divide-zinc-800/80 text-center">
                <div className="px-2">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Avg</p>
                  <p className="mt-1 font-mono text-sm text-zinc-100">{averageMarkedQuality}%</p>
                </div>
                <div className="px-2">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Issues</p>
                  <p className="mt-1 font-mono text-sm text-zinc-100">{warningCount}</p>
                </div>
                <div className="px-2">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Focus</p>
                  <p className="mt-1 truncate text-xs font-semibold text-zinc-100">{strokeFocus}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-col gap-2">
                {sessionMarks.length > 0 ? (
                  sessionMarks.map((mark) => (
                    <div key={mark.id} className="rounded-md border border-zinc-800 bg-zinc-900/50 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs text-cyan-300">{mark.timeLabel}</span>
                        <span className="text-xs font-semibold text-zinc-200">{mark.stroke}</span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-zinc-500">{mark.cue}</p>
                    </div>
                  ))
                ) : (
                  <p className="rounded-md border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-xs text-zinc-400">No marked cues yet.</p>
                )}
              </div>
              <button type="button" onClick={resetSession} className="mt-3 w-full rounded-md border border-zinc-800 bg-zinc-900/70 px-3 py-2 text-xs font-semibold text-zinc-300 transition hover:border-amber-900 hover:text-amber-100">
                Reset session
              </button>
            </div>
          )}

          <div className={metricCardClass("cyan")}>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Camera className="h-4 w-4 text-cyan-400" />
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Vision</span>
              </div>
              <span className={`h-2.5 w-2.5 rounded-full ${statusDotClass(Boolean(technique))}`} />
            </div>
            <div className="grid grid-cols-3 divide-x divide-zinc-800/80 text-center">
              <div className="px-2 py-1">
                <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">View</p>
                <p className="mt-1 text-sm font-semibold text-zinc-100">{viewLabel}</p>
              </div>
              <div className="px-2 py-1">
                <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Arms</p>
                <p className="mt-1 text-sm font-semibold text-zinc-100">{armIdentity?.locked ? "Lock" : "Learn"}</p>
              </div>
              <div className="px-2 py-1">
                <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">EVF</p>
                <p className="mt-1 text-sm font-semibold text-zinc-100">{anyEVF ? "On" : "Scan"}</p>
              </div>
            </div>
          </div>

          <div className={metricCardClass(trackerSettings.viewMode === "auto" ? "zinc" : "cyan")}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-cyan-400" />
                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Camera View</span>
              </div>
              <span className="text-xs font-semibold text-cyan-300">{cameraViewModeLabel(trackerSettings.viewMode)}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {CAMERA_VIEW_OPTIONS.map((option) => (
                <button key={option.id} type="button" onClick={() => onTrackerSettingsChange({ viewMode: option.id })} className={`rounded-md border px-2 py-2 text-xs font-semibold transition ${controlButtonClass(trackerSettings.viewMode === option.id)}`}>
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className={metricCardClass(tracking?.state === "predicting" ? "amber" : "zinc")}>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Gauge className="h-4 w-4 text-cyan-400" />
                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Tracking Health</span>
              </div>
              <span className="font-mono text-xs text-cyan-300">{trackingStateLabel}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
              <div className={`h-full rounded-full ${qualityPercent >= 70 ? "bg-emerald-400" : qualityPercent >= 45 ? "bg-amber-400" : "bg-red-400"}`} style={{ width: `${qualityPercent}%` }} />
            </div>
            <div className="mt-3 grid grid-cols-3 divide-x divide-zinc-800/80 text-center">
              <div className="px-2">
                <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Quality</p>
                <p className="mt-1 font-mono text-sm text-zinc-100">{qualityPercent}%</p>
              </div>
              <div className="px-2">
                <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">FPS</p>
                <p className="mt-1 font-mono text-sm text-zinc-100">{tracking ? tracking.fps.toFixed(0) : "--"}</p>
              </div>
              <div className="px-2">
                <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Edge</p>
                <p className="mt-1 font-mono text-sm text-zinc-100">{tracking?.edgeLandmarks ?? 0}</p>
              </div>
            </div>
          </div>

          <div className={metricCardClass(trackerSettings.predictionMode === "off" ? "zinc" : "amber")}>
            <div className="mb-3 flex items-center gap-2">
              <Brain className="h-4 w-4 text-cyan-400" />
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Prediction Mode</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(["off", "assist", "extended"] as const).map((mode) => (
                <button key={mode} type="button" onClick={() => onTrackerSettingsChange({ predictionMode: mode })} className={`rounded-md border px-2 py-2 text-xs font-semibold transition ${controlButtonClass(trackerSettings.predictionMode === mode)}`}>
                  {predictionModeLabel(mode)}
                </button>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <button type="button" onClick={() => onTrackerSettingsChange({ edgeGuard: !trackerSettings.edgeGuard })} className={`rounded-md border px-3 py-2 text-left transition ${controlButtonClass(trackerSettings.edgeGuard)}`}>
                <span className="flex items-center gap-2">
                  <Zap className="h-3.5 w-3.5" /> Edge guard
                </span>
              </button>
              <button type="button" onClick={onResetTracking} className="rounded-md border border-zinc-800 bg-zinc-900/70 px-3 py-2 text-left text-zinc-300 transition hover:border-cyan-900 hover:text-cyan-100">
                <span className="flex items-center gap-2">
                  <RotateCcw className="h-3.5 w-3.5" /> Reset
                </span>
              </button>
            </div>
          </div>

          <div className={metricCardClass("zinc")}>
            <div className="mb-3 flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-cyan-400" />
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Overlay Controls</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <button type="button" onClick={() => onTrackerSettingsChange({ showSkeleton: !trackerSettings.showSkeleton })} className={`rounded-md border px-2 py-2 transition ${controlButtonClass(trackerSettings.showSkeleton)}`}>Bones</button>
              <button type="button" onClick={() => onTrackerSettingsChange({ showJoints: !trackerSettings.showJoints })} className={`rounded-md border px-2 py-2 transition ${controlButtonClass(trackerSettings.showJoints)}`}>Joints</button>
              <button type="button" onClick={() => onTrackerSettingsChange({ showTrails: !trackerSettings.showTrails })} className={`rounded-md border px-2 py-2 transition ${controlButtonClass(trackerSettings.showTrails)}`}>Trail</button>
              <button type="button" onClick={() => onTrackerSettingsChange({ showCoachCues: !trackerSettings.showCoachCues })} className={`rounded-md border px-2 py-2 transition ${controlButtonClass(trackerSettings.showCoachCues)}`}>Cues</button>
              <button type="button" onClick={() => onTrackerSettingsChange({ mirrored: !trackerSettings.mirrored })} className={`rounded-md border px-2 py-2 transition ${controlButtonClass(trackerSettings.mirrored)}`}>
                <span className="flex items-center justify-center gap-1.5"><SwitchCamera className="h-3.5 w-3.5" /> Mirror</span>
              </button>
              <button type="button" onClick={() => onTrackerSettingsChange({ cameraFacingMode: trackerSettings.cameraFacingMode === "user" ? "environment" : "user", mirrored: trackerSettings.cameraFacingMode !== "user" })} className="rounded-md border border-zinc-800 bg-zinc-900/70 px-2 py-2 text-zinc-300 transition hover:border-cyan-900 hover:text-cyan-100">
                <span className="flex items-center justify-center gap-1.5"><Camera className="h-3.5 w-3.5" /> {trackerSettings.cameraFacingMode === "user" ? "Front" : "Rear"}</span>
              </button>
            </div>
            <input type="range" min={0.25} max={1} step={0.05} value={trackerSettings.overlayOpacity} onChange={(event) => onTrackerSettingsChange({ overlayOpacity: Number(event.currentTarget.value) })} className="mt-4 w-full accent-cyan-400" aria-label="Overlay opacity" />
            <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-500">
              <span>Soft</span>
              <span>{Math.round(trackerSettings.overlayOpacity * 100)}%</span>
              <span>Bright</span>
            </div>
          </div>

          <div className={metricCardClass("zinc")}>
            <div className="mb-3 flex items-center gap-2">
              <Hand className="h-4 w-4 text-cyan-400" />
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Arm Chains</span>
            </div>
            <div className="flex flex-col gap-2">
              <ArmChainRow label="Left shoulder / elbow / wrist" chain={tracking?.leftArm ?? null} />
              <ArmChainRow label="Right shoulder / elbow / wrist" chain={tracking?.rightArm ?? null} />
            </div>
          </div>

          <div className={metricCardClass("zinc")}>
            <div className="flex items-center gap-2 mb-3">
              <Target className="w-4 h-4 text-cyan-400" />
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Technique ID</span>
            </div>
            <div className="flex items-end justify-between gap-3">
              <p className="text-2xl font-bold text-white tracking-tight">{technique ? technique.stroke : "Scanning"}</p>
              <p className="text-sm font-mono text-cyan-300 tabular-nums">{technique ? `${Math.round(technique.confidence * 100)}%` : "--"}</p>
            </div>
            <p className="text-xs text-zinc-500 mt-2">
              {technique ? `${technique.lockState === "locked" ? "Locked" : technique.lockState} style memory` : "Waiting for stable stroke evidence"}
              {technique && technique.rawStroke !== technique.stroke ? ` / raw: ${technique.rawStroke}` : ""}
            </p>
          </div>

          <div className={metricCardClass("zinc")}>
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-cyan-400" />
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Style Cadence</span>
            </div>
            <div className="flex items-end justify-between gap-3">
              <p className="text-2xl font-mono font-bold tabular-nums text-zinc-200">{formatSeconds(styleCheckIntervalMs)}</p>
              <p className="text-xs text-cyan-300 tabular-nums">Next {nextCheckLabel}</p>
            </div>
            <input type="range" min={MIN_STYLE_CHECK_INTERVAL_MS} max={MAX_STYLE_CHECK_INTERVAL_MS} step={STYLE_CHECK_INTERVAL_STEP_MS} value={styleCheckIntervalMs} onChange={(event) => onStyleCheckIntervalChange(Number(event.currentTarget.value))} className="mt-4 w-full accent-cyan-400" aria-label="Style check interval" />
            <div className="mt-3 flex items-center justify-between text-[11px] text-zinc-500">
              <span>{formatSeconds(MIN_STYLE_CHECK_INTERVAL_MS)}</span>
              <span>{styleCheck?.sampleCount ?? 0} samples</span>
              <span>{formatSeconds(MAX_STYLE_CHECK_INTERVAL_MS)}</span>
            </div>
            <p className="mt-2 text-xs text-zinc-500">Last check: {lastCheckLabel}</p>
          </div>

          <ReferenceCard title="EVF Picture" type="evf" active={anyEVF} />
          <ReferenceCard title="Top / 45 View" type="top" active={topViewActive} />
          <ReferenceCard title="Submerged Hand" type="water" active={partialSubmersionActive} />

          <div className={metricCardClass(anyEVF ? "emerald" : "zinc")}>
            <div className="flex items-center gap-2 mb-3">
              <Activity className="w-4 h-4 text-cyan-400" />
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Catch Mechanics</span>
            </div>
            <p className="text-4xl font-mono font-bold tabular-nums text-white tracking-tight">{arm?.valid ? `${arm.elbowAngle.toFixed(1)} deg` : "--"}</p>
            <p className="text-xs text-zinc-500 mt-2">EVF window: {EVF_ANGLE_MIN}-{EVF_ANGLE_MAX} deg, confidence {arm ? `${Math.round(arm.confidence * 100)}%` : "--"}.</p>
          </div>

          <div className={metricCardClass(armIdentity?.locked ? "emerald" : "zinc")}>
            <div className="flex items-center gap-2 mb-3">
              <Eye className="w-4 h-4 text-cyan-400" />
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">View Mode</span>
            </div>
            <p className="text-2xl font-mono font-bold tabular-nums text-zinc-200">{viewLabel}</p>
            <p className="text-xs text-zinc-500 mt-2">Yellow marks the shoulder and arm chain used for analysis.</p>
            <p className="text-xs text-zinc-500 mt-2">Arm ID: {armIdentityLabel} / {trackedArmLabel}</p>
          </div>

          <div className={metricCardClass("zinc")}>
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-amber-300" />
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Flaw Feedback</span>
            </div>
            <div className="flex flex-col gap-2">
              {technique ? (
                technique.feedback.map((item) => (
                  <p key={item.id} className={`rounded-md border px-3 py-2 text-xs leading-relaxed ${feedbackColor(item.severity)}`}>{item.message}</p>
                ))
              ) : (
                <p className="rounded-md border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-xs text-zinc-400">Waiting for pose landmarks.</p>
              )}
            </div>
          </div>

          <div className={metricCardClass(anyEVF ? "emerald" : "amber")}>
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500 mb-3 block">Catch Phase</span>
            <div className="flex items-center gap-3">
              <span className={`inline-block w-3 h-3 rounded-full ${anyEVF ? "bg-[#39FF14] shadow-[0_0_12px_#39FF14]" : "bg-amber-600"}`} />
              <span className="text-base font-semibold text-zinc-100">{anyEVF ? "EVF active" : "Tracking"}</span>
            </div>
            {evf && <p className="mt-3 text-xs text-zinc-500">L {evf.left.isEVF ? "active" : "idle"} / R {evf.right.isEVF ? "active" : "idle"}</p>}
          </div>

          <div className="rounded-lg bg-zinc-950/90 border border-emerald-950/60 p-4 flex items-start gap-3 shadow-lg shadow-black/35">
            <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-emerald-300">Privacy Status: Local-Only</p>
              <p className="text-xs text-zinc-500 mt-1 leading-relaxed">Video never leaves this device. Pose runs in your browser only.</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}