'use client';
// DONE BY VLAD AND A BIT OF CODEX
import React, { useCallback, useEffect, useRef, useState } from "react";
import Webcam from "react-webcam";
import type { NormalizedLandmark, Results } from "@mediapipe/pose";
import { CameraOff } from "lucide-react";
import {
  createStrokeBelief,
  resetStrokeBelief,
  setStrokeCalibrationModel,
  type StrokeCalibrationModel,
  type StrokeBeliefState,
  classifySwimStroke,
} from "@/lib/strokeClassification";
import strokeCalibrationModel from "@/data/strokeCalibrationModel.json";
import MetricsPanel, { cameraViewBadgeLabel, getInterfaceStyleOption, getPrimaryCue, predictionModeLabel } from "./MetricsPanel";
import type {
  Point, Point3D, ArmEVF, EVFResult, ArmSide, TrackingState,
  InterfaceStyle, StrokeType, StrokeFocus, TechniqueFeedback,
  ShoulderMetrics, TechniqueAnalysis, FullAnalysis, StrokeRange,
  StrokeMemory, StyleVote, StyleAccumulator, MotionTrack, ArmMotion,
  MotionSummary, MotionHistory, ArmAngleTrack, AngleMemory, ActiveArmMemory,
  ArmIdentityMemory, ArmIdentityStatus, ArmIdentityResolution, ArmChainStatus,
  TrackingStatus, MotionTrails, TrackerSettings, VideoRect, OverlayMetrics,
  ArmSignal, LandmarkTrackingMemory, CatchAxis, StyleResult,
  PoseConstructorConfig, SwimmerProfile, PoseInstance
} from "@/types/glide";
import {
  DEG, angleBetweenPoints, forearmVerticality, distance, smoothPoint,
  landmarkDistance, clamp, clamp01, mix, limitStep, createProfileGeometry, isTopLikeView
} from "@/lib/biomechanics";
import {
  EVF_ANGLE_MIN, EVF_ANGLE_MAX, EVF_TOP_VIEW_ANGLE_MIN, EVF_TOP_VIEW_ANGLE_MAX,
  EVF_VERTICALITY_MIN, EVF_TOP_VIEW_VERTICALITY_MIN, CATCH_PHASE_THRESHOLD,
  CATCH_PHASE_EDGE_THRESHOLD, STROKE_RANGE_DECAY, LANDMARK_SMOOTHING_ALPHA,
  LANDMARK_RELIABLE_VISIBILITY, LANDMARK_PARTIAL_VISIBILITY, LANDMARK_DRAW_VISIBILITY,
  HAND_PROXY_VISIBILITY, LOW_CONFIDENCE_JUMP_LIMIT, RELIABLE_JUMP_LIMIT,
  MOTION_HISTORY_LENGTH, DEFAULT_STYLE_CHECK_INTERVAL_MS, MIN_STYLE_CHECK_INTERVAL_MS,
  MAX_STYLE_CHECK_INTERVAL_MS, STROKE_ACQUIRE_CHECKS, STROKE_SWITCH_CHECKS,
  STROKE_MEMORY_HOLD_CHECKS, ACTIVE_ARM_ACQUIRE_FRAMES, ACTIVE_ARM_SWITCH_FRAMES,
  ACTIVE_ARM_HOLD_FRAMES, ARM_IDENTITY_ACQUIRE_FRAMES, ARM_IDENTITY_HOLD_FRAMES,
  ARM_IDENTITY_ANCHOR_ALPHA, UI_UPDATE_INTERVAL_MS,
  SINGLE_SHOULDER_SIDE_SCORE_MARGIN, ACTIVE_ARM_SWITCH_SCORE_MARGIN,
  ARM_SEGMENT_MIN, FOREARM_SEGMENT_MAX, UPPER_ARM_SEGMENT_MAX,
  ANGLE_SMOOTHING_ALPHA, ANGLE_MAX_STEP_DEGREES, ANGLE_HOLD_FRAMES, MIN_ANGLE_CONFIDENCE,
  VIDEO_WIDTH, VIDEO_HEIGHT, NEON_GREEN, DEFAULT_LIMB, DEFAULT_JOINT, SHOULDER_LINE,
  POSE_ASSET_PATH, DEFAULT_TRACKER_SETTINGS, DEFAULT_SWIMMER_PROFILE, predictionHoldFrames,
} from "@/lib/constants";

const SWIM_CONNECTIONS: readonly PoseConnection[] = [
  [11, 12],
  [11, 13],
  [13, 15],
  [15, 17],
  [15, 19],
  [15, 21],
  [12, 14],
  [14, 16],
  [16, 18],
  [16, 20],
  [16, 22],
  [11, 23],
  [12, 24],
  [23, 24],
];
const SWIM_LANDMARKS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24,
]);

function getCoverRect(
  containerWidth: number,
  containerHeight: number,
  mediaWidth: number,
  mediaHeight: number
): VideoRect {
  const mediaAspect = mediaWidth / Math.max(mediaHeight, 1);
  const containerAspect = containerWidth / Math.max(containerHeight, 1);

  if (containerAspect > mediaAspect) {
    const height = containerWidth / mediaAspect;
    return {
      x: 0,
      y: (containerHeight - height) / 2,
      width: containerWidth,
      height,
    };
  }

  const width = containerHeight * mediaAspect;
  return {
    x: (containerWidth - width) / 2,
    y: 0,
    width,
    height: containerHeight,
  };
}

function prepareOverlayCanvas(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement | undefined,
  mirrored: boolean
): OverlayMetrics {
  const width = Math.max(1, canvas.clientWidth || video?.clientWidth || VIDEO_WIDTH);
  const height = Math.max(1, canvas.clientHeight || video?.clientHeight || VIDEO_HEIGHT);
  const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  const pixelWidth = Math.round(width * dpr);
  const pixelHeight = Math.round(height * dpr);

  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  return {
    width,
    height,
    mirrored,
    videoRect: getCoverRect(
      width,
      height,
      video?.videoWidth || VIDEO_WIDTH,
      video?.videoHeight || VIDEO_HEIGHT
    ),
  };
}

function projectLandmark(
  landmark: NormalizedLandmark,
  metrics: OverlayMetrics
): Point {
  return projectNormalizedPoint(landmark, metrics);
}

function projectNormalizedPoint(point: Point, metrics: OverlayMetrics): Point {
  const { videoRect } = metrics;
  const x = metrics.mirrored ? 1 - point.x : point.x;

  return {
    x: videoRect.x + x * videoRect.width,
    y: videoRect.y + point.y * videoRect.height,
  };
}

export function cameraErrorMessage(error: unknown): string {
  const fallback = "Camera is unavailable.";
  const name = error instanceof DOMException ? error.name : "";
  const message = error instanceof Error ? error.message : String(error || fallback);
  const normalized = `${name} ${message}`.toLowerCase();

  if (
    normalized.includes("getusermedia") ||
    normalized.includes("not implemented") ||
    normalized.includes("media devices")
  ) {
    return cameraUnsupportedMessage();
  }

  if (name === "NotAllowedError" || normalized.includes("permission")) {
    return "Camera permission was blocked. Allow camera access in the browser address bar, then press Retry camera.";
  }

  if (name === "NotFoundError" || normalized.includes("requested device not found")) {
    return "No camera was found. Plug in or enable a webcam, then press Retry camera.";
  }

  if (name === "NotReadableError" || normalized.includes("could not start")) {
    return "The camera is already in use or Windows blocked it. Close other camera apps and check Windows Privacy > Camera.";
  }

  return message || fallback;
}

export function cameraUnsupportedMessage(): string {
  if (typeof window !== "undefined" && !window.isSecureContext) {
    return "Camera access needs a secure page. Open the app at http://localhost:3000 or http://127.0.0.1:3000, or use HTTPS if it is deployed or opened from another device.";
  }
  return "This browser does not expose camera access. Open the app in desktop Chrome or Microsoft Edge at http://localhost:3000 or http://127.0.0.1:3000, not inside an embedded preview.";
}

export function hasBrowserCameraApi(): boolean {
  return Boolean(
    typeof navigator !== "undefined" &&
      navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === "function"
  );
}

function appAssetUrl(path: string): string {
  if (typeof document === "undefined") return path;
  return new URL(path, document.baseURI).toString();
}

function isOutsideFrame(lm: NormalizedLandmark, margin = 0.015): boolean {
  return (
    lm.x < -margin ||
    lm.x > 1 + margin ||
    lm.y < -margin ||
    lm.y > 1 + margin
  );
}

function isNearFrameEdge(lm: NormalizedLandmark, margin = 0.025): boolean {
  return lm.x <= margin || lm.x >= 1 - margin || lm.y <= margin || lm.y >= 1 - margin;
}

function isLikelyOffscreenLandmark(lm: NormalizedLandmark): boolean {
  const visibility = landmarkVisibility(lm);
  return isOutsideFrame(lm) || (isNearFrameEdge(lm, 0.018) && visibility < LANDMARK_PARTIAL_VISIBILITY);
}

function isTrackableLandmark(
  lm: NormalizedLandmark | undefined,
  minVisibility = LANDMARK_PARTIAL_VISIBILITY
): lm is NormalizedLandmark {
  return Boolean(lm && !isOutsideFrame(lm, 0.035) && isVisible(lm, minVisibility));
}

function range(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.max(...values) - Math.min(...values);
}

function isVisible(
  lm: NormalizedLandmark | undefined,
  minVisibility = LANDMARK_RELIABLE_VISIBILITY
): lm is NormalizedLandmark {
  return Boolean(lm && (lm.visibility === undefined || lm.visibility >= minVisibility));
}

function landmarkVisibility(lm: NormalizedLandmark | undefined): number {
  return lm?.visibility ?? (lm ? 1 : 0);
}

function toPoint3D(lm: NormalizedLandmark): Point3D {
  return {
    x: lm.x,
    y: lm.y,
    z: lm.z ?? 0,
  };
}

function cloneLandmark(lm: NormalizedLandmark): NormalizedLandmark {
  return {
    ...lm,
    z: lm.z ?? 0,
    visibility: landmarkVisibility(lm),
  };
}

function createLandmarkTrackingMemory(): LandmarkTrackingMemory {
  return [];
}

function emptyLandmark(): NormalizedLandmark {
  return { x: 0, y: 0, z: 0, visibility: 0 };
}

function blendLandmarks(
  from: NormalizedLandmark,
  to: NormalizedLandmark,
  alpha: number,
  visibility: number
): NormalizedLandmark {
  return {
    ...to,
    x: clamp01(from.x * (1 - alpha) + to.x * alpha),
    y: clamp01(from.y * (1 - alpha) + to.y * alpha),
    z: (from.z ?? 0) * (1 - alpha) + (to.z ?? 0) * alpha,
    visibility,
  };
}

function limitLandmarkJump(
  from: NormalizedLandmark,
  to: NormalizedLandmark,
  maxJump: number
): NormalizedLandmark {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const jump = Math.hypot(dx, dy);

  if (jump <= maxJump || jump === 0) return to;

  const scale = maxJump / jump;
  return {
    ...to,
    x: clamp01(from.x + dx * scale),
    y: clamp01(from.y + dy * scale),
    z: (from.z ?? 0) + ((to.z ?? 0) - (from.z ?? 0)) * scale,
  };
}

function stabilizeLandmarks(
  current: NormalizedLandmark[],
  memory: LandmarkTrackingMemory,
  settings: TrackerSettings
): NormalizedLandmark[] {
  const maxHoldFrames = predictionHoldFrames(settings.predictionMode);

  return current.map((lm, index) => {
    const rawLandmark = cloneLandmark(lm);
    const edgeOccluded = settings.edgeGuard && isLikelyOffscreenLandmark(rawLandmark);
    const currentLandmark = edgeOccluded
      ? { ...rawLandmark, visibility: 0 }
      : rawLandmark;
    const track = memory[index];
    const currentVisibility = landmarkVisibility(currentLandmark);

    if (!track) {
      memory[index] = {
        landmark: currentLandmark,
        velocity: { x: 0, y: 0, z: 0 },
        missingFrames: currentVisibility >= LANDMARK_PARTIAL_VISIBILITY ? 0 : 1,
      };
      return currentLandmark;
    }

    const prev = track.landmark;
    const previousVisibility = landmarkVisibility(prev);
    const isReliable = currentVisibility >= LANDMARK_RELIABLE_VISIBILITY;
    const isPartial = currentVisibility >= LANDMARK_PARTIAL_VISIBILITY;
    const rawJump = landmarkDistance(prev, currentLandmark);
    const canPredictMissing =
      maxHoldFrames > 0 &&
      previousVisibility >= LANDMARK_PARTIAL_VISIBILITY &&
      track.missingFrames < maxHoldFrames;
    const shouldHoldOutlier =
      !isPartial &&
      previousVisibility >= LANDMARK_PARTIAL_VISIBILITY &&
      (edgeOccluded || rawJump > LOW_CONFIDENCE_JUMP_LIMIT) &&
      canPredictMissing;

    if (!isPartial && !canPredictMissing) {
      memory[index] = {
        landmark: currentLandmark,
        velocity: { x: 0, y: 0, z: 0 },
        missingFrames: track.missingFrames + 1,
      };
      return currentLandmark;
    }

    const predicted: NormalizedLandmark = {
      ...prev,
      x: clamp01(prev.x + track.velocity.x * 0.18),
      y: clamp01(prev.y + track.velocity.y * 0.18),
      z: (prev.z ?? 0) + track.velocity.z * 0.18,
      visibility: Math.max(
        currentVisibility,
        previousVisibility * (isPartial ? 0.68 : 0.46)
      ),
    };

    const filteredCurrent = shouldHoldOutlier
      ? predicted
      : limitLandmarkJump(
          prev,
          currentLandmark,
          isReliable ? RELIABLE_JUMP_LIMIT : LOW_CONFIDENCE_JUMP_LIMIT
        );
    const alpha = isReliable
      ? rawJump > RELIABLE_JUMP_LIMIT
        ? 0.56
        : LANDMARK_SMOOTHING_ALPHA
      : isPartial
        ? 0.24
        : 0.04;
    const base = isPartial ? prev : predicted;
    const visibility = isReliable
      ? Math.max(currentVisibility, previousVisibility * 0.9)
      : isPartial
        ? Math.max(currentVisibility, previousVisibility * 0.55)
        : landmarkVisibility(predicted);
    const next = blendLandmarks(base, filteredCurrent, alpha, visibility);
    const velocity = isPartial
      ? {
          x: track.velocity.x * 0.78 + (next.x - prev.x) * 0.22,
          y: track.velocity.y * 0.78 + (next.y - prev.y) * 0.22,
          z: track.velocity.z * 0.78 + ((next.z ?? 0) - (prev.z ?? 0)) * 0.22,
        }
      : {
          x: track.velocity.x * 0.72,
          y: track.velocity.y * 0.72,
          z: track.velocity.z * 0.72,
        };

    memory[index] = {
      landmark: next,
      velocity,
      missingFrames: isPartial ? 0 : track.missingFrames + 1,
    };

    return next;
  });
}

function predictLandmarksFromMemory(
  memory: LandmarkTrackingMemory
): NormalizedLandmark[] | null {
  if (memory.length === 0) return null;

  let visibleCount = 0;
  const landmarks = Array.from({ length: Math.max(33, memory.length) }, (_, index) => {
    const track = memory[index];
    if (!track) return emptyLandmark();

    const next: NormalizedLandmark = {
      ...track.landmark,
      x: clamp01(track.landmark.x + track.velocity.x * 0.12),
      y: clamp01(track.landmark.y + track.velocity.y * 0.12),
      z: (track.landmark.z ?? 0) + track.velocity.z * 0.12,
      visibility: landmarkVisibility(track.landmark) * 0.5,
    };

    track.landmark = next;
    track.velocity = {
      x: track.velocity.x * 0.68,
      y: track.velocity.y * 0.68,
      z: track.velocity.z * 0.68,
    };
    track.missingFrames += 1;

    if (isVisible(next, LANDMARK_DRAW_VISIBILITY)) visibleCount += 1;
    return next;
  });

  return visibleCount >= 3 ? landmarks : null;
}

function armIndices(side: ArmSide) {
  return side === "left"
    ? { shoulder: 11, elbow: 13, wrist: 15 }
    : { shoulder: 12, elbow: 14, wrist: 16 };
}

function handIndices(side: ArmSide): readonly number[] {
  return side === "left" ? [17, 19, 21] : [18, 20, 22];
}

function fullSideIndices(side: ArmSide): readonly number[] {
  const indices = armIndices(side);
  return [indices.shoulder, indices.elbow, indices.wrist];
}

function oppositeArm(side: ArmSide): ArmSide {
  return side === "left" ? "right" : "left";
}

function averageVisibleLandmarks(
  landmarks: NormalizedLandmark[],
  indices: readonly number[],
  minVisibility: number
): NormalizedLandmark | null {
  let weightTotal = 0;
  let x = 0;
  let y = 0;
  let z = 0;
  let peakVisibility = 0;

  for (const index of indices) {
    const landmark = landmarks[index];
    const visibility = landmarkVisibility(landmark);
    if (!landmark || visibility < minVisibility) continue;

    const weight = Math.max(visibility, 0.01);
    weightTotal += weight;
    x += landmark.x * weight;
    y += landmark.y * weight;
    z += (landmark.z ?? 0) * weight;
    peakVisibility = Math.max(peakVisibility, visibility);
  }

  if (weightTotal === 0) return null;

  return {
    x: clamp01(x / weightTotal),
    y: clamp01(y / weightTotal),
    z: z / weightTotal,
    visibility: peakVisibility,
  };
}

function stabilizeHandEndpoint(
  landmarks: NormalizedLandmark[],
  side: ArmSide
) {
  const indices = armIndices(side);
  const shoulder = landmarks[indices.shoulder];
  const elbow = landmarks[indices.elbow];
  const wrist = landmarks[indices.wrist];
  const visibleHandCount = handIndices(side).filter((index) =>
    isTrackableLandmark(landmarks[index], HAND_PROXY_VISIBILITY)
  ).length;
  const handProxy = averageVisibleLandmarks(
    landmarks,
    handIndices(side),
    HAND_PROXY_VISIBILITY
  );
  const wristVisibility = landmarkVisibility(wrist);
  const wristReliable = isTrackableLandmark(wrist, LANDMARK_RELIABLE_VISIBILITY);
  const wristPartial = isTrackableLandmark(wrist, LANDMARK_PARTIAL_VISIBILITY);

  if (wristReliable) return;
  if (!handProxy || !isVisible(elbow, LANDMARK_DRAW_VISIBILITY)) return;
  if (visibleHandCount < 2) return;

  let target = handProxy;
  const handDistance = distance(elbow, handProxy);
  const upperArmLength =
    isVisible(shoulder, LANDMARK_DRAW_VISIBILITY) && isVisible(elbow, LANDMARK_DRAW_VISIBILITY)
      ? distance(shoulder, elbow)
      : 0;
  const wristDistance =
    wrist && isVisible(wrist, LANDMARK_DRAW_VISIBILITY) ? distance(elbow, wrist) : 0;
  const baseLength = upperArmLength > 0 ? upperArmLength : wristDistance;
  const minForearmLength = Math.max(0.014, baseLength > 0 ? baseLength * 0.28 : 0.014);
  const maxForearmLength = clamp(
    baseLength > 0 ? baseLength * 1.55 : 0.36,
    0.07,
    FOREARM_SEGMENT_MAX
  );

  if (handDistance < minForearmLength) return;

  if (handDistance > maxForearmLength) {
    target = limitLandmarkJump(elbow, handProxy, maxForearmLength);
  }

  if (wristPartial && wrist) {
    const wristToProxy = landmarkDistance(wrist, target);
    const allowedProxyDrift = Math.max(0.035, Math.max(wristDistance, minForearmLength) * 0.45);

    if (wristToProxy > allowedProxyDrift) return;

    landmarks[indices.wrist] = blendLandmarks(
      wrist,
      target,
      0.12,
      Math.max(wristVisibility, HAND_PROXY_VISIBILITY)
    );
    return;
  }

  landmarks[indices.wrist] = {
    ...target,
    visibility: Math.min(0.42, Math.max(HAND_PROXY_VISIBILITY, landmarkVisibility(target) * 0.72)),
  };
}

function enhanceSwimLandmarks(landmarks: NormalizedLandmark[]): NormalizedLandmark[] {
  const enhanced = landmarks.map((landmark) => cloneLandmark(landmark));

  stabilizeHandEndpoint(enhanced, "left");
  stabilizeHandEndpoint(enhanced, "right");

  return enhanced;
}

function getArmAnchor(
  landmarks: NormalizedLandmark[],
  side: ArmSide
): Point | null {
  const anchor = averageVisibleLandmarks(
    landmarks,
    fullSideIndices(side),
    LANDMARK_DRAW_VISIBILITY
  );

  return anchor ? { x: anchor.x, y: anchor.y } : null;
}

function createArmIdentityStatus(
  memory: ArmIdentityMemory,
  leftTracked: boolean,
  rightTracked: boolean
): ArmIdentityStatus {
  const trackedCount = [leftTracked, rightTracked].filter(Boolean).length;
  const lockProgress = clamp(
    memory.observedFrames / ARM_IDENTITY_ACQUIRE_FRAMES,
    0,
    1
  );

  return {
    locked: memory.locked,
    swapped: memory.swap,
    leftTracked,
    rightTracked,
    confidence: clamp(
      (memory.locked ? 0.65 : 0.25) + lockProgress * 0.25 + trackedCount * 0.05,
      0,
      1
    ),
  };
}

function resolveArmIdentityLandmarks(
  landmarks: NormalizedLandmark[],
  memory: ArmIdentityMemory,
  profile: SwimmerProfile = DEFAULT_SWIMMER_PROFILE
): ArmIdentityResolution {
  const profileGeometry = createProfileGeometry(profile);
  const rawLeftSignal = getArmSignal(landmarks, "left", profile);
  const rawRightSignal = getArmSignal(landmarks, "right", profile);
  const mapped = landmarks.map(cloneLandmark);
  const mappedLeftAnchor = getArmAnchor(mapped, "left");
  const mappedRightAnchor = getArmAnchor(mapped, "right");
  const hasStableTwoArmFrame = Boolean(
    mappedLeftAnchor &&
    mappedRightAnchor &&
    rawLeftSignal.complete &&
    rawRightSignal.complete &&
    rawLeftSignal.score >= profileGeometry.completeArmSignalScore &&
    rawRightSignal.score >= profileGeometry.completeArmSignalScore
  );

  if (hasStableTwoArmFrame) {
    memory.missingFrames = 0;
    memory.observedFrames += 1;
    memory.swap = false;
    memory.candidateSwap = null;
    memory.candidateFrames = 0;
  } else {
    memory.missingFrames += 1;

    if (memory.missingFrames > ARM_IDENTITY_HOLD_FRAMES) {
      memory.locked = false;
      memory.observedFrames = 0;
      memory.candidateSwap = null;
      memory.candidateFrames = 0;
      memory.leftAnchor = null;
      memory.rightAnchor = null;
    }
  }

  if (!memory.locked && memory.observedFrames >= ARM_IDENTITY_ACQUIRE_FRAMES) {
    memory.locked = true;
  }

  if (mappedLeftAnchor) {
    memory.leftAnchor = smoothPoint(
      memory.leftAnchor,
      mappedLeftAnchor,
      ARM_IDENTITY_ANCHOR_ALPHA
    );
  }

  if (mappedRightAnchor) {
    memory.rightAnchor = smoothPoint(
      memory.rightAnchor,
      mappedRightAnchor,
      ARM_IDENTITY_ANCHOR_ALPHA
    );
  }

  return {
    landmarks: mapped,
    status: createArmIdentityStatus(
      memory,
      Boolean(mappedLeftAnchor),
      Boolean(mappedRightAnchor)
    ),
    swappedChanged: false,
  };
}

function syncEnhancedEndpointMemory(
  memory: LandmarkTrackingMemory,
  landmarks: NormalizedLandmark[],
  index: number
) {
  const landmark = landmarks[index];
  if (!landmark || !isVisible(landmark, LANDMARK_DRAW_VISIBILITY)) return;

  const track = memory[index];
  if (!track) {
    memory[index] = {
      landmark: cloneLandmark(landmark),
      velocity: { x: 0, y: 0, z: 0 },
      missingFrames: 0,
    };
    return;
  }

  const previous = track.landmark;
  const next = blendLandmarks(
    previous,
    landmark,
    landmarkVisibility(landmark) >= LANDMARK_RELIABLE_VISIBILITY ? 0.82 : 0.58,
    Math.max(landmarkVisibility(previous) * 0.6, landmarkVisibility(landmark))
  );

  track.landmark = next;
  track.velocity = {
    x: track.velocity.x * 0.55 + (next.x - previous.x) * 0.45,
    y: track.velocity.y * 0.55 + (next.y - previous.y) * 0.45,
    z: track.velocity.z * 0.55 + ((next.z ?? 0) - (previous.z ?? 0)) * 0.45,
  };
  track.missingFrames = 0;
}

function syncEnhancedArmEndpointMemory(
  memory: LandmarkTrackingMemory,
  landmarks: NormalizedLandmark[]
) {
  syncEnhancedEndpointMemory(memory, landmarks, 15);
  syncEnhancedEndpointMemory(memory, landmarks, 16);
}

function getArmSignal(
  landmarks: NormalizedLandmark[],
  side: ArmSide,
  profile: SwimmerProfile = DEFAULT_SWIMMER_PROFILE
): ArmSignal {
  const profileGeometry = createProfileGeometry(profile);
  const indices = armIndices(side);
  const shoulder = landmarks[indices.shoulder];
  const elbow = landmarks[indices.elbow];
  const wrist = landmarks[indices.wrist];
  const hasShoulder = isTrackableLandmark(shoulder, LANDMARK_PARTIAL_VISIBILITY);
  const hasElbow = isTrackableLandmark(elbow, LANDMARK_PARTIAL_VISIBILITY);
  const hasWrist = isTrackableLandmark(wrist, LANDMARK_PARTIAL_VISIBILITY);
  const visibleCount = [hasShoulder, hasElbow, hasWrist].filter(Boolean).length;

  if (visibleCount < 2 || !hasElbow || (!hasShoulder && !hasWrist)) {
    return {
      score: 0,
      complete: false,
      partial: false,
      hasShoulder,
      hasElbow,
      hasWrist,
    };
  }

  const hasForearm = hasElbow && hasWrist;
  const hasUpperArm = hasShoulder && hasElbow;
  const forearm = hasForearm ? distance(elbow, wrist) : 0;
  const upperArm = hasUpperArm ? distance(shoulder, elbow) : 0;
  const forearmOk =
    !hasForearm || (forearm >= ARM_SEGMENT_MIN && forearm <= FOREARM_SEGMENT_MAX);
  const upperArmOk =
    !hasUpperArm || (upperArm >= ARM_SEGMENT_MIN && upperArm <= UPPER_ARM_SEGMENT_MAX);
  const ratio = hasForearm && hasUpperArm && upperArm > 0 ? forearm / upperArm : 1;
  const ratioOk =
    !(hasForearm && hasUpperArm) ||
    (ratio >= profileGeometry.armRatioMin && ratio <= profileGeometry.armRatioMax);

  if (!forearmOk || !upperArmOk || !ratioOk) {
    return {
      score: 0,
      complete: false,
      partial: false,
      hasShoulder,
      hasElbow,
      hasWrist,
    };
  }

  const rawScore =
    (hasShoulder ? landmarkVisibility(shoulder) : 0) +
    (hasElbow ? landmarkVisibility(elbow) : 0) +
    (hasWrist ? landmarkVisibility(wrist) : 0) +
    (hasForearm ? 0.18 : 0) +
    (hasShoulder && hasWrist ? 0.12 : 0) -
    (hasForearm && hasUpperArm
      ? Math.min(Math.abs(ratio - profileGeometry.expectedArmRatio), 0.5) * 0.12
      : 0);

  return {
    score: rawScore,
    complete: hasShoulder && hasElbow && hasWrist,
    partial: true,
    hasShoulder,
    hasElbow,
    hasWrist,
  };
}

function armVisibilityScore(
  landmarks: NormalizedLandmark[],
  side: ArmSide,
  profile: SwimmerProfile = DEFAULT_SWIMMER_PROFILE
) {
  return getArmSignal(landmarks, side, profile).score;
}

function pickPrimaryArm(
  landmarks: NormalizedLandmark[],
  profile: SwimmerProfile = DEFAULT_SWIMMER_PROFILE
): ArmSide | null {
  const profileGeometry = createProfileGeometry(profile);
  const leftScore = armVisibilityScore(landmarks, "left", profile);
  const rightScore = armVisibilityScore(landmarks, "right", profile);

  if (
    leftScore < profileGeometry.minArmSignalScore &&
    rightScore < profileGeometry.minArmSignalScore
  ) {
    return null;
  }
  return leftScore >= rightScore ? "left" : "right";
}

function isUsablePoseFrame(
  landmarks: NormalizedLandmark[],
  settings: TrackerSettings,
  profile: SwimmerProfile = DEFAULT_SWIMMER_PROFILE
): boolean {
  const profileGeometry = createProfileGeometry(profile);
  const visibleUpperBody = [11, 12, 13, 14, 15, 16, 23, 24].filter((index) =>
    isTrackableLandmark(landmarks[index], LANDMARK_PARTIAL_VISIBILITY)
  ).length;
  const reliableUpperBody = [11, 12, 13, 14, 15, 16].filter((index) =>
    isTrackableLandmark(landmarks[index], LANDMARK_RELIABLE_VISIBILITY)
  ).length;
  const hasShoulderPair =
    isTrackableLandmark(landmarks[11], LANDMARK_PARTIAL_VISIBILITY) &&
    isTrackableLandmark(landmarks[12], LANDMARK_PARTIAL_VISIBILITY);
  const edgeUpperBody = settings.edgeGuard
    ? [11, 12, 13, 14, 15, 16, 23, 24].filter((index) => {
        const landmark = landmarks[index];
        return landmark ? isLikelyOffscreenLandmark(landmark) : false;
      }).length
    : 0;
  const leftSignal = getArmSignal(landmarks, "left", profile);
  const rightSignal = getArmSignal(landmarks, "right", profile);
  const hasArmChain =
    (leftSignal.complete && leftSignal.score >= profileGeometry.completeArmSignalScore) ||
    (rightSignal.complete && rightSignal.score >= profileGeometry.completeArmSignalScore);
  const hasPartialArmWithAnchor =
    (leftSignal.partial || rightSignal.partial) &&
    visibleUpperBody >= 3 &&
    reliableUpperBody >= 2;

  if (edgeUpperBody >= 5) return false;

  return (
    (hasTopViewSignal(landmarks, profile) && reliableUpperBody >= 2) ||
    hasArmChain ||
    (hasShoulderPair && hasPartialArmWithAnchor)
  );
}

function isHandLandmarkIndex(index: number): boolean {
  return index >= 17 && index <= 22;
}

function isDrawableHandLandmark(
  landmarks: NormalizedLandmark[],
  index: number,
  edgeGuardEnabled: boolean
): boolean {
  const side: ArmSide = index % 2 === 1 ? "left" : "right";
  const { elbow, wrist } = armIndices(side);
  const hand = landmarks[index];
  const wristLandmark = landmarks[wrist];
  const elbowLandmark = landmarks[elbow];

  if (edgeGuardEnabled && isLikelyOffscreenLandmark(hand)) return false;

  if (!isVisible(hand, HAND_PROXY_VISIBILITY) || !isVisible(wristLandmark, LANDMARK_DRAW_VISIBILITY)) {
    return false;
  }

  const wristToHand = landmarkDistance(wristLandmark, hand);
  const forearmLength =
    isVisible(elbowLandmark, LANDMARK_DRAW_VISIBILITY)
      ? landmarkDistance(elbowLandmark, wristLandmark)
      : 0;
  const maxHandDistance = Math.max(0.075, forearmLength * 0.72);

  return wristToHand <= maxHandDistance;
}

function isDrawableLandmark(
  landmarks: NormalizedLandmark[],
  index: number,
  edgeGuardEnabled: boolean
): boolean {
  const landmark = landmarks[index];
  if (!landmark) return false;

  if (edgeGuardEnabled && isOutsideFrame(landmark, 0)) return false;

  if (isHandLandmarkIndex(index)) {
    return isDrawableHandLandmark(landmarks, index, edgeGuardEnabled);
  }

  return isVisible(landmark, LANDMARK_DRAW_VISIBILITY);
}

function isDrawableConnection(
  landmarks: NormalizedLandmark[],
  startIdx: number,
  endIdx: number,
  edgeGuardEnabled: boolean
): boolean {
  const start = landmarks[startIdx];
  const end = landmarks[endIdx];

  if (
    !start ||
    !end ||
    !isDrawableLandmark(landmarks, startIdx, edgeGuardEnabled) ||
    !isDrawableLandmark(landmarks, endIdx, edgeGuardEnabled)
  ) {
    return false;
  }

  const segmentLength = landmarkDistance(start, end);
  if (isHandLandmarkIndex(startIdx) || isHandLandmarkIndex(endIdx)) {
    return segmentLength <= 0.12;
  }

  return segmentLength >= 0.008 && segmentLength <= 0.62;
}

function reduceLandmarkVisibility(
  landmarks: NormalizedLandmark[],
  indices: readonly number[]
) {
  for (const index of indices) {
    const landmark = landmarks[index];
    if (landmark) {
      landmarks[index] = { ...landmark, visibility: 0 };
    }
  }
}

function cleanUnstableArmGeometry(
  landmarks: NormalizedLandmark[],
  settings: TrackerSettings,
  profile: SwimmerProfile = DEFAULT_SWIMMER_PROFILE
): NormalizedLandmark[] {
  const cleaned = landmarks.map(cloneLandmark);
  const profileGeometry = createProfileGeometry(profile);

  for (const side of ["left", "right"] as const) {
    const indices = armIndices(side);
    const shoulder = cleaned[indices.shoulder];
    const elbow = cleaned[indices.elbow];
    const wrist = cleaned[indices.wrist];

    if (settings.edgeGuard) {
      for (const index of [indices.elbow, indices.wrist, ...handIndices(side)]) {
        const landmark = cleaned[index];
        if (landmark && isLikelyOffscreenLandmark(landmark)) {
          cleaned[index] = { ...landmark, visibility: 0 };
        }
      }
    }

    const hasShoulder = isTrackableLandmark(shoulder, LANDMARK_PARTIAL_VISIBILITY);
    const hasElbow = isTrackableLandmark(elbow, LANDMARK_PARTIAL_VISIBILITY);
    const hasWrist = isTrackableLandmark(wrist, LANDMARK_PARTIAL_VISIBILITY);

    if (hasShoulder && hasElbow) {
      const upperArm = landmarkDistance(shoulder, elbow);
      if (upperArm < ARM_SEGMENT_MIN || upperArm > UPPER_ARM_SEGMENT_MAX) {
        reduceLandmarkVisibility(cleaned, [
          indices.elbow,
          indices.wrist,
          ...handIndices(side),
        ]);
        continue;
      }
    }

    if (hasElbow && hasWrist) {
      const forearm = landmarkDistance(elbow, wrist);
      if (forearm < ARM_SEGMENT_MIN || forearm > FOREARM_SEGMENT_MAX) {
        reduceLandmarkVisibility(cleaned, [indices.wrist, ...handIndices(side)]);
        continue;
      }
    }

    if (hasShoulder && hasElbow && hasWrist) {
      const upperArm = landmarkDistance(shoulder, elbow);
      const forearm = landmarkDistance(elbow, wrist);
      const ratio = forearm / Math.max(upperArm, 0.001);

      if (
        ratio < profileGeometry.armRatioMin ||
        ratio > profileGeometry.armRatioMax
      ) {
        reduceLandmarkVisibility(cleaned, [indices.wrist, ...handIndices(side)]);
      }
    }
  }

  return cleaned;
}

function getArmChainStatus(
  landmarks: NormalizedLandmark[],
  side: ArmSide,
  profile: SwimmerProfile = DEFAULT_SWIMMER_PROFILE
): ArmChainStatus {
  const signal = getArmSignal(landmarks, side, profile);
  const indices = armIndices(side);
  const sideIndices = [indices.shoulder, indices.elbow, indices.wrist];

  return {
    score: signal.score,
    complete: signal.complete,
    shoulder: signal.hasShoulder,
    elbow: signal.hasElbow,
    wrist: signal.hasWrist,
    edgeCount: sideIndices.filter((index) => {
      const landmark = landmarks[index];
      return landmark ? isLikelyOffscreenLandmark(landmark) : false;
    }).length,
  };
}

function createTrackingStatus(
  landmarks: NormalizedLandmark[],
  settings: TrackerSettings,
  state: TrackingState,
  predictionFrames: number,
  fps: number,
  profile: SwimmerProfile = DEFAULT_SWIMMER_PROFILE
): TrackingStatus {
  const trackedIndices = Array.from(SWIM_LANDMARKS);
  const visibleLandmarks = trackedIndices.filter((index) =>
    isVisible(landmarks[index], LANDMARK_PARTIAL_VISIBILITY)
  ).length;
  const reliableLandmarks = trackedIndices.filter((index) =>
    isVisible(landmarks[index], LANDMARK_RELIABLE_VISIBILITY)
  ).length;
  const edgeLandmarks = trackedIndices.filter((index) => {
    const landmark = landmarks[index];
    return landmark ? isLikelyOffscreenLandmark(landmark) : false;
  }).length;
  const leftArm = getArmChainStatus(landmarks, "left", profile);
  const rightArm = getArmChainStatus(landmarks, "right", profile);
  const bestArmScore = Math.max(leftArm.score, rightArm.score);
  const quality = clamp(
    visibleLandmarks / trackedIndices.length * 0.34 +
      reliableLandmarks / Math.max(trackedIndices.length, 1) * 0.36 +
      Math.min(bestArmScore / 2.1, 1) * 0.3 -
      edgeLandmarks * 0.025,
    0,
    1
  );
  const limited =
    state === "live" && (quality < 0.55 || edgeLandmarks >= 2) ? "limited" : state;

  return {
    state: limited,
    predictionMode: settings.predictionMode,
    predictionFrames,
    maxPredictionFrames: predictionHoldFrames(settings.predictionMode),
    visibleLandmarks,
    reliableLandmarks,
    edgeLandmarks,
    quality,
    fps,
    leftArm,
    rightArm,
  };
}

function createMotionTrails(memory: MotionHistory): MotionTrails {
  return {
    left: [...memory.leftWrist.points],
    right: [...memory.rightWrist.points],
  };
}

function createMotionHistory(): MotionHistory {
  return {
    leftWrist: { points: [] },
    rightWrist: { points: [] },
    leftElbow: { points: [] },
    rightElbow: { points: [] },
  };
}

function createAngleMemory(): AngleMemory {
  return {
    left: null,
    right: null,
  };
}

function summarizeMotion(track: MotionTrack): ArmMotion {
  const points = track.points;
  return {
    samples: points.length,
    rangeX: range(points.map((point) => point.x)),
    rangeY: range(points.map((point) => point.y)),
  };
}

function pushMotionPoint(track: MotionTrack, landmark: NormalizedLandmark | undefined) {
  if (!isVisible(landmark, LANDMARK_PARTIAL_VISIBILITY)) return;

  track.points.push({ x: landmark.x, y: landmark.y });
  if (track.points.length > MOTION_HISTORY_LENGTH) {
    track.points.splice(0, track.points.length - MOTION_HISTORY_LENGTH);
  }
}

function updateMotionHistory(
  history: MotionHistory,
  landmarks: NormalizedLandmark[]
): MotionSummary {
  pushMotionPoint(history.leftWrist, landmarks[15]);
  pushMotionPoint(history.rightWrist, landmarks[16]);
  pushMotionPoint(history.leftElbow, landmarks[13]);
  pushMotionPoint(history.rightElbow, landmarks[14]);

  return {
    left: summarizeMotion(history.leftWrist),
    right: summarizeMotion(history.rightWrist),
  };
}

function createStrokeMemory(): StrokeMemory {
  return {
    stableStroke: "Unknown",
    stableConfidence: 0,
    candidateStroke: "Unknown",
    candidateFrames: 0,
    unknownFrames: 0,
  };
}

function createStyleAccumulator(): StyleAccumulator {
  return {
    samples: 0,
    votes: {},
  };
}

function pushStyleSample(accumulator: StyleAccumulator, result: StyleResult) {
  accumulator.samples += 1;

  const vote = accumulator.votes[result.stroke] ?? {
    samples: 0,
    confidenceTotal: 0,
    confidencePeak: 0,
  };

  vote.samples += 1;
  vote.confidenceTotal += result.confidence;
  vote.confidencePeak = Math.max(vote.confidencePeak, result.confidence);
  accumulator.votes[result.stroke] = vote;
}

function summarizeStyleSamples(
  accumulator: StyleAccumulator,
  fallback: StyleResult
): StyleResult {
  const entries = Object.entries(accumulator.votes) as Array<
    [StrokeType, StyleVote]
  >;

  if (entries.length === 0 || accumulator.samples === 0) {
    return fallback;
  }

  const knownEntries = entries.filter(([stroke]) => stroke !== "Unknown");
  const candidates = knownEntries.length > 0 ? knownEntries : entries;
  const [stroke, vote] = candidates.reduce((best, current) => {
    const bestScore =
      best[1].samples * 0.7 + best[1].confidenceTotal * 0.3;
    const currentScore =
      current[1].samples * 0.7 + current[1].confidenceTotal * 0.3;
    return currentScore > bestScore ? current : best;
  });
  const dominance = vote.samples / Math.max(1, accumulator.samples);
  const averageConfidence = vote.confidenceTotal / Math.max(1, vote.samples);

  return {
    stroke,
    confidence: clamp(averageConfidence * 0.8 + dominance * 0.2, 0, 0.92),
  };
}

function createStyleCheckStatus(
  now: number,
  intervalMs: number,
  windowStartedAt: number,
  lastCheckedAt: number,
  sampleCount: number
): StyleCheckStatus {
  const windowAge = windowStartedAt > 0 ? now - windowStartedAt : 0;
  const lastCheckedMsAgo = lastCheckedAt > 0 ? now - lastCheckedAt : null;

  return {
    intervalMs,
    lastCheckedMsAgo,
    nextCheckMs: Math.max(0, intervalMs - windowAge),
    sampleCount,
  };
}

function createActiveArmMemory(): ActiveArmMemory {
  return {
    side: null,
    candidateSide: null,
    candidateFrames: 0,
    missingFrames: 0,
  };
}

function createArmIdentityMemory(): ArmIdentityMemory {
  return {
    swap: false,
    locked: false,
    observedFrames: 0,
    candidateSwap: null,
    candidateFrames: 0,
    missingFrames: 0,
    leftAnchor: null,
    rightAnchor: null,
  };
}

function visiblePoint(
  lm: NormalizedLandmark | undefined,
  minVisibility = LANDMARK_PARTIAL_VISIBILITY
): Point | null {
  return isTrackableLandmark(lm, minVisibility) ? { x: lm.x, y: lm.y } : null;
}

function midpoint(a: Point, b: Point): Point {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  };
}

function averagePoints(points: Point[]): Point | null {
  if (points.length === 0) return null;

  return {
    x: points.reduce((total, point) => total + point.x, 0) / points.length,
    y: points.reduce((total, point) => total + point.y, 0) / points.length,
  };
}

function presentPoints(points: Array<Point | null>): Point[] {
  return points.filter((point): point is Point => point !== null);
}

function hasTopViewSignal(
  landmarks: NormalizedLandmark[],
  profile: SwimmerProfile = DEFAULT_SWIMMER_PROFILE
): boolean {
  const profileGeometry = createProfileGeometry(profile);
  const leftShoulder = visiblePoint(landmarks[11], LANDMARK_PARTIAL_VISIBILITY);
  const rightShoulder = visiblePoint(landmarks[12], LANDMARK_PARTIAL_VISIBILITY);
  const leftHip = visiblePoint(landmarks[23], LANDMARK_PARTIAL_VISIBILITY);
  const rightHip = visiblePoint(landmarks[24], LANDMARK_PARTIAL_VISIBILITY);

  if (!leftShoulder || !rightShoulder) {
    return false;
  }

  const shoulderCenter = midpoint(leftShoulder, rightShoulder);
  const shoulderWidth = distance(leftShoulder, rightShoulder);
  const armPoints = presentPoints([
    visiblePoint(landmarks[13], LANDMARK_PARTIAL_VISIBILITY),
    visiblePoint(landmarks[14], LANDMARK_PARTIAL_VISIBILITY),
    visiblePoint(landmarks[15], LANDMARK_PARTIAL_VISIBILITY),
    visiblePoint(landmarks[16], LANDMARK_PARTIAL_VISIBILITY),
  ]);
  const armReach = armPoints.reduce(
    (maxReach, point) => Math.max(maxReach, distance(shoulderCenter, point)),
    0
  );
  const armSpread =
    Math.max(
      range(armPoints.map((point) => point.x)),
      range(armPoints.map((point) => point.y))
    );
  const topByArmGeometry =
    shoulderWidth >= profileGeometry.sideViewShoulderThreshold &&
    armPoints.length >= 2 &&
    armReach > Math.max(shoulderWidth * profileGeometry.topArmReachFactor, 0.055) &&
    armSpread > shoulderWidth * 0.45;

  if (!leftHip && !rightHip) {
    return topByArmGeometry;
  }

  const hipCenter = averagePoints(presentPoints([leftHip, rightHip]));
  if (!hipCenter) return false;

  const hipWidth = leftHip && rightHip ? distance(leftHip, rightHip) : shoulderWidth * 0.8;
  const torsoLength = distance(shoulderCenter, hipCenter);
  const bodyWidth = Math.max(shoulderWidth, hipWidth, 0.045);

  return (torsoLength > 0.055 && torsoLength > bodyWidth * 0.55) || topByArmGeometry;
}

function hasSideViewSignal(
  landmarks: NormalizedLandmark[],
  profile: SwimmerProfile = DEFAULT_SWIMMER_PROFILE
): boolean {
  const profileGeometry = createProfileGeometry(profile);
  if (hasTopViewSignal(landmarks, profile)) return false;

  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];
  const leftVisible = isVisible(leftShoulder, LANDMARK_PARTIAL_VISIBILITY);
  const rightVisible = isVisible(rightShoulder, LANDMARK_PARTIAL_VISIBILITY);

  if (leftVisible !== rightVisible) {
    const leftScore = armVisibilityScore(landmarks, "left", profile);
    const rightScore = armVisibilityScore(landmarks, "right", profile);
    const strongerScore = Math.max(leftScore, rightScore);
    const weakerScore = Math.min(leftScore, rightScore);

    return (
      strongerScore >= profileGeometry.minArmSignalScore + SINGLE_SHOULDER_SIDE_SCORE_MARGIN &&
      weakerScore < profileGeometry.minArmSignalScore * 0.65 &&
      strongerScore - weakerScore > 1.2
    );
  }

  if (!leftVisible || !rightVisible) return false;

  return distance(leftShoulder, rightShoulder) < profileGeometry.sideViewShoulderThreshold;
}

function shouldUseSingleArmMode(
  landmarks: NormalizedLandmark[],
  profile: SwimmerProfile = DEFAULT_SWIMMER_PROFILE
): boolean {
  const profileGeometry = createProfileGeometry(profile);
  if (hasTopViewSignal(landmarks, profile)) return false;

  const leftScore = armVisibilityScore(landmarks, "left", profile);
  const rightScore = armVisibilityScore(landmarks, "right", profile);
  const strongerScore = Math.max(leftScore, rightScore);
  const weakerScore = Math.min(leftScore, rightScore);
  const oneArmClearlyDominant =
    strongerScore >= profileGeometry.minArmSignalScore + SINGLE_SHOULDER_SIDE_SCORE_MARGIN &&
    weakerScore < profileGeometry.minArmSignalScore * 0.65 &&
    strongerScore - weakerScore > 1.55;

  return hasSideViewSignal(landmarks, profile) || oneArmClearlyDominant;
}

function resolveActiveArm(
  landmarks: NormalizedLandmark[],
  memory: ActiveArmMemory,
  profile: SwimmerProfile = DEFAULT_SWIMMER_PROFILE
): ArmSide | null {
  const profileGeometry = createProfileGeometry(profile);
  const leftScore = armVisibilityScore(landmarks, "left", profile);
  const rightScore = armVisibilityScore(landmarks, "right", profile);
  const candidate = pickPrimaryArm(landmarks, profile);

  if (!candidate) {
    memory.missingFrames += 1;
    if (memory.side && memory.missingFrames <= ACTIVE_ARM_HOLD_FRAMES) {
      return memory.side;
    }

    memory.side = null;
    memory.candidateSide = null;
    memory.candidateFrames = 0;
    return null;
  }

  memory.missingFrames = 0;

  if (!memory.side) {
    if (memory.candidateSide === candidate) {
      memory.candidateFrames += 1;
    } else {
      memory.candidateSide = candidate;
      memory.candidateFrames = 1;
    }

    if (memory.candidateFrames >= ACTIVE_ARM_ACQUIRE_FRAMES) {
      memory.side = candidate;
      memory.candidateSide = null;
      memory.candidateFrames = 0;
    }

    return memory.side;
  }

  if (candidate === memory.side) {
    memory.candidateSide = null;
    memory.candidateFrames = 0;
    return memory.side;
  }

  const activeScore = memory.side === "left" ? leftScore : rightScore;
  const candidateScore = candidate === "left" ? leftScore : rightScore;
  const candidateSignal = getArmSignal(landmarks, candidate, profile);
  const candidateClearlyBetter =
    candidateSignal.partial &&
    candidateScore >= profileGeometry.minArmSignalScore + SINGLE_SHOULDER_SIDE_SCORE_MARGIN &&
    candidateScore > activeScore + ACTIVE_ARM_SWITCH_SCORE_MARGIN;

  if (!candidateClearlyBetter) {
    return memory.side;
  }

  if (memory.candidateSide === candidate) {
    memory.candidateFrames += 1;
  } else {
    memory.candidateSide = candidate;
    memory.candidateFrames = 1;
  }

  if (memory.candidateFrames >= ACTIVE_ARM_SWITCH_FRAMES) {
    memory.side = candidate;
    memory.candidateSide = null;
    memory.candidateFrames = 0;
  }

  return memory.side;
}

function suppressArm(
  landmarks: NormalizedLandmark[],
  side: ArmSide
): NormalizedLandmark[] {
  const indices = armIndices(side);
  const suppressed = landmarks.map((lm) => ({ ...lm }));

  for (const index of [
    indices.shoulder,
    indices.elbow,
    indices.wrist,
    ...handIndices(side),
  ]) {
    const landmark = suppressed[index];
    if (landmark) {
      suppressed[index] = { ...landmark, visibility: 0 };
    }
  }

  return suppressed;
}

function emptyArmEVF(): ArmEVF {
  return {
    elbowAngle: 0,
    verticality: 0,
    inCatchPhase: false,
    isEVF: false,
    valid: false,
    confidence: 0,
  };
}

function getArmGeometryQuality(
  shoulder: NormalizedLandmark,
  elbow: NormalizedLandmark,
  wrist: NormalizedLandmark,
  profile: SwimmerProfile = DEFAULT_SWIMMER_PROFILE
): number {
  const profileGeometry = createProfileGeometry(profile);
  if (
    !isTrackableLandmark(shoulder, LANDMARK_PARTIAL_VISIBILITY) ||
    !isTrackableLandmark(elbow, LANDMARK_PARTIAL_VISIBILITY) ||
    !isTrackableLandmark(wrist, LANDMARK_PARTIAL_VISIBILITY)
  ) {
    return 0;
  }

  const upperArm = landmarkDistance(shoulder, elbow);
  const forearm = landmarkDistance(elbow, wrist);

  if (
    upperArm < ARM_SEGMENT_MIN ||
    upperArm > UPPER_ARM_SEGMENT_MAX ||
    forearm < ARM_SEGMENT_MIN ||
    forearm > FOREARM_SEGMENT_MAX
  ) {
    return 0;
  }

  const ratio = forearm / Math.max(upperArm, 0.001);
  if (ratio < profileGeometry.armRatioMin || ratio > profileGeometry.armRatioMax) return 0;

  const visibilityQuality =
    (landmarkVisibility(shoulder) + landmarkVisibility(elbow) + landmarkVisibility(wrist)) / 3;
  const ratioCenter = profileGeometry.expectedArmRatio;
  const ratioSpread =
    (profileGeometry.armRatioMax - profileGeometry.armRatioMin) / 2;
  const ratioQuality = 1 - Math.min(1, Math.abs(ratio - ratioCenter) / ratioSpread);
  const lengthQuality = Math.min(upperArm / 0.08, 1) * 0.45 + Math.min(forearm / 0.08, 1) * 0.55;

  return clamp(visibilityQuality * 0.58 + ratioQuality * 0.18 + lengthQuality * 0.24, 0, 1);
}

function getStrokeAnchors(landmarks: NormalizedLandmark[]): NormalizedLandmark[] {
  const wrists = [landmarks[15], landmarks[16]].filter(
    (landmark): landmark is NormalizedLandmark =>
      isVisible(landmark, LANDMARK_PARTIAL_VISIBILITY)
  );

  if (wrists.length > 0) return wrists;

  return [landmarks[13], landmarks[14]].filter(
    (landmark): landmark is NormalizedLandmark =>
      isVisible(landmark, LANDMARK_PARTIAL_VISIBILITY)
  );
}

function resetStrokeRange(strokeRange: StrokeRange, anchors: NormalizedLandmark[]) {
  const xs = anchors.map((anchor) => anchor.x);
  const ys = anchors.map((anchor) => anchor.y);
  strokeRange.minX = Math.min(...xs);
  strokeRange.maxX = Math.max(...xs);
  strokeRange.minY = Math.min(...ys);
  strokeRange.maxY = Math.max(...ys);
}

function updateStrokeRange(
  strokeRange: StrokeRange,
  landmarks: NormalizedLandmark[]
) {
  const anchors = getStrokeAnchors(landmarks);

  if (anchors.length > 0) {
    const xs = anchors.map((anchor) => anchor.x);
    const ys = anchors.map((anchor) => anchor.y);
    strokeRange.minX = Math.min(strokeRange.minX, Math.min(...xs));
    strokeRange.maxX = Math.max(strokeRange.maxX, Math.max(...xs));
    strokeRange.minY = Math.min(strokeRange.minY, Math.min(...ys));
    strokeRange.maxY = Math.max(strokeRange.maxY, Math.max(...ys));
  }

  strokeRange.minX += STROKE_RANGE_DECAY;
  strokeRange.maxX -= STROKE_RANGE_DECAY;
  strokeRange.minY += STROKE_RANGE_DECAY;
  strokeRange.maxY -= STROKE_RANGE_DECAY;

  if (
    anchors.length > 0 &&
    (strokeRange.minX > strokeRange.maxX || strokeRange.minY > strokeRange.maxY)
  ) {
    resetStrokeRange(strokeRange, anchors);
  }
}

function selectCatchAxis(
  strokeRange: StrokeRange,
  motion: MotionSummary,
  side: ArmSide,
  view: ShoulderMetrics["view"]
): CatchAxis {
  if (!isTopLikeView(view)) return "y";

  const xRange = Math.max(strokeRange.maxX - strokeRange.minX, motion[side].rangeX);
  const yRange = Math.max(strokeRange.maxY - strokeRange.minY, motion[side].rangeY);
  const xDominance = view === "top-side" ? 0.95 : 1.15;
  return xRange > yRange * xDominance ? "x" : "y";
}

function isInCatchWindow(
  wrist: NormalizedLandmark,
  strokeRange: StrokeRange,
  axis: CatchAxis,
  allowEitherEdge: boolean
): boolean {
  const min = axis === "x" ? strokeRange.minX : strokeRange.minY;
  const max = axis === "x" ? strokeRange.maxX : strokeRange.maxY;
  const value = axis === "x" ? wrist.x : wrist.y;
  const rangeSize = max - min;

  if (rangeSize <= 0.01) return false;

  const progress = (value - min) / rangeSize;
  return allowEitherEdge
    ? progress < CATCH_PHASE_EDGE_THRESHOLD ||
        progress > 1 - CATCH_PHASE_EDGE_THRESHOLD
    : progress < CATCH_PHASE_THRESHOLD;
}

function isEVFGeometry(
  elbowAngle: number,
  verticality: number,
  inCatchPhase: boolean,
  view: ShoulderMetrics["view"]
): boolean {
  const angleMin =
    view === "top"
      ? EVF_TOP_VIEW_ANGLE_MIN
      : view === "top-side"
        ? 94
        : EVF_ANGLE_MIN;
  const angleMax =
    view === "top"
      ? EVF_TOP_VIEW_ANGLE_MAX
      : view === "top-side"
        ? 135
        : EVF_ANGLE_MAX;
  const verticalityMin =
    view === "top"
      ? EVF_TOP_VIEW_VERTICALITY_MIN
      : view === "top-side"
        ? 62
        : EVF_VERTICALITY_MIN;

  return (
    elbowAngle >= angleMin &&
    elbowAngle <= angleMax &&
    verticality >= verticalityMin &&
    inCatchPhase
  );
}

function checkEVFForArm(
  shoulder: NormalizedLandmark | undefined,
  elbow: NormalizedLandmark | undefined,
  wrist: NormalizedLandmark | undefined,
  strokeRange: StrokeRange,
  axis: CatchAxis,
  view: ShoulderMetrics["view"],
  profile: SwimmerProfile = DEFAULT_SWIMMER_PROFILE
): ArmEVF {
  if (
    !shoulder ||
    !elbow ||
    !wrist ||
    !isTrackableLandmark(shoulder, LANDMARK_PARTIAL_VISIBILITY) ||
    !isTrackableLandmark(elbow, LANDMARK_PARTIAL_VISIBILITY) ||
    !isTrackableLandmark(wrist, LANDMARK_PARTIAL_VISIBILITY)
  ) {
    return emptyArmEVF();
  }

  const confidence = getArmGeometryQuality(shoulder, elbow, wrist, profile);
  if (confidence < MIN_ANGLE_CONFIDENCE) {
    return emptyArmEVF();
  }

  const S: Point = { x: shoulder.x, y: shoulder.y };
  const E: Point = { x: elbow.x, y: elbow.y };
  const W: Point = { x: wrist.x, y: wrist.y };
  const useTopGeometry = isTopLikeView(view);
  const elbowAngle = angleBetweenPoints(S, E, W);
  const verticality = forearmVerticality(toPoint3D(elbow), toPoint3D(wrist), useTopGeometry);
  const inCatchPhase = isInCatchWindow(wrist, strokeRange, axis, useTopGeometry);

  return {
    elbowAngle,
    verticality,
    inCatchPhase,
    isEVF: isEVFGeometry(elbowAngle, verticality, inCatchPhase, view),
    valid: true,
    confidence,
  };
}

function stabilizeArmEVF(
  raw: ArmEVF,
  track: ArmAngleTrack | null,
  view: ShoulderMetrics["view"]
): {
  evf: ArmEVF;
  track: ArmAngleTrack | null;
} {
  if (!raw.valid) {
    if (track && track.missingFrames < ANGLE_HOLD_FRAMES) {
      const heldTrack = {
        ...track,
        confidence: track.confidence * 0.72,
        missingFrames: track.missingFrames + 1,
      };

      return {
        evf: {
          ...raw,
          elbowAngle: heldTrack.elbowAngle,
          verticality: heldTrack.verticality,
          isEVF: false,
          valid: heldTrack.confidence >= MIN_ANGLE_CONFIDENCE * 0.6,
          confidence: heldTrack.confidence,
        },
        track: heldTrack,
      };
    }

    return { evf: raw, track: null };
  }

  if (!track) {
    return {
      evf: raw,
      track: {
        elbowAngle: raw.elbowAngle,
        verticality: raw.verticality,
        confidence: raw.confidence,
        missingFrames: 0,
      },
    };
  }

  const limitedAngle = limitStep(track.elbowAngle, raw.elbowAngle, ANGLE_MAX_STEP_DEGREES);
  const limitedVerticality = limitStep(
    track.verticality,
    raw.verticality,
    ANGLE_MAX_STEP_DEGREES
  );
  const elbowAngle =
    track.elbowAngle * (1 - ANGLE_SMOOTHING_ALPHA) + limitedAngle * ANGLE_SMOOTHING_ALPHA;
  const verticality =
    track.verticality * (1 - ANGLE_SMOOTHING_ALPHA) +
    limitedVerticality * ANGLE_SMOOTHING_ALPHA;
  const confidence = track.confidence * 0.5 + raw.confidence * 0.5;

  return {
    evf: {
      ...raw,
      elbowAngle,
      verticality,
      confidence,
      isEVF: isEVFGeometry(elbowAngle, verticality, raw.inCatchPhase, view),
    },
    track: {
      elbowAngle,
      verticality,
      confidence,
      missingFrames: 0,
    },
  };
}

function stabilizeEVFResult(
  raw: EVFResult,
  memory: AngleMemory,
  view: ShoulderMetrics["view"]
): EVFResult {
  const left = stabilizeArmEVF(raw.left, memory.left, view);
  const right = stabilizeArmEVF(raw.right, memory.right, view);

  memory.left = left.track;
  memory.right = right.track;

  return {
    left: left.evf,
    right: right.evf,
  };
}

function checkEVF(
  landmarks: NormalizedLandmark[],
  strokeRange: StrokeRange,
  shoulders: ShoulderMetrics,
  motion: MotionSummary,
  profile: SwimmerProfile = DEFAULT_SWIMMER_PROFILE
): EVFResult {
  return {
    left: checkEVFForArm(
      landmarks[11],
      landmarks[13],
      landmarks[15],
      strokeRange,
      selectCatchAxis(strokeRange, motion, "left", shoulders.view),
      shoulders.view,
      profile
    ),
    right: checkEVFForArm(
      landmarks[12],
      landmarks[14],
      landmarks[16],
      strokeRange,
      selectCatchAxis(strokeRange, motion, "right", shoulders.view),
      shoulders.view,
      profile
    ),
  };
}

function getShoulderMetrics(
  landmarks: NormalizedLandmark[],
  profile: SwimmerProfile = DEFAULT_SWIMMER_PROFILE
): ShoulderMetrics {
  const profileGeometry = createProfileGeometry(profile);
  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];
  const leftVisible = isVisible(leftShoulder, LANDMARK_PARTIAL_VISIBILITY);
  const rightVisible = isVisible(rightShoulder, LANDMARK_PARTIAL_VISIBILITY);
  const leftHip = visiblePoint(landmarks[23], LANDMARK_PARTIAL_VISIBILITY);
  const rightHip = visiblePoint(landmarks[24], LANDMARK_PARTIAL_VISIBILITY);
  const hipCenter = averagePoints(presentPoints([leftHip, rightHip]));
  const hipWidth = leftHip && rightHip ? distance(leftHip, rightHip) : 0;
  const primaryArm = pickPrimaryArm(landmarks, profile);

  if (!leftVisible && !rightVisible) {
    if (hipCenter) {
      return {
        visible: true,
        view: "top",
        trackedSide: primaryArm ?? "none",
        slopeDegrees: 0,
        width: Math.max(hipWidth, 0.1),
        centerX: hipCenter.x,
        centerY: hipCenter.y,
      };
    }

    if (primaryArm) {
      const indices = armIndices(primaryArm);
      const elbow = landmarks[indices.elbow];
      const wrist = landmarks[indices.wrist];

      if (
        isVisible(elbow, LANDMARK_PARTIAL_VISIBILITY) &&
        isVisible(wrist, LANDMARK_PARTIAL_VISIBILITY)
      ) {
        return {
          visible: true,
          view: "side",
          trackedSide: primaryArm,
          slopeDegrees: 0,
          width: 0.12,
          centerX: (elbow.x + wrist.x) / 2,
          centerY: (elbow.y + wrist.y) / 2,
        };
      }
    }

    return {
      visible: false,
      view: "unknown",
      trackedSide: "none",
      slopeDegrees: 0,
      width: 0,
      centerX: 0.5,
      centerY: 0.5,
    };
  }

  if (!leftVisible || !rightVisible) {
    const trackedSide: ArmSide =
      primaryArm ?? (leftVisible ? "left" : "right");
    const shoulder = leftVisible ? leftShoulder : rightShoulder;
    const hasOverheadBodyLine = Boolean(
      hipCenter && distance({ x: shoulder.x, y: shoulder.y }, hipCenter) > 0.055
    );

    return {
      visible: true,
      view: hasOverheadBodyLine ? "top" : "side",
      trackedSide,
      slopeDegrees: 0,
      width: Math.max(hipWidth, 0.12),
      centerX:
        hasOverheadBodyLine && hipCenter
          ? (shoulder.x + hipCenter.x) / 2
          : shoulder.x,
      centerY:
        hasOverheadBodyLine && hipCenter
          ? (shoulder.y + hipCenter.y) / 2
          : shoulder.y,
    };
  }

  const left: Point = { x: leftShoulder.x, y: leftShoulder.y };
  const right: Point = { x: rightShoulder.x, y: rightShoulder.y };
  const width = distance(left, right);
  const view = hasTopViewSignal(landmarks, profile)
    ? "top"
    : width < profileGeometry.sideViewShoulderThreshold
      ? "side"
      : "front";

  return {
    visible: true,
    view,
    trackedSide: view === "side" ? primaryArm ?? "both" : "both",
    slopeDegrees: Math.abs(Math.atan2(right.y - left.y, right.x - left.x) * DEG),
    width,
    centerX: (left.x + right.x) / 2,
    centerY: (left.y + right.y) / 2,
  };
}

function resolveCameraViewMetrics(
  autoMetrics: ShoulderMetrics,
  viewMode: CameraViewMode
): ShoulderMetrics {
  if (viewMode === "auto") return autoMetrics;

  const sideTracked =
    autoMetrics.trackedSide === "none" ? "both" : autoMetrics.trackedSide;

  return {
    ...autoMetrics,
    view: viewMode,
    trackedSide:
      viewMode === "side" || viewMode === "top-side" ? sideTracked : "both",
  };
}

function classifyStroke(
  landmarks: NormalizedLandmark[],
  shoulders: ShoulderMetrics,
  motion: MotionSummary,
  motionHistory: MotionHistory,
  strokeBelief: StrokeBeliefState,
  profile: SwimmerProfile = DEFAULT_SWIMMER_PROFILE
): Pick<TechniqueAnalysis, "stroke" | "confidence"> {
  const leftSignal = getArmSignal(landmarks, "left", profile);
  const rightSignal = getArmSignal(landmarks, "right", profile);
  const partialArmCount = [leftSignal.partial, rightSignal.partial].filter(Boolean).length;
  const lw = landmarks[15];
  const rw = landmarks[16];
  const le = landmarks[13];
  const re = landmarks[14];
  const bothArmsChainVisible =
    isVisible(lw, LANDMARK_PARTIAL_VISIBILITY) &&
    isVisible(rw, LANDMARK_PARTIAL_VISIBILITY) &&
    isVisible(le, LANDMARK_PARTIAL_VISIBILITY) &&
    isVisible(re, LANDMARK_PARTIAL_VISIBILITY);

  const result = classifySwimStroke(
    {
      landmarks,
      shoulders,
      motion,
      motionHistory,
      primaryArm: pickPrimaryArm(landmarks, profile),
      bothArmsChainVisible,
      partialArmCount,
    },
    strokeBelief
  );

  return { stroke: result.stroke as StrokeType, confidence: result.confidence };
}

function buildTechniqueFeedback(
  landmarks: NormalizedLandmark[],
  evf: EVFResult,
  shoulders: ShoulderMetrics,
  stroke: StrokeType,
  profile: SwimmerProfile = DEFAULT_SWIMMER_PROFILE
): TechniqueFeedback[] {
  const feedback: TechniqueFeedback[] = [];
  const leftWrist = landmarks[15];
  const rightWrist = landmarks[16];
  const primaryArm = pickPrimaryArm(landmarks, profile);
  const primarySignal = primaryArm ? getArmSignal(landmarks, primaryArm, profile) : null;

  if (!shoulders.visible) {
    feedback.push({
      id: "shoulders-hidden",
      severity: "critical",
      message: "Show at least two upper-body landmarks; occlusion memory will hold brief submersion.",
    });
  } else if (shoulders.view === "top") {
    feedback.push({
      id: "top-view",
      severity: "good",
      message: primarySignal?.complete
        ? "Top-view tracking: overhead shoulder, hip, and arm geometry locked."
        : "Top-view partial tracking: holding visible body landmarks through water occlusion.",
    });
  } else if (shoulders.view === "top-side") {
    feedback.push({
      id: "top-side-view",
      severity: primaryArm ? "good" : "warning",
      message: primaryArm
        ? primarySignal?.complete
          ? `Top-side 45 tracking: blending overhead path and ${primaryArm} arm geometry.`
          : `Top-side 45 tracking: holding visible ${primaryArm} arm motion.`
        : "Top-side 45 view selected; keep at least one arm path in frame.",
    });
  } else if (shoulders.view === "side") {
    feedback.push({
      id: "side-view",
      severity: primaryArm ? "good" : "warning",
      message: primaryArm
        ? primarySignal?.complete
          ? `Side-view tracking: using the ${primaryArm} shoulder-arm chain.`
          : `Single-arm tracking: using visible ${primaryArm} elbow and wrist.`
        : "Side-view detected; bring one arm into frame for catch feedback.",
    });
  } else {
    feedback.push({
      id: "shoulders-visible",
      severity: "good",
      message: `Shoulders locked: ${shoulders.slopeDegrees.toFixed(0)} degree line angle.`,
    });
  }

  if (stroke === "Unknown") {
    feedback.push({
      id: "unknown-stroke",
      severity: "warning",
      message: "Technique is uncertain; keep one arm path or the shoulder-hip line visible.",
    });
  }

  if (primarySignal?.partial && !primarySignal.complete) {
    feedback.push({
      id: "partial-submerged",
      severity: "good",
      message: "Partial swimmer detected; submerged landmarks are being stabilized from recent motion.",
    });
  }

  if (shoulders.view === "front" && shoulders.slopeDegrees > 18) {
    feedback.push({
      id: "shoulder-tilt",
      severity: "warning",
      message: "Shoulder line is tilted; level the camera or reduce body roll during the catch.",
    });
  }

  if (
    shoulders.view === "front" &&
    isVisible(leftWrist) &&
    leftWrist.x > shoulders.centerX + shoulders.width * 0.1
  ) {
    feedback.push({
      id: "left-cross",
      severity: "warning",
      message: "Left hand is crossing the centerline; enter wider from the shoulder.",
    });
  }

  if (
    shoulders.view === "front" &&
    isVisible(rightWrist) &&
    rightWrist.x < shoulders.centerX - shoulders.width * 0.1
  ) {
    feedback.push({
      id: "right-cross",
      severity: "warning",
      message: "Right hand is crossing the centerline; enter wider from the shoulder.",
    });
  }

  if (evf.left.inCatchPhase && !evf.left.isEVF) {
    feedback.push({
      id: "left-dropped-elbow",
      severity: "critical",
      message: "Left catch is missing EVF; keep the elbow high and tip the forearm down.",
    });
  }

  if (evf.right.inCatchPhase && !evf.right.isEVF) {
    feedback.push({
      id: "right-dropped-elbow",
      severity: "critical",
      message: "Right catch is missing EVF; keep the elbow high and tip the forearm down.",
    });
  }

  if (evf.left.isEVF || evf.right.isEVF) {
    feedback.push({
      id: "evf-good",
      severity: "good",
      message: "EVF detected: forearm is vertical in the catch window.",
    });
  }

  return feedback.slice(0, 5);
}

function createTechniqueAnalysisFromStyle(
  landmarks: NormalizedLandmark[],
  evf: EVFResult,
  shoulders: ShoulderMetrics,
  style: StyleResult,
  profile: SwimmerProfile = DEFAULT_SWIMMER_PROFILE
): TechniqueAnalysis {
  return {
    stroke: style.stroke,
    rawStroke: style.stroke,
    confidence: style.confidence,
    lockState: "acquiring",
    shoulders,
    feedback: buildTechniqueFeedback(landmarks, evf, shoulders, style.stroke, profile),
  };
}

function withStyleMemoryFeedback(
  analysis: Pick<TechniqueAnalysis, "lockState" | "rawStroke" | "stroke">,
  liveFeedback: TechniqueFeedback[]
): TechniqueFeedback[] {
  const feedback = [...liveFeedback];
  const { lockState, rawStroke, stroke } = analysis;

  if (lockState === "acquiring") {
    feedback.unshift({
      id: "style-acquiring",
      severity: "warning",
      message: "Learning the current stroke; keep an arm path or shoulder-hip line visible.",
    });
  } else if (lockState === "switching") {
    feedback.unshift({
      id: "style-switching",
      severity: "warning",
      message: `Possible switch to ${rawStroke}; holding ${stroke} until it repeats.`,
    });
  } else if (lockState === "holding") {
    feedback.unshift({
      id: "style-holding",
      severity: "good",
      message: `Style memory is holding ${stroke} through brief occlusion.`,
    });
  }

  return feedback.slice(0, 5);
}

function refreshTechniqueFrame(
  technique: TechniqueAnalysis,
  landmarks: NormalizedLandmark[],
  evf: EVFResult,
  shoulders: ShoulderMetrics,
  profile: SwimmerProfile = DEFAULT_SWIMMER_PROFILE
): TechniqueAnalysis {
  const refreshed = {
    ...technique,
    shoulders,
  };

  return {
    ...refreshed,
    feedback: withStyleMemoryFeedback(
      refreshed,
      buildTechniqueFeedback(landmarks, evf, shoulders, technique.rawStroke, profile)
    ),
  };
}

function createPendingTechnique(
  landmarks: NormalizedLandmark[],
  evf: EVFResult,
  shoulders: ShoulderMetrics,
  provisionalStyle: StyleResult = { stroke: "Unknown", confidence: 0 },
  profile: SwimmerProfile = DEFAULT_SWIMMER_PROFILE
): TechniqueAnalysis {
  const pending: TechniqueAnalysis = {
    stroke: provisionalStyle.stroke,
    rawStroke: provisionalStyle.stroke,
    confidence: provisionalStyle.confidence * 0.72,
    lockState: "acquiring",
    shoulders,
    feedback: [],
  };

  return {
    ...pending,
    feedback: withStyleMemoryFeedback(
      pending,
      buildTechniqueFeedback(
        landmarks,
        evf,
        shoulders,
        provisionalStyle.stroke,
        profile
      )
    ),
  };
}

function withStrokeMemory(
  analysis: TechniqueAnalysis,
  memory: StrokeMemory
): TechniqueAnalysis {
  const rawStroke = analysis.rawStroke;
  let stroke = memory.stableStroke;
  let confidence = memory.stableConfidence;
  let lockState: TechniqueAnalysis["lockState"] =
    stroke === "Unknown" ? "acquiring" : "locked";

  if (rawStroke === "Unknown") {
    memory.unknownFrames += 1;

    if (
      memory.stableStroke !== "Unknown" &&
      memory.unknownFrames <= STROKE_MEMORY_HOLD_CHECKS
    ) {
      stroke = memory.stableStroke;
      confidence = Math.max(0.36, memory.stableConfidence * 0.82);
      lockState = "holding";
    } else {
      stroke = "Unknown";
      confidence = 0;
      lockState = "acquiring";
    }
  } else {
    memory.unknownFrames = 0;

    if (memory.stableStroke === "Unknown") {
      if (memory.candidateStroke === rawStroke) {
        memory.candidateFrames += 1;
      } else {
        memory.candidateStroke = rawStroke;
        memory.candidateFrames = 1;
      }

      if (
        memory.candidateFrames >= STROKE_ACQUIRE_CHECKS &&
        analysis.confidence >= 0.5
      ) {
        memory.stableStroke = rawStroke;
        memory.stableConfidence = analysis.confidence;
        stroke = rawStroke;
        confidence = analysis.confidence;
        lockState = "locked";
      } else {
        stroke = "Unknown";
        confidence = analysis.confidence;
        lockState = "acquiring";
      }
    } else if (rawStroke === memory.stableStroke) {
      memory.candidateStroke = "Unknown";
      memory.candidateFrames = 0;
      memory.stableConfidence =
        memory.stableConfidence * 0.82 + analysis.confidence * 0.18;
      stroke = memory.stableStroke;
      confidence = memory.stableConfidence;
      lockState = "locked";
    } else if (analysis.confidence < 0.62) {
      stroke = memory.stableStroke;
      confidence = Math.max(0.4, memory.stableConfidence * 0.9);
      lockState = "locked";
    } else {
      if (memory.candidateStroke === rawStroke) {
        memory.candidateFrames += 1;
      } else {
        memory.candidateStroke = rawStroke;
        memory.candidateFrames = 1;
      }

      if (memory.candidateFrames >= STROKE_SWITCH_CHECKS) {
        memory.stableStroke = rawStroke;
        memory.stableConfidence = analysis.confidence;
        memory.candidateStroke = "Unknown";
        memory.candidateFrames = 0;
        stroke = rawStroke;
        confidence = analysis.confidence;
        lockState = "locked";
      } else {
        stroke = memory.stableStroke;
        confidence = Math.max(0.42, memory.stableConfidence * 0.92);
        lockState = "switching";
      }
    }
  }

  return {
    ...analysis,
    stroke,
    rawStroke,
    confidence,
    lockState,
    feedback: withStyleMemoryFeedback(
      { lockState, rawStroke, stroke },
      analysis.feedback
    ),
  };
}

function applyStrokeFocus(
  analysis: TechniqueAnalysis,
  strokeFocus: StrokeFocus
): TechniqueAnalysis {
  if (strokeFocus === "Auto") return analysis;

  const focusMatches =
    analysis.rawStroke === strokeFocus || analysis.stroke === strokeFocus;
  const focusFeedback: TechniqueFeedback = {
    id: "style-focus",
    severity: focusMatches ? "good" : "warning",
    message: focusMatches
      ? `${strokeFocus} focus is aligned with the detected stroke.`
      : `${strokeFocus} focus is active; auto-detect is seeing ${analysis.rawStroke}.`,
  };

  return {
    ...analysis,
    stroke: strokeFocus,
    confidence: focusMatches
      ? Math.max(analysis.confidence, 0.58)
      : Math.max(0.38, analysis.confidence * 0.72),
    feedback: [
      focusFeedback,
      ...analysis.feedback.filter((item) => item.id !== focusFeedback.id),
    ].slice(0, 6),
  };
}

function drawTrail(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  metrics: OverlayMetrics,
  color: string,
  opacity: number
) {
  if (points.length < 2) return;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (let i = 1; i < points.length; i += 1) {
    const from = projectNormalizedPoint(points[i - 1], metrics);
    const to = projectNormalizedPoint(points[i], metrics);
    const progress = i / points.length;

    ctx.globalAlpha = opacity * progress * 0.42;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1 + progress * 3;
    ctx.stroke();
  }

  ctx.restore();
}

function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  landmarks: NormalizedLandmark[],
  analysis: FullAnalysis,
  metrics: OverlayMetrics,
  settings: TrackerSettings
) {
  ctx.clearRect(0, 0, metrics.width, metrics.height);

  const { evf, technique } = analysis;
  const evfSegments = new Set<string>();
  const swimConnections = SWIM_CONNECTIONS;
  const opacity = settings.overlayOpacity;

  if (settings.showTrails) {
    drawTrail(ctx, analysis.trails.left, metrics, "rgba(34, 211, 238, 0.95)", opacity);
    drawTrail(ctx, analysis.trails.right, metrics, "rgba(52, 211, 153, 0.95)", opacity);
  }

  if (evf.left.isEVF) {
    evfSegments.add("11-13");
    evfSegments.add("13-15");
  }
  if (evf.right.isEVF) {
    evfSegments.add("12-14");
    evfSegments.add("14-16");
  }

  if (settings.showSkeleton) {
    for (const [startIdx, endIdx] of swimConnections) {
      const start = landmarks[startIdx];
      const end = landmarks[endIdx];
      if (
        !start ||
        !end ||
        !isDrawableConnection(landmarks, startIdx, endIdx, settings.edgeGuard)
      ) {
        continue;
      }
      const startPoint = projectLandmark(start, metrics);
      const endPoint = projectLandmark(end, metrics);

      const segKey = `${startIdx}-${endIdx}`;
      const isEVFSeg = evfSegments.has(segKey);
      const isShoulderSeg = segKey === "11-12" || segKey === "12-11";
      const segmentAlpha = clamp(
        (Math.min(landmarkVisibility(start), landmarkVisibility(end)) + 0.2) * opacity,
        0.18,
        opacity
      );

      ctx.globalAlpha = segmentAlpha;
      ctx.beginPath();
      ctx.moveTo(startPoint.x, startPoint.y);
      ctx.lineTo(endPoint.x, endPoint.y);
      ctx.strokeStyle = isEVFSeg ? NEON_GREEN : isShoulderSeg ? SHOULDER_LINE : DEFAULT_LIMB;
      ctx.lineWidth = isEVFSeg || isShoulderSeg ? 4 : 2;
      ctx.shadowColor = isEVFSeg ? NEON_GREEN : isShoulderSeg ? SHOULDER_LINE : "transparent";
      ctx.shadowBlur = isEVFSeg || isShoulderSeg ? 12 : 0;
      ctx.stroke();
    }
  }

  ctx.globalAlpha = 1;
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;

  if (!settings.showJoints) return;

  for (const i of SWIM_LANDMARKS) {
    const lm = landmarks[i];
    if (!lm || !isDrawableLandmark(landmarks, i, settings.edgeGuard)) continue;

    const isEVFJoint =
      (evf.left.isEVF && (i === 11 || i === 13 || i === 15)) ||
      (evf.right.isEVF && (i === 12 || i === 14 || i === 16));
    const isShoulderJoint = technique.shoulders.visible && (i === 11 || i === 12);
    const point = projectLandmark(lm, metrics);

    ctx.globalAlpha = clamp((landmarkVisibility(lm) + 0.2) * opacity, 0.25, opacity);
    ctx.beginPath();
    ctx.arc(
      point.x,
      point.y,
      isEVFJoint || isShoulderJoint ? 5 : 3,
      0,
      2 * Math.PI
    );
    ctx.fillStyle = isEVFJoint ? NEON_GREEN : isShoulderJoint ? SHOULDER_LINE : DEFAULT_JOINT;
    ctx.fill();
  }

  ctx.globalAlpha = 1;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolvePoseCtor(mp: any): new (config: PoseConstructorConfig) => PoseInstance {
  const windowPose =
    typeof window !== "undefined"
      ? (window as Window & { Pose?: unknown }).Pose
      : undefined;
  const Ctor = mp.Pose || mp.default?.Pose || windowPose || mp;

  if (typeof window !== "undefined" && typeof Ctor === "function") {
    (window as Window & { Pose?: unknown }).Pose = Ctor;
  }

  return Ctor as new (config: PoseConstructorConfig) => PoseInstance;
}

export default function AnalysisEngine() {
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokeRangeRef = useRef<StrokeRange>({ minX: 1, maxX: 0, minY: 1, maxY: 0 });
  const landmarkMemoryRef = useRef<LandmarkTrackingMemory>(createLandmarkTrackingMemory());
  const motionHistoryRef = useRef<MotionHistory>(createMotionHistory());
  const strokeBeliefRef = useRef<StrokeBeliefState>(createStrokeBelief());
  const angleMemoryRef = useRef<AngleMemory>(createAngleMemory());
  const strokeMemoryRef = useRef<StrokeMemory>(createStrokeMemory());
  const styleAccumulatorRef = useRef<StyleAccumulator>(createStyleAccumulator());
  const styleWindowStartedAtRef = useRef(0);
  const lastStyleCheckRef = useRef(0);
  const lastStyleTechniqueRef = useRef<TechniqueAnalysis | null>(null);
  const styleCheckIntervalRef = useRef(DEFAULT_STYLE_CHECK_INTERVAL_MS);
  const armIdentityMemoryRef = useRef<ArmIdentityMemory>(createArmIdentityMemory());
  const activeArmMemoryRef = useRef<ActiveArmMemory>(createActiveArmMemory());
  const lastAnalysisRef = useRef<FullAnalysis | null>(null);
  const lastStateUpdateRef = useRef(0);
  const missingFramesRef = useRef(0);
  const trackerSettingsRef = useRef<TrackerSettings>(DEFAULT_TRACKER_SETTINGS);
  const analysisPausedRef = useRef(false);
  const strokeFocusRef = useRef<StrokeFocus>("Auto");
  const swimmerProfileRef = useRef<SwimmerProfile>(DEFAULT_SWIMMER_PROFILE);
  const lastFrameTimestampRef = useRef(0);
  const fpsRef = useRef(0);

  useEffect(() => {
    setStrokeCalibrationModel(strokeCalibrationModel as unknown as StrokeCalibrationModel);
    return () => {
      setStrokeCalibrationModel(null);
    };
  }, []);

  const [analysisState, setAnalysisState] = useState<FullAnalysis | null>(null);
  const [styleCheckIntervalMs, setStyleCheckIntervalMs] = useState(
    DEFAULT_STYLE_CHECK_INTERVAL_MS
  );
  const [trackerSettings, setTrackerSettings] = useState<TrackerSettings>(
    DEFAULT_TRACKER_SETTINGS
  );
  const [analysisPaused, setAnalysisPaused] = useState(false);
  const [strokeFocus, setStrokeFocus] = useState<StrokeFocus>("Auto");
  const [swimmerProfile, setSwimmerProfile] = useState<SwimmerProfile>(
    DEFAULT_SWIMMER_PROFILE
  );
  const [interfaceStyle, setInterfaceStyle] = useState<InterfaceStyle>("pro");
  const [cameraReady, setCameraReady] = useState(false);
  const [videoStreamReady, setVideoStreamReady] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraRetryKey, setCameraRetryKey] = useState(0);
  const [cameraApiSupported, setCameraApiSupported] = useState(true);

  const resetTrackingMemory = useCallback(() => {
    landmarkMemoryRef.current = createLandmarkTrackingMemory();
    motionHistoryRef.current = createMotionHistory();
    resetStrokeBelief(strokeBeliefRef.current);
    angleMemoryRef.current = createAngleMemory();
    strokeMemoryRef.current = createStrokeMemory();
    styleAccumulatorRef.current = createStyleAccumulator();
    styleWindowStartedAtRef.current = 0;
    lastStyleCheckRef.current = 0;
    lastStyleTechniqueRef.current = null;
    armIdentityMemoryRef.current = createArmIdentityMemory();
    activeArmMemoryRef.current = createActiveArmMemory();
    strokeRangeRef.current = { minX: 1, maxX: 0, minY: 1, maxY: 0 };
    lastAnalysisRef.current = null;
    lastStateUpdateRef.current = 0;
    missingFramesRef.current = 0;
    setAnalysisState(null);
  }, []);

  const handleTrackerSettingsChange = useCallback(
    (patch: Partial<TrackerSettings>) => {
      const previousSettings = trackerSettingsRef.current;
      const viewModeChanged =
        patch.viewMode !== undefined && patch.viewMode !== previousSettings.viewMode;
      const cameraFacingChanged =
        patch.cameraFacingMode !== undefined &&
        patch.cameraFacingMode !== previousSettings.cameraFacingMode;
      const nextSettings = { ...previousSettings, ...patch };
      trackerSettingsRef.current = nextSettings;
      setTrackerSettings(nextSettings);

      if (patch.predictionMode === "off") {
        missingFramesRef.current = 0;
      }

      if (viewModeChanged || cameraFacingChanged) {
        resetTrackingMemory();
      }

      if (cameraFacingChanged) {
        setCameraReady(false);
        setVideoStreamReady(false);
        setCameraRetryKey((key) => key + 1);
      }
    },
    [resetTrackingMemory]
  );

  const handleStyleCheckIntervalChange = useCallback((intervalMs: number) => {
    const normalizedInterval = clamp(
      intervalMs,
      MIN_STYLE_CHECK_INTERVAL_MS,
      MAX_STYLE_CHECK_INTERVAL_MS
    );
    styleCheckIntervalRef.current = normalizedInterval;
    styleAccumulatorRef.current = createStyleAccumulator();
    styleWindowStartedAtRef.current =
      typeof performance !== "undefined" ? performance.now() : 0;
    setStyleCheckIntervalMs(normalizedInterval);
  }, []);

  const handleAnalysisPausedChange = useCallback((paused: boolean) => {
    analysisPausedRef.current = paused;
    setAnalysisPaused(paused);
  }, []);

  const handleStrokeFocusChange = useCallback((focus: StrokeFocus) => {
    strokeFocusRef.current = focus;
    setStrokeFocus(focus);
  }, []);

  const handleSwimmerProfileChange = useCallback((patch: Partial<SwimmerProfile>) => {
    const nextProfile = { ...swimmerProfileRef.current, ...patch };
    swimmerProfileRef.current = nextProfile;
    setSwimmerProfile(nextProfile);
  }, []);

  const retryCamera = useCallback(() => {
    const supported = hasBrowserCameraApi();
    setCameraApiSupported(supported);
    setCameraError(supported ? null : cameraUnsupportedMessage());
    setCameraReady(false);
    setVideoStreamReady(false);
    setIsLoaded(false);
    setCameraRetryKey((key) => key + 1);
  }, []);

  useEffect(() => {
    if (!hasBrowserCameraApi()) {
      setCameraApiSupported(false);
      setVideoStreamReady(false);
      setCameraError(cameraUnsupportedMessage());
    }
  }, []);

  const onResults = useCallback((results: Results) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const settings = trackerSettingsRef.current;
    const swimmerProfile = swimmerProfileRef.current;
    const video = webcamRef.current?.video ?? undefined;
    const overlayMetrics = prepareOverlayCanvas(
      canvas,
      ctx,
      video,
      settings.mirrored
    );

    if (analysisPausedRef.current) {
      return;
    }

    const now = performance.now();
    const frameDelta = lastFrameTimestampRef.current
      ? now - lastFrameTimestampRef.current
      : 0;
    lastFrameTimestampRef.current = now;

    if (frameDelta > 0) {
      const liveFps = 1000 / frameDelta;
      fpsRef.current = fpsRef.current
        ? fpsRef.current * 0.86 + liveFps * 0.14
        : liveFps;
    }

    const maxPredictionFrames = predictionHoldFrames(settings.predictionMode);
    const rawLandmarks = results.poseLandmarks ?? null;
    const roughLandmarks = rawLandmarks
      ? cleanUnstableArmGeometry(
          enhanceSwimLandmarks(rawLandmarks),
          settings,
          swimmerProfile
        )
      : null;

    if (!roughLandmarks || !isUsablePoseFrame(roughLandmarks, settings, swimmerProfile)) {
      missingFramesRef.current += 1;
      const predictedLandmarks =
        maxPredictionFrames > 0
          ? predictLandmarksFromMemory(landmarkMemoryRef.current)
          : null;
      const predicted = predictedLandmarks
        ? enhanceSwimLandmarks(predictedLandmarks)
        : null;

      if (
        predicted &&
        lastAnalysisRef.current &&
        missingFramesRef.current <= maxPredictionFrames
      ) {
        const predictedAnalysis: FullAnalysis = {
          ...lastAnalysisRef.current,
          tracking: createTrackingStatus(
            predicted,
            settings,
            "predicting",
            missingFramesRef.current,
            fpsRef.current,
            swimmerProfile
          ),
        };

        lastAnalysisRef.current = predictedAnalysis;
        if (now - lastStateUpdateRef.current > UI_UPDATE_INTERVAL_MS) {
          setAnalysisState(predictedAnalysis);
          lastStateUpdateRef.current = now;
        }

        drawSkeleton(
          ctx,
          predicted,
          predictedAnalysis,
          overlayMetrics,
          settings
        );
        return;
      }

      ctx.clearRect(0, 0, overlayMetrics.width, overlayMetrics.height);
      if (missingFramesRef.current > maxPredictionFrames) {
        resetTrackingMemory();
      }
      return;
    }

    if (!rawLandmarks) return;
    missingFramesRef.current = 0;

    const smoothed = enhanceSwimLandmarks(
      stabilizeLandmarks(rawLandmarks, landmarkMemoryRef.current, settings)
    );
    const cleaned = cleanUnstableArmGeometry(smoothed, settings, swimmerProfile);
    syncEnhancedArmEndpointMemory(landmarkMemoryRef.current, cleaned);
    const armIdentity = resolveArmIdentityLandmarks(
      cleaned,
      armIdentityMemoryRef.current,
      swimmerProfile
    );
    const identified = cleanUnstableArmGeometry(
      armIdentity.landmarks,
      settings,
      swimmerProfile
    );

    if (armIdentity.swappedChanged) {
      motionHistoryRef.current = createMotionHistory();
      resetStrokeBelief(strokeBeliefRef.current);
      angleMemoryRef.current = createAngleMemory();
      styleAccumulatorRef.current = createStyleAccumulator();
      styleWindowStartedAtRef.current = now;
    }

    const singleArmMode = shouldUseSingleArmMode(identified, swimmerProfile);
    if (!singleArmMode) {
      activeArmMemoryRef.current = createActiveArmMemory();
    }

    const activeArm = singleArmMode
      ? resolveActiveArm(identified, activeArmMemoryRef.current, swimmerProfile)
      : null;
    const lm = activeArm ? suppressArm(identified, oppositeArm(activeArm)) : identified;

    const motion = updateMotionHistory(motionHistoryRef.current, lm);
    const shoulders = resolveCameraViewMetrics(
      getShoulderMetrics(lm, swimmerProfile),
      settings.viewMode
    );
    const sr = strokeRangeRef.current;
    updateStrokeRange(sr, lm);

    const evf = stabilizeEVFResult(
      checkEVF(lm, sr, shoulders, motion, swimmerProfile),
      angleMemoryRef.current,
      shoulders.view
    );
    const styleIntervalMs = styleCheckIntervalRef.current;

    if (styleWindowStartedAtRef.current === 0) {
      styleWindowStartedAtRef.current = now;
    }

    const rawStyle = classifyStroke(
      lm,
      shoulders,
      motion,
      motionHistoryRef.current,
      strokeBeliefRef.current,
      swimmerProfile
    );
    pushStyleSample(styleAccumulatorRef.current, rawStyle);

    const shouldCheckStyle =
      now - styleWindowStartedAtRef.current >= styleIntervalMs;
    let technique: TechniqueAnalysis;

    if (shouldCheckStyle) {
      const intervalStyle = summarizeStyleSamples(
        styleAccumulatorRef.current,
        rawStyle
      );
      const rawTechnique = createTechniqueAnalysisFromStyle(
        lm,
        evf,
        shoulders,
        intervalStyle,
        swimmerProfile
      );
      technique = withStrokeMemory(rawTechnique, strokeMemoryRef.current);
      lastStyleTechniqueRef.current = technique;
      lastStyleCheckRef.current = now;
      styleAccumulatorRef.current = createStyleAccumulator();
      styleWindowStartedAtRef.current = now;
    } else if (lastStyleTechniqueRef.current) {
      technique = refreshTechniqueFrame(
        lastStyleTechniqueRef.current,
        lm,
        evf,
        shoulders,
        swimmerProfile
      );
    } else {
      technique = createPendingTechnique(
        lm,
        evf,
        shoulders,
        rawStyle,
        swimmerProfile
      );
    }

    technique = applyStrokeFocus(technique, strokeFocusRef.current);

    const styleCheck = createStyleCheckStatus(
      now,
      styleIntervalMs,
      styleWindowStartedAtRef.current,
      lastStyleCheckRef.current,
      styleAccumulatorRef.current.samples
    );
    const analysis: FullAnalysis = {
      evf,
      technique,
      styleCheck,
      armIdentity: armIdentity.status,
      tracking: createTrackingStatus(
        lm,
        settings,
        "live",
        0,
        fpsRef.current,
        swimmerProfile
      ),
      trails: createMotionTrails(motionHistoryRef.current),
    };
    lastAnalysisRef.current = analysis;

    if (now - lastStateUpdateRef.current > UI_UPDATE_INTERVAL_MS) {
      setAnalysisState(analysis);
      lastStateUpdateRef.current = now;
    }

    drawSkeleton(ctx, lm, analysis, overlayMetrics, settings);
  }, [resetTrackingMemory]);

  useEffect(() => {
    if (!videoStreamReady) return;

    const videoEl = webcamRef.current?.video;
    if (!videoEl) return;

    let cancelled = false;
    let pose: PoseInstance | null = null;
    const strokeBelief = strokeBeliefRef.current;

    setCameraReady(false);
    setIsLoaded(false);

    (async () => {
      try {
        const mpPoseMod = await import("@mediapipe/pose");
        if (cancelled) return;

        const PoseConstructor = resolvePoseCtor(mpPoseMod);
        const poseInstance = new PoseConstructor({
          locateFile: (file: string) => appAssetUrl(`${POSE_ASSET_PATH}${file}`),
        });

        poseInstance.setOptions({
          modelComplexity: 1,
          smoothLandmarks: true,
          enableSegmentation: false,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.55,
        });

        poseInstance.onResults(onResults);
        pose = poseInstance;

        if (typeof poseInstance.initialize === "function") {
          await poseInstance.initialize();
        } else {
          await new Promise((resolve) => setTimeout(resolve, 120));
        }

        if (!cancelled) setIsLoaded(true);

        let lastVideoTime = -1;
        const processFrame = async () => {
          if (cancelled) return;
          if (videoEl && videoEl.readyState >= 2 && videoEl.currentTime !== lastVideoTime) {
            lastVideoTime = videoEl.currentTime;
            try {
              await poseInstance.send({ image: videoEl });
            } catch (error) {
              if (!cancelled) console.error("Pose frame send failed", error);
            }
          }
          if (!cancelled) requestAnimationFrame(processFrame);
        };
        processFrame();

        if (!cancelled) setCameraReady(true);
      } catch (error) {
        if (!cancelled) {
          console.error("Pose engine failed to initialize", error);
          setCameraError(
            error instanceof Error ? error.message : "Pose engine failed to initialize"
          );
          setCameraReady(false);
          setIsLoaded(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      setCameraReady(false);
      setIsLoaded(false);
      landmarkMemoryRef.current = createLandmarkTrackingMemory();
      motionHistoryRef.current = createMotionHistory();
      resetStrokeBelief(strokeBelief);
      angleMemoryRef.current = createAngleMemory();
      strokeMemoryRef.current = createStrokeMemory();
      styleAccumulatorRef.current = createStyleAccumulator();
      styleWindowStartedAtRef.current = 0;
      lastStyleCheckRef.current = 0;
      lastStyleTechniqueRef.current = null;
      armIdentityMemoryRef.current = createArmIdentityMemory();
      activeArmMemoryRef.current = createActiveArmMemory();
      strokeRangeRef.current = { minX: 1, maxX: 0, minY: 1, maxY: 0 };
      lastAnalysisRef.current = null;
      lastStateUpdateRef.current = 0;
      missingFramesRef.current = 0;
      try {
        pose?.close();
      } catch {
        /* ignore */
      }
      pose = null;
    };
  }, [onResults, videoStreamReady]);

  const selectedInterfaceStyle = getInterfaceStyleOption(interfaceStyle);
  const coachCue = getPrimaryCue(analysisState, strokeFocus);

  return (
    <div
      className={`glide-shell glide-theme flex min-h-[calc(100vh-9rem)] w-full flex-col gap-5 rounded-lg p-1 ${selectedInterfaceStyle.shellClass} xl:flex-row xl:items-start`}
      style={selectedInterfaceStyle.vars}
    >
      <div
        className={`relative min-h-[360px] w-full flex-1 overflow-hidden rounded-lg border bg-black shadow-2xl sm:min-h-[460px] xl:min-h-[calc(100vh-9rem)] ${selectedInterfaceStyle.videoClass}`}
      >
        {cameraApiSupported && (
          <Webcam
            key={cameraRetryKey}
            ref={webcamRef}
            mirrored={trackerSettings.mirrored}
            className="relative z-0 w-full h-full object-cover"
            videoConstraints={{
              width: { ideal: VIDEO_WIDTH },
              height: { ideal: VIDEO_HEIGHT },
              facingMode: { ideal: trackerSettings.cameraFacingMode },
            }}
            onUserMedia={() => {
              setCameraError(null);
              setVideoStreamReady(true);
            }}
            onUserMediaError={(error) => {
              setVideoStreamReady(false);
              setCameraError(cameraErrorMessage(error));
            }}
          />
        )}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none z-[100]"
          aria-hidden
        />
        <div className="pointer-events-none absolute left-4 top-4 z-[105] flex flex-wrap gap-2">
          <span className="rounded-md border border-zinc-700/80 bg-black/60 px-2.5 py-1 text-xs font-medium text-zinc-200 backdrop-blur-md">
            {cameraViewBadgeLabel(
              trackerSettings.viewMode,
              analysisState?.technique.shoulders.view ?? null
            )}
          </span>
          <span className="rounded-md border border-zinc-700/80 bg-black/60 px-2.5 py-1 text-xs font-medium text-zinc-200 backdrop-blur-md">
            Arms {analysisState?.armIdentity.locked ? "Locked" : "Learning"}
          </span>
          <span
            className={`rounded-md border px-2.5 py-1 text-xs font-medium backdrop-blur-md ${
              analysisState?.tracking.state === "predicting"
                ? "border-amber-500/70 bg-amber-950/70 text-amber-100"
                : "border-zinc-700/80 bg-black/60 text-zinc-200"
            }`}
          >
            {analysisState?.tracking.state === "predicting"
              ? `Predict ${analysisState.tracking.predictionFrames}/${analysisState.tracking.maxPredictionFrames}`
              : predictionModeLabel(trackerSettings.predictionMode)}
          </span>
          <span
            className={`rounded-md border px-2.5 py-1 text-xs font-medium backdrop-blur-md ${
              analysisState?.evf.left.isEVF || analysisState?.evf.right.isEVF
                ? "border-emerald-500/70 bg-emerald-950/60 text-emerald-100"
                : "border-zinc-700/80 bg-black/60 text-zinc-200"
            }`}
          >
            EVF {analysisState?.evf.left.isEVF || analysisState?.evf.right.isEVF ? "Active" : "Scan"}
          </span>
        </div>

        {trackerSettings.showCoachCues && !cameraError && (
          <div
            className={`pointer-events-none absolute bottom-4 left-4 right-4 z-[105] rounded-lg border px-4 py-3 text-sm font-semibold shadow-xl backdrop-blur-md ${selectedInterfaceStyle.cueClass}`}
          >
            {coachCue}
          </div>
        )}

        {analysisPaused && !cameraError && (
          <div className="pointer-events-none absolute inset-0 z-[108] flex items-center justify-center bg-black/35 backdrop-blur-[1px]">
            <div className="rounded-lg border border-zinc-700 bg-black/70 px-4 py-3 text-sm font-semibold text-zinc-100 shadow-xl">
              Analysis paused
            </div>
          </div>
        )}

        {cameraError ? (
          <div className="absolute inset-0 z-[110] flex items-center justify-center bg-zinc-950/90 backdrop-blur-sm">
            <div className="max-w-sm px-6 text-center">
              <CameraOff className="mx-auto mb-3 h-8 w-8 text-amber-300" />
              <p className="text-sm font-semibold text-zinc-100">
                Camera or pose engine unavailable
              </p>
              <p className="mt-2 text-xs leading-relaxed text-zinc-500">
                {cameraError}
              </p>
              <button
                type="button"
                onClick={retryCamera}
                className="mt-4 rounded-md border border-amber-500/60 bg-amber-950/50 px-3 py-2 text-xs font-semibold text-amber-100 transition hover:border-amber-300"
              >
                Retry camera
              </button>
            </div>
          </div>
        ) : (!isLoaded || !cameraReady) && (
          <div className="absolute inset-0 z-[110] flex items-center justify-center bg-zinc-950/85 backdrop-blur-sm">
            <div className="text-center px-4">
              <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-zinc-400">Initializing pose engine...</p>
            </div>
          </div>
        )}
      </div>

      <MetricsPanel
        analysis={analysisState}
        styleCheckIntervalMs={styleCheckIntervalMs}
        onStyleCheckIntervalChange={handleStyleCheckIntervalChange}
        trackerSettings={trackerSettings}
        onTrackerSettingsChange={handleTrackerSettingsChange}
        onResetTracking={resetTrackingMemory}
        analysisPaused={analysisPaused}
        onAnalysisPausedChange={handleAnalysisPausedChange}
        strokeFocus={strokeFocus}
        onStrokeFocusChange={handleStrokeFocusChange}
        swimmerProfile={swimmerProfile}
        onSwimmerProfileChange={handleSwimmerProfileChange}
        interfaceStyle={interfaceStyle}
        onInterfaceStyleChange={setInterfaceStyle}
      />
    </div>
  );
}
