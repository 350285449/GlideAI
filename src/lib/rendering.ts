import type { NormalizedLandmark } from "@mediapipe/pose";
import type { Point, VideoRect, OverlayMetrics, FullAnalysis, TrackerSettings } from "@/types/glide";
import { clamp } from "@/lib/biomechanics";
import { VIDEO_WIDTH, VIDEO_HEIGHT, NEON_GREEN, SHOULDER_LINE, DEFAULT_LIMB, DEFAULT_JOINT } from "@/lib/constants";
import { isDrawableConnection, isDrawableLandmark, landmarkVisibility, SWIM_CONNECTIONS, SWIM_LANDMARKS } from "@/lib/vision";

export function getCoverRect(
  containerWidth: number,
  containerHeight: number,
  mediaWidth: number,
  mediaHeight: number
): VideoRect {
  const mediaAspect = mediaWidth / Math.max(mediaHeight, 1);
  const containerAspect = containerWidth / Math.max(containerHeight, 1);

  if (containerAspect > mediaAspect) {
    const height = containerWidth / mediaAspect;
    return { x: 0, y: (containerHeight - height) / 2, width: containerWidth, height };
  }

  const width = containerHeight * mediaAspect;
  return { x: (containerWidth - width) / 2, y: 0, width, height: containerHeight };
}

export function prepareOverlayCanvas(
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
    videoRect: getCoverRect(width, height, video?.videoWidth || VIDEO_WIDTH, video?.videoHeight || VIDEO_HEIGHT),
  };
}

export function projectNormalizedPoint(point: Point, metrics: OverlayMetrics): Point {
  const { videoRect } = metrics;
  const x = metrics.mirrored ? 1 - point.x : point.x;
  return {
    x: videoRect.x + x * videoRect.width,
    y: videoRect.y + point.y * videoRect.height,
  };
}

export function projectLandmark(landmark: NormalizedLandmark, metrics: OverlayMetrics): Point {
  return projectNormalizedPoint(landmark, metrics);
}

export function drawTrail(
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

export function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  landmarks: NormalizedLandmark[],
  analysis: FullAnalysis,
  metrics: OverlayMetrics,
  settings: TrackerSettings
) {
  ctx.clearRect(0, 0, metrics.width, metrics.height);
  const { evf, technique } = analysis;
  const evfSegments = new Set<string>();
  const opacity = settings.overlayOpacity;

  if (settings.showTrails) {
    drawTrail(ctx, analysis.trails.left, metrics, "rgba(34, 211, 238, 0.95)", opacity);
    drawTrail(ctx, analysis.trails.right, metrics, "rgba(52, 211, 153, 0.95)", opacity);
  }

  if (evf.left.isEVF) { evfSegments.add("11-13"); evfSegments.add("13-15"); }
  if (evf.right.isEVF) { evfSegments.add("12-14"); evfSegments.add("14-16"); }

  if (settings.showSkeleton) {
    for (const [startIdx, endIdx] of SWIM_CONNECTIONS) {
      const start = landmarks[startIdx];
      const end = landmarks[endIdx];
      if (!start || !end || !isDrawableConnection(landmarks, startIdx, endIdx, settings.edgeGuard)) continue;

      const startPoint = projectLandmark(start, metrics);
      const endPoint = projectLandmark(end, metrics);
      const segKey = `${startIdx}-${endIdx}`;
      const isEVFSeg = evfSegments.has(segKey);
      const isShoulderSeg = segKey === "11-12" || segKey === "12-11";
      const segmentAlpha = clamp((Math.min(landmarkVisibility(start), landmarkVisibility(end)) + 0.2) * opacity, 0.18, opacity);

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
    const isEVFJoint = (evf.left.isEVF && (i === 11 || i === 13 || i === 15)) || (evf.right.isEVF && (i === 12 || i === 14 || i === 16));
    const isShoulderJoint = technique.shoulders.visible && (i === 11 || i === 12);
    const point = projectLandmark(lm, metrics);

    ctx.globalAlpha = clamp((landmarkVisibility(lm) + 0.2) * opacity, 0.25, opacity);
    ctx.beginPath();
    ctx.arc(point.x, point.y, isEVFJoint || isShoulderJoint ? 5 : 3, 0, 2 * Math.PI);
    ctx.fillStyle = isEVFJoint ? NEON_GREEN : isShoulderJoint ? SHOULDER_LINE : DEFAULT_JOINT;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}