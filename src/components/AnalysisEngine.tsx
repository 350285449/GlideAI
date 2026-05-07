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
  TrackingStatus, MotionTrails, TrackerSettings, OverlayMetrics,
  ArmSignal, LandmarkTrackingMemory, CatchAxis, StyleResult,
  PoseConstructorConfig, SwimmerProfile, PoseInstance
} from "@/types/glide";
import {
  DEFAULT_STYLE_CHECK_INTERVAL_MS, MIN_STYLE_CHECK_INTERVAL_MS,
  MAX_STYLE_CHECK_INTERVAL_MS, UI_UPDATE_INTERVAL_MS,
  VIDEO_WIDTH, VIDEO_HEIGHT, POSE_ASSET_PATH, DEFAULT_TRACKER_SETTINGS, 
  DEFAULT_SWIMMER_PROFILE, predictionHoldFrames,
} from "@/lib/constants";
import { cameraErrorMessage, cameraUnsupportedMessage, hasBrowserCameraApi, appAssetUrl } from "@/lib/camera";
import { prepareOverlayCanvas, drawSkeleton } from "@/lib/rendering";
import {
  createLandmarkTrackingMemory, createMotionHistory, createAngleMemory,
  createStrokeMemory, createStyleAccumulator, createArmIdentityMemory,
  createActiveArmMemory, predictLandmarksFromMemory, enhanceSwimLandmarks,
  stabilizeLandmarks, cleanUnstableArmGeometry, syncEnhancedArmEndpointMemory,
  resolveArmIdentityLandmarks, shouldUseSingleArmMode, resolveActiveArm,
  suppressArm, oppositeArm, updateMotionHistory, getShoulderMetrics,
  resolveCameraViewMetrics, updateStrokeRange, checkEVF, stabilizeEVFResult,
  classifyStroke, pushStyleSample, summarizeStyleSamples,
  createTechniqueAnalysisFromStyle, withStrokeMemory, refreshTechniqueFrame,
  createPendingTechnique, applyStrokeFocus, createStyleCheckStatus,
  createTrackingStatus, createMotionTrails, isUsablePoseFrame
} from "@/lib/vision";

export { cameraErrorMessage, cameraUnsupportedMessage, hasBrowserCameraApi };

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
