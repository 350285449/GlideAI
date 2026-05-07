import type { CameraViewMode, InterfaceStyleOption, StrokeFocus, TrackerSettings, SwimmerProfile, PredictionMode } from "@/types/glide";
import type { CSSProperties } from "react";

export const EVF_ANGLE_MIN = 100;
export const EVF_ANGLE_MAX = 120;
export const EVF_TOP_VIEW_ANGLE_MIN = 90;
export const EVF_TOP_VIEW_ANGLE_MAX = 140;
export const EVF_VERTICALITY_MIN = 70;
export const EVF_TOP_VIEW_VERTICALITY_MIN = 58;
export const CATCH_PHASE_THRESHOLD = 0.3;
export const CATCH_PHASE_EDGE_THRESHOLD = 0.28;
export const STROKE_RANGE_DECAY = 0.0025;
export const LANDMARK_SMOOTHING_ALPHA = 0.34;
export const LANDMARK_RELIABLE_VISIBILITY = 0.5;
export const LANDMARK_PARTIAL_VISIBILITY = 0.22;
export const LANDMARK_DRAW_VISIBILITY = 0.24;
export const HAND_PROXY_VISIBILITY = 0.34;
export const LOW_CONFIDENCE_JUMP_LIMIT = 0.11;
export const RELIABLE_JUMP_LIMIT = 0.24;
export const ASSIST_PREDICTION_HOLD_FRAMES = 8;
export const EXTENDED_PREDICTION_HOLD_FRAMES = 22;
export const MOTION_HISTORY_LENGTH = 42;
export const DEFAULT_STYLE_CHECK_INTERVAL_MS = 5000;
export const MIN_STYLE_CHECK_INTERVAL_MS = 3000;
export const MAX_STYLE_CHECK_INTERVAL_MS = 15000;
export const STYLE_CHECK_INTERVAL_STEP_MS = 1000;
export const STROKE_ACQUIRE_CHECKS = 2;
export const STROKE_SWITCH_CHECKS = 4;
export const STROKE_MEMORY_HOLD_CHECKS = 5;
export const ACTIVE_ARM_ACQUIRE_FRAMES = 8;
export const ACTIVE_ARM_SWITCH_FRAMES = 48;
export const ACTIVE_ARM_HOLD_FRAMES = 45;
export const ARM_IDENTITY_ACQUIRE_FRAMES = 8;
export const ARM_IDENTITY_HOLD_FRAMES = 45;
export const ARM_IDENTITY_ANCHOR_ALPHA = 0.08;
export const UI_UPDATE_INTERVAL_MS = 250;
export const MIN_ARM_SIGNAL_SCORE = 0.62;
export const SIDE_VIEW_SHOULDER_WIDTH_THRESHOLD = 0.06;
export const SINGLE_SHOULDER_SIDE_SCORE_MARGIN = 0.5;
export const ACTIVE_ARM_SWITCH_SCORE_MARGIN = 1.25;
export const ARM_SEGMENT_MIN = 0.015;
export const FOREARM_SEGMENT_MAX = 0.58;
export const UPPER_ARM_SEGMENT_MAX = 0.52;
export const ARM_RATIO_MIN = 0.25;
export const ARM_RATIO_MAX = 3.4;
export const ANGLE_SMOOTHING_ALPHA = 0.34;
export const ANGLE_MAX_STEP_DEGREES = 9;
export const ANGLE_HOLD_FRAMES = 5;
export const MIN_ANGLE_CONFIDENCE = 0.35;
export const VIDEO_WIDTH = 960;
export const VIDEO_HEIGHT = 540;
export const NEON_GREEN = "#39FF14";
export const DEFAULT_LIMB = "rgba(0, 200, 255, 0.55)";
export const DEFAULT_JOINT = "rgba(255, 255, 255, 0.85)";
export const SHOULDER_LINE = "rgba(250, 204, 21, 0.95)";
export const POSE_ASSET_PATH = "vendor/mediapipe/pose/";

export const DEFAULT_TRACKER_SETTINGS: TrackerSettings = {
  predictionMode: "assist",
  viewMode: "auto",
  edgeGuard: true,
  showSkeleton: true,
  showJoints: true,
  showTrails: true,
  showCoachCues: true,
  mirrored: true,
  cameraFacingMode: "user",
  overlayOpacity: 0.9,
};

export const DEFAULT_SWIMMER_PROFILE: SwimmerProfile = {
  heightIn: 70,
  weightLb: 165,
  armSpanIn: 70,
  upperArmIn: 13,
  forearmIn: 11,
  shoulderWidthIn: 17,
  profileInfluence: 55,
};

export const STROKE_FOCUS_OPTIONS: readonly StrokeFocus[] = [
  "Auto",
  "Freestyle",
  "Backstroke",
  "Butterfly",
  "Breaststroke",
];

export const CAMERA_VIEW_OPTIONS: readonly { id: CameraViewMode; label: string }[] = [
  { id: "auto", label: "Auto" },
  { id: "top", label: "Top" },
  { id: "side", label: "Side" },
  { id: "top-side", label: "Top 45" },
  { id: "front", label: "Front" },
];

export const INTERFACE_STYLE_OPTIONS: readonly InterfaceStyleOption[] = [
  {
    id: "pro",
    label: "Pro",
    description: "Dense analysis with cyan and emerald accents.",
    shellClass: "bg-zinc-950",
    videoClass: "border-zinc-800 shadow-black/50",
    activeClass: "border-cyan-500/70 bg-cyan-950/70 text-cyan-100",
    cueClass: "border-cyan-500/60 bg-cyan-950/75 text-cyan-50",
    vars: {
      "--glide-accent": "#22d3ee",
      "--glide-accent-soft": "rgba(8, 145, 178, 0.28)",
      "--glide-accent-muted": "#67e8f9",
      "--glide-accent-border": "rgba(14, 116, 144, 0.72)",
      "--glide-panel": "rgba(9, 9, 11, 0.92)",
      "--glide-panel-strong": "rgba(8, 47, 73, 0.42)",
      "--glide-card-border": "rgba(39, 39, 42, 0.86)",
      "--glide-focus": "#0891b2",
    } as CSSProperties,
  },
  {
    id: "pool",
    label: "Poolside",
    description: "Brighter deck-style contrast for quick scanning.",
    shellClass: "bg-sky-950/40",
    videoClass: "border-sky-700/60 shadow-sky-950/30",
    activeClass: "border-sky-400/70 bg-sky-900/80 text-sky-50",
    cueClass: "border-sky-300/70 bg-sky-950/80 text-sky-50",
    vars: {
      "--glide-accent": "#38bdf8",
      "--glide-accent-soft": "rgba(14, 165, 233, 0.26)",
      "--glide-accent-muted": "#bae6fd",
      "--glide-accent-border": "rgba(56, 189, 248, 0.72)",
      "--glide-panel": "rgba(7, 22, 35, 0.92)",
      "--glide-panel-strong": "rgba(12, 74, 110, 0.5)",
      "--glide-card-border": "rgba(14, 116, 144, 0.62)",
      "--glide-focus": "#0ea5e9",
    } as CSSProperties,
  },
  {
    id: "contrast",
    label: "Contrast",
    description: "Higher contrast labels and amber highlights.",
    shellClass: "bg-neutral-950",
    videoClass: "border-amber-500/55 shadow-amber-950/20",
    activeClass: "border-amber-300/80 bg-amber-950/80 text-amber-50",
    cueClass: "border-amber-300/75 bg-black/85 text-amber-50",
    vars: {
      "--glide-accent": "#fbbf24",
      "--glide-accent-soft": "rgba(180, 83, 9, 0.3)",
      "--glide-accent-muted": "#fde68a",
      "--glide-accent-border": "rgba(251, 191, 36, 0.76)",
      "--glide-panel": "rgba(10, 10, 10, 0.94)",
      "--glide-panel-strong": "rgba(69, 26, 3, 0.48)",
      "--glide-card-border": "rgba(120, 113, 108, 0.68)",
      "--glide-focus": "#d97706",
    } as CSSProperties,
  },
];

export function predictionHoldFrames(mode: PredictionMode): number {
  if (mode === "extended") return EXTENDED_PREDICTION_HOLD_FRAMES;
  if (mode === "assist") return ASSIST_PREDICTION_HOLD_FRAMES;
  return 0;
}