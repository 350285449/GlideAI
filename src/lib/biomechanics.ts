import type { NormalizedLandmark } from "@mediapipe/pose";
import type { Point, Point3D, SwimmerProfile, ProfileGeometry, AnalysisView } from "@/types/glide";
import {
  ARM_RATIO_MIN,
  ARM_RATIO_MAX,
  MIN_ARM_SIGNAL_SCORE,
  SIDE_VIEW_SHOULDER_WIDTH_THRESHOLD,
} from "@/lib/constants";

export const DEG = 180 / Math.PI;

export function angleBetweenPoints(a: Point, b: Point, c: Point): number {
  const ba: Point = { x: a.x - b.x, y: a.y - b.y };
  const bc: Point = { x: c.x - b.x, y: c.y - b.y };
  const dot = ba.x * bc.x + ba.y * bc.y;
  const magBA = Math.hypot(ba.x, ba.y);
  const magBC = Math.hypot(bc.x, bc.y);

  if (magBA === 0 || magBC === 0) return 0;

  const cosAngle = Math.max(-1, Math.min(1, dot / (magBA * magBC)));
  return Math.acos(cosAngle) * DEG;
}

export function forearmImageVerticality(elbow: Point, wrist: Point): number {
  const dx = wrist.x - elbow.x;
  const dy = wrist.y - elbow.y;
  const angle = Math.abs(Math.atan2(dy, dx) * DEG);
  return angle > 90 ? 180 - angle : angle;
}

export function forearmVerticality(elbow: Point3D, wrist: Point3D, useDepth: boolean): number {
  const imageVerticality = forearmImageVerticality(elbow, wrist);
  if (!useDepth) return imageVerticality;

  const planarLength = Math.hypot(wrist.x - elbow.x, wrist.y - elbow.y);
  const depthPitch = Math.atan2(Math.abs(wrist.z - elbow.z), Math.max(planarLength, 0.001)) * DEG;
  return imageVerticality * 0.82 + Math.min(depthPitch, 90) * 0.18;
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function smoothPoint(previous: Point | null, current: Point, alpha: number): Point {
  if (!previous) return current;

  return {
    x: previous.x * (1 - alpha) + current.x * alpha,
    y: previous.y * (1 - alpha) + current.y * alpha,
  };
}

export function landmarkDistance(a: NormalizedLandmark, b: NormalizedLandmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

export function mix(start: number, end: number, amount: number): number {
  return start * (1 - amount) + end * amount;
}

export function limitStep(previous: number, current: number, maxStep: number): number {
  return previous + clamp(current - previous, -maxStep, maxStep);
}

export function createProfileGeometry(profile: SwimmerProfile): ProfileGeometry {
  const influence = clamp(profile.profileInfluence / 100, 0, 1);
  const expectedArmRatio = clamp(
    profile.forearmIn / Math.max(profile.upperArmIn, 1),
    0.55,
    1.35
  );
  const armSpanRatio = clamp(
    profile.armSpanIn / Math.max(profile.heightIn, 1),
    0.82,
    1.18
  );
  const shoulderRatio = clamp(
    profile.shoulderWidthIn / Math.max(profile.heightIn, 1),
    0.18,
    0.34
  );
  const bodyMassIndex =
    (profile.weightLb / Math.max(profile.heightIn * profile.heightIn, 1)) * 703;
  const bodyMassSignalBias =
    bodyMassIndex > 28 ? -0.04 : bodyMassIndex < 19 ? 0.03 : 0;

  return {
    expectedArmRatio,
    armRatioMin: clamp(mix(ARM_RATIO_MIN, expectedArmRatio * 0.52, influence), ARM_RATIO_MIN, 1.05),
    armRatioMax: clamp(mix(ARM_RATIO_MAX, expectedArmRatio * 1.9, influence), 0.95, ARM_RATIO_MAX),
    minArmSignalScore: clamp(MIN_ARM_SIGNAL_SCORE + bodyMassSignalBias + influence * 0.03, 0.52, 0.75),
    completeArmSignalScore: clamp(1.35 + bodyMassSignalBias + influence * 0.05, 1.18, 1.5),
    sideViewShoulderThreshold: clamp(SIDE_VIEW_SHOULDER_WIDTH_THRESHOLD * mix(1, shoulderRatio / 0.24, influence), 0.048, 0.078),
    topArmReachFactor: clamp(0.65 * mix(1, armSpanRatio, influence), 0.55, 0.82),
    bodyMassSignalBias,
  };
}

export function isTopLikeView(view: AnalysisView): boolean {
  return view === "top" || view === "top-side";
}