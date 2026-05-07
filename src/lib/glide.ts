import type { NormalizedLandmark, Results } from "@mediapipe/pose";
import type { CSSProperties } from "react";

export interface Point {
  x: number;
  y: number;
}

export interface Point3D extends Point {
  z: number;
}

export interface ArmEVF {
  elbowAngle: number;
  verticality: number;
  inCatchPhase: boolean;
  isEVF: boolean;
  valid: boolean;
  confidence: number;
}

export interface EVFResult {
  left: ArmEVF;
  right: ArmEVF;
}

export type ArmSide = "left" | "right";
export type PredictionMode = "off" | "assist" | "extended";
export type CameraViewMode = "auto" | "top" | "side" | "top-side" | "front";
export type CameraFacingMode = "user" | "environment";
export type AnalysisView = Exclude<CameraViewMode, "auto"> | "unknown";
export type TrackingState = "live" | "limited" | "predicting" | "lost";
export type InterfaceStyle = "pro" | "pool" | "contrast";
export type PanelView = "dashboard" | "coach" | "settings" | "history";

export type StrokeType =
  | "Freestyle"
  | "Backstroke"
  | "Butterfly"
  | "Breaststroke"
  | "Unknown";
export type StrokeFocus = Exclude<StrokeType, "Unknown"> | "Auto";

export interface TechniqueFeedback {
  id: string;
  severity: "good" | "warning" | "critical";
  message: string;
}

export interface ShoulderMetrics {
  visible: boolean;
  view: AnalysisView;
  trackedSide: ArmSide | "both" | "none";
  slopeDegrees: number;
  width: number;
  centerX: number;
  centerY: number;
}

export interface TechniqueAnalysis {
  stroke: StrokeType;
  rawStroke: StrokeType;
  confidence: number;
  lockState: "acquiring" | "locked" | "switching" | "holding";
  shoulders: ShoulderMetrics;
  feedback: TechniqueFeedback[];
}

export interface FullAnalysis {
  evf: EVFResult;
  technique: TechniqueAnalysis;
  styleCheck: StyleCheckStatus;
  armIdentity: ArmIdentityStatus;
  tracking: TrackingStatus;
  trails: MotionTrails;
}

export interface StrokeRange {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface StrokeMemory {
  stableStroke: StrokeType;
  stableConfidence: number;
  candidateStroke: StrokeType;
  candidateFrames: number;
  unknownFrames: number;
}

export interface StyleCheckStatus {
  intervalMs: number;
  lastCheckedMsAgo: number | null;
  nextCheckMs: number;
  sampleCount: number;
}

export interface StyleVote {
  samples: number;
  confidenceTotal: number;
  confidencePeak: number;
}

export interface StyleAccumulator {
  samples: number;
  votes: Partial<Record<StrokeType, StyleVote>>;
}

export interface MotionTrack {
  points: Point[];
}

export interface ArmMotion {
  samples: number;
  rangeX: number;
  rangeY: number;
}

export interface MotionSummary {
  left: ArmMotion;
  right: ArmMotion;
}

export interface MotionHistory {
  leftWrist: MotionTrack;
  rightWrist: MotionTrack;
  leftElbow: MotionTrack;
  rightElbow: MotionTrack;
}

export interface ArmAngleTrack {
  elbowAngle: number;
  verticality: number;
  confidence: number;
  missingFrames: number;
}

export interface AngleMemory {
  left: ArmAngleTrack | null;
  right: ArmAngleTrack | null;
}

export interface ActiveArmMemory {
  side: ArmSide | null;
  candidateSide: ArmSide | null;
  candidateFrames: number;
  missingFrames: number;
}

export interface ArmIdentityMemory {
  swap: boolean;
  locked: boolean;
  observedFrames: number;
  candidateSwap: boolean | null;
  candidateFrames: number;
  missingFrames: number;
  leftAnchor: Point | null;
  rightAnchor: Point | null;
}

export interface ArmIdentityStatus {
  locked: boolean;
  swapped: boolean;
  leftTracked: boolean;
  rightTracked: boolean;
  confidence: number;
}

export interface ArmIdentityResolution {
  landmarks: NormalizedLandmark[];
  status: ArmIdentityStatus;
  swappedChanged: boolean;
}

export interface ArmChainStatus {
  score: number;
  complete: boolean;
  shoulder: boolean;
  elbow: boolean;
  wrist: boolean;
  edgeCount: number;
}

export interface TrackingStatus {
  state: TrackingState;
  predictionMode: PredictionMode;
  predictionFrames: number;
  maxPredictionFrames: number;
  visibleLandmarks: number;
  reliableLandmarks: number;
  edgeLandmarks: number;
  quality: number;
  fps: number;
  leftArm: ArmChainStatus;
  rightArm: ArmChainStatus;
}

export interface MotionTrails {
  left: Point[];
  right: Point[];
}

export interface TrackerSettings {
  predictionMode: PredictionMode;
  viewMode: CameraViewMode;
  edgeGuard: boolean;
  showSkeleton: boolean;
  showJoints: boolean;
  showTrails: boolean;
  showCoachCues: boolean;
  mirrored: boolean;
  cameraFacingMode: CameraFacingMode;
  overlayOpacity: number;
}

export interface VideoRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OverlayMetrics {
  width: number;
  height: number;
  videoRect: VideoRect;
  mirrored: boolean;
}

export interface ArmSignal {
  score: number;
  complete: boolean;
  partial: boolean;
  hasShoulder: boolean;
  hasElbow: boolean;
  hasWrist: boolean;
}

export interface LandmarkVelocity {
  x: number;
  y: number;
  z: number;
}

export interface LandmarkTrack {
  landmark: NormalizedLandmark;
  velocity: LandmarkVelocity;
  missingFrames: number;
}

export type PoseConnection = readonly [number, number];
export type LandmarkTrackingMemory = Array<LandmarkTrack | null>;
export type CatchAxis = "x" | "y";
export type StyleResult = Pick<TechniqueAnalysis, "stroke" | "confidence">;
export type PoseConstructorConfig = { locateFile?: (f: string) => string };

export interface InterfaceStyleOption {
  id: InterfaceStyle;
  label: string;
  description: string;
  shellClass: string;
  videoClass: string;
  activeClass: string;
  cueClass: string;
  vars: CSSProperties;
}

export interface SessionMark {
  id: number;
  timeLabel: string;
  stroke: StrokeType;
  quality: number;
  evfConfidence: number;
  cue: string;
}

export interface SwimmerProfile {
  heightIn: number;
  weightLb: number;
  armSpanIn: number;
  upperArmIn: number;
  forearmIn: number;
  shoulderWidthIn: number;
  profileInfluence: number;
}

export interface ProfileGeometry {
  armRatioMin: number;
  armRatioMax: number;
  expectedArmRatio: number;
  minArmSignalScore: number;
  completeArmSignalScore: number;
  sideViewShoulderThreshold: number;
  topArmReachFactor: number;
  bodyMassSignalBias: number;
}

export interface PoseInstance {
  setOptions: (o: Record<string, unknown>) => void;
  onResults: (cb: (r: Results) => void) => void;
  send: (input: { image: HTMLVideoElement }) => Promise<unknown>;
  close: () => void;
  initialize?: () => Promise<void>;
}