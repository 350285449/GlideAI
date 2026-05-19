/**
 * Swim stroke classifier — temporal correlation, dual-axis fusion, velocity opposition,
 * elbow–wrist separation dynamics, and optional EMA belief smoothing.
 */

export type ClassifiedStroke =
  | "Freestyle"
  | "Backstroke"
  | "Butterfly"
  | "Breaststroke"
  | "Unknown";

const LM = {
  L_SH: 11,
  R_SH: 12,
  L_EL: 13,
  R_EL: 14,
  L_WR: 15,
  R_WR: 16,
  L_HIP: 23,
  R_HIP: 24,
  L_KNEE: 25,
  R_KNEE: 26,
  L_ANK: 27,
  R_ANK: 28,
} as const;

const PARTIAL_VIS = 0.08;
const MIN_ALIGNED = 18;
const TEMPERATURE = 0.88;
const MIN_CALIBRATION_CLASS_SAMPLES = 1;
const LONG_RANGE_SHOULDER_NORM = 0.028;
const BASE_SHOULDER_NORM = 0.08;

export interface Point2 {
  x: number;
  y: number;
}

export interface MotionTrackInput {
  points: Point2[];
}

export interface MotionHistoryInput {
  leftWrist: MotionTrackInput;
  rightWrist: MotionTrackInput;
  leftElbow: MotionTrackInput;
  rightElbow: MotionTrackInput;
}

export interface ArmMotionInput {
  samples: number;
  rangeX: number;
  rangeY: number;
}

export interface MotionSummaryInput {
  left: ArmMotionInput;
  right: ArmMotionInput;
}

export interface ShoulderInput {
  visible: boolean;
  view: string;
  width: number;
  centerX: number;
  centerY: number;
}

export interface LandmarkInput {
  x: number;
  y: number;
  visibility?: number;
}

export interface StrokeClassifierContext {
  landmarks: LandmarkInput[];
  shoulders: ShoulderInput;
  motion: MotionSummaryInput;
  motionHistory: MotionHistoryInput;
  primaryArm: "left" | "right" | null;
  bothArmsChainVisible: boolean;
  partialArmCount: number;
}

export const STROKE_FEATURE_KEYS = [
  "syncCue",
  "altDrive",
  "spread",
  "geoSymPair",
  "geoFlyRecovery",
  "geoBreastSweep",
  "kickAlternating",
  "kickSymmetric",
  "kneeFlexSync",
  "bodyRoll",
  "trunkHorizontal",
  "pairedOk",
  "hasSolidMotion",
  "bothBelowMid",
  "bothAboveMid",
  "backCue",
  "topView",
  "topSideView",
] as const;

export type StrokeFeatureKey = (typeof STROKE_FEATURE_KEYS)[number];
export type StrokeFeatureVector = Record<StrokeFeatureKey, number>;

export interface StrokeCalibrationModel {
  featureKeys: readonly StrokeFeatureKey[];
  labelCounts?: readonly [number, number, number, number];
  biases: [number, number, number, number];
  weights: [
    number[],
    number[],
    number[],
    number[],
  ];
}

let activeCalibrationModel: StrokeCalibrationModel | null = null;

export function setStrokeCalibrationModel(model: StrokeCalibrationModel | null): void {
  activeCalibrationModel = model;
}

/** Running softmax EMA — stabilizes labels across noisy frames. */
export interface StrokeBeliefState {
  ema: [number, number, number, number];
}

export function createStrokeBelief(): StrokeBeliefState {
  return { ema: [0.25, 0.25, 0.25, 0.25] };
}

export function resetStrokeBelief(state: StrokeBeliefState): void {
  state.ema = [0.25, 0.25, 0.25, 0.25];
}

function fuseBelief(
  state: StrokeBeliefState,
  instant: readonly [number, number, number, number],
  alpha = 0.14
): [number, number, number, number] {
  const next: [number, number, number, number] = [0, 0, 0, 0];
  for (let i = 0; i < 4; i++) {
    next[i] = state.ema[i]! * (1 - alpha) + instant[i]! * alpha;
  }
  const s = next[0]! + next[1]! + next[2]! + next[3]!;
  if (s < 1e-9) {
    return [...instant] as [number, number, number, number];
  }
  state.ema = [next[0]! / s, next[1]! / s, next[2]! / s, next[3]! / s];
  return state.ema;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function shoulderNorm(shoulders: ShoulderInput): number {
  return Math.max(shoulders.width, LONG_RANGE_SHOULDER_NORM);
}

function scaleByShoulder(value: number, shoulders: ShoulderInput, minFactor = 0.32): number {
  return value * clamp(shoulderNorm(shoulders) / BASE_SHOULDER_NORM, minFactor, 1);
}

function landmarkVisible(lm: LandmarkInput | undefined, t = PARTIAL_VIS): lm is LandmarkInput {
  return Boolean(lm && (lm.visibility === undefined || lm.visibility >= t));
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, v) => a + v, 0) / values.length;
}

function pearson(a: number[], b: number[]): number | null {
  if (a.length !== b.length || a.length < 8) return null;
  const ma = mean(a);
  const mb = mean(b);
  let cov = 0;
  let va = 0;
  let vb = 0;
  for (let i = 0; i < a.length; i++) {
    const da = a[i]! - ma;
    const db = b[i]! - mb;
    cov += da * db;
    va += da * da;
    vb += db * db;
  }
  const denom = Math.sqrt(va * vb);
  if (denom < 1e-10) return null;
  return cov / denom;
}

function diff(series: number[]): number[] {
  const d: number[] = [];
  for (let i = 1; i < series.length; i++) {
    d.push(series[i]! - series[i - 1]!);
  }
  return d;
}

function range(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.max(...values) - Math.min(...values);
}

function trackMotion(track: MotionTrackInput): ArmMotionInput {
  return {
    samples: track.points.length,
    rangeX: range(track.points.map((point) => point.x)),
    rangeY: range(track.points.map((point) => point.y)),
  };
}

function waterAwareArmMotion(
  wristMotion: ArmMotionInput,
  elbowTrack: MotionTrackInput
): ArmMotionInput {
  const elbowMotion = trackMotion(elbowTrack);
  const wristTravel = wristMotion.rangeX + wristMotion.rangeY;
  const elbowTravel = elbowMotion.rangeX + elbowMotion.rangeY;

  if (elbowMotion.samples < 8 || elbowTravel <= wristTravel * 0.45) {
    return wristMotion;
  }

  return {
    samples: Math.max(wristMotion.samples, elbowMotion.samples),
    rangeX: Math.max(wristMotion.rangeX, elbowMotion.rangeX * 0.92),
    rangeY: Math.max(wristMotion.rangeY, elbowMotion.rangeY * 0.92),
  };
}

function dominantAxis(motion: MotionSummaryInput): "x" | "y" {
  const lx = motion.left.rangeX + motion.right.rangeX;
  const ly = motion.left.rangeY + motion.right.rangeY;
  return lx >= ly * 0.92 ? "x" : "y";
}

function alignedAxisSeries(
  left: MotionTrackInput,
  right: MotionTrackInput,
  axis: "x" | "y"
): { a: number[]; b: number[] } | null {
  const n = Math.min(left.points.length, right.points.length);
  if (n < MIN_ALIGNED) return null;
  const lo = left.points.slice(-n);
  const ro = right.points.slice(-n);
  const axisKey = axis;
  const a = lo.map((p) => p[axisKey]);
  const b = ro.map((p) => p[axisKey]);
  return { a, b };
}

function trajectorySpreadEnergy(a: number[], b: number[], shoulderNorm: number): number {
  if (a.length !== b.length || a.length < MIN_ALIGNED || shoulderNorm < 1e-6) return 0.5;
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i]! - b[i]!;
    s += d * d;
  }
  const rms = Math.sqrt(s / a.length);
  return clamp(rms / (shoulderNorm * 0.72), 0, 2.8) / 2.8;
}

/** Weighted spread across X and Y using motion energy on each axis. */
function dualAxisSpread(
  left: MotionTrackInput,
  right: MotionTrackInput,
  shoulderNorm: number
): number {
  const px = alignedAxisSeries(left, right, "x");
  const py = alignedAxisSeries(left, right, "y");
  if (!px || !py) return 0.45;
  const sx = trajectorySpreadEnergy(px.a, px.b, shoulderNorm);
  const sy = trajectorySpreadEnergy(py.a, py.b, shoulderNorm);
  const vx = range(px.a) + range(px.b);
  const vy = range(py.a) + range(py.b);
  const ws = vx + vy + 1e-8;
  return sx * (vx / ws) + sy * (vy / ws);
}

/** Pearson fusion on X and Y with variance-derived weights. */
function dualAxisCorrelationBlend(left: MotionTrackInput, right: MotionTrackInput): {
  rhoPos: number | null;
  rhoVel: number | null;
  rhoBlend: number;
  wx: number;
  wy: number;
} {
  const px = alignedAxisSeries(left, right, "x");
  const py = alignedAxisSeries(left, right, "y");
  if (!px || !py) {
    return { rhoPos: null, rhoVel: null, rhoBlend: 0, wx: 0.5, wy: 0.5 };
  }

  const vx = range(px.a) + range(px.b);
  const vy = range(py.a) + range(py.b);
  const ws = vx + vy + 1e-8;
  const wx = vx / ws;
  const wy = vy / ws;

  const rpx = pearson(px.a, px.b);
  const rpy = pearson(py.a, py.b);
  let rhoPos: number | null = null;
  if (rpx !== null && rpy !== null) rhoPos = rpx * wx + rpy * wy;
  else rhoPos = rpx ?? rpy ?? null;

  const dax = diff(px.a);
  const dbx = diff(px.b);
  const day = diff(py.a);
  const dby = diff(py.b);
  let rhoVel: number | null = null;
  if (dax.length >= 7 && day.length >= 7) {
    const rvx = pearson(dax, dbx);
    const rvy = pearson(day, dby);
    if (rvx !== null && rvy !== null) rhoVel = rvx * wx + rvy * wy;
    else rhoVel = rvx ?? rvy ?? null;
  }

  let rhoBlend = 0;
  if (rhoPos !== null && rhoVel !== null) rhoBlend = rhoPos * 0.52 + rhoVel * 0.48;
  else rhoBlend = rhoPos ?? rhoVel ?? 0;

  return { rhoPos, rhoVel, rhoBlend, wx, wy };
}

function mirroredPairSync(
  left: MotionTrackInput,
  right: MotionTrackInput,
  shoulders: ShoulderInput
): number {
  const n = Math.min(left.points.length, right.points.length);
  if (n < MIN_ALIGNED) return 0.5;

  const lo = left.points.slice(-n);
  const ro = right.points.slice(-n);
  const lx = lo.map((point) => point.x - shoulders.centerX);
  const rx = ro.map((point) => shoulders.centerX - point.x);
  const ly = lo.map((point) => point.y);
  const ry = ro.map((point) => point.y);
  const xRange = range(lx) + range(rx);
  const yRange = range(ly) + range(ry);
  const weightSum = xRange + yRange + 1e-8;
  const xSync = pearson(lx, rx);
  const ySync = pearson(ly, ry);

  if (xSync === null && ySync === null) return 0.5;

  const blended =
    (xSync ?? ySync ?? 0) * (xRange / weightSum) +
    (ySync ?? xSync ?? 0) * (yRange / weightSum);

  return clamp((blended + 1) / 2, 0, 1);
}

/** Fraction of frames where wrist velocities oppose — high ⇒ alternating strokes. */
function velocityOppositionRate(a: number[], b: number[]): number {
  const da = diff(a);
  const db = diff(b);
  const n = Math.min(da.length, db.length);
  if (n < 10) return 0.5;
  let opp = 0;
  for (let i = 0; i < n; i++) {
    if (da[i]! * db[i]! < 0) opp++;
  }
  return opp / n;
}

/** Elbow pair separation fluctuation vs wrist separation — breast outsweep widens elbows more. */
function elbowWristSeparationDynamics(
  lw: MotionTrackInput,
  rw: MotionTrackInput,
  le: MotionTrackInput,
  re: MotionTrackInput
): { breastDynamics: number; elbowSyncRho: number } {
  const n = Math.min(lw.points.length, rw.points.length, le.points.length, re.points.length);
  if (n < MIN_ALIGNED) {
    return { breastDynamics: 0.45, elbowSyncRho: 0 };
  }

  const lo = le.points.slice(-n);
  const ro = re.points.slice(-n);
  const elbowDist = lo.map((p, i) => Math.hypot(p.x - ro[i]!.x, p.y - ro[i]!.y));
  const rel = lw.points.slice(-n);
  const rer = rw.points.slice(-n);
  const wristDist = rel.map((p, i) => Math.hypot(p.x - rer[i]!.x, p.y - rer[i]!.y));

  const rEl = range(elbowDist);
  const rWr = range(wristDist);
  const ratio = rEl / (rWr + 0.018);
  const breastDynamics = clamp((ratio - 0.65) / 1.35, 0, 1);

  const lrho = dualAxisCorrelationBlend(le, re);
  return { breastDynamics, elbowSyncRho: lrho.rhoBlend };
}

function wristsHigherThanElbows(
  lw: LandmarkInput,
  rw: LandmarkInput,
  le: LandmarkInput,
  re: LandmarkInput,
  margin = 0.006
): boolean {
  const wristY = (lw.y + rw.y) / 2;
  const elbowY = (le.y + re.y) / 2;
  return wristY + margin < elbowY;
}

function geometrySnapshot(
  lm: LandmarkInput[],
  shoulders: ShoulderInput
): {
  flyRecovery: number;
  breastSweep: number;
  symPair: number;
  bothBelowMid: boolean;
  bothAboveMid: boolean;
} {
  const lw = lm[LM.L_WR];
  const rw = lm[LM.R_WR];
  const le = lm[LM.L_EL];
  const re = lm[LM.R_EL];
  const shoulderWidth = shoulderNorm(shoulders);
  let flyRecovery = 0;
  let breastSweep = 0;
  let symPair = 0;
  let bothBelowMid = false;
  let bothAboveMid = false;

  if (
    landmarkVisible(lw) &&
    landmarkVisible(rw) &&
    landmarkVisible(le) &&
    landmarkVisible(re)
  ) {
    const wristDy = Math.abs(lw.y - rw.y);
    const elbowDy = Math.abs(le.y - re.y);
    const wristDx = Math.abs(lw.x - rw.x);
    const elbowDx = Math.abs(le.x - re.x);

    symPair = clamp(
      1 -
        (wristDy + elbowDy + wristDx * 0.35 + elbowDx * 0.35) /
          (shoulderWidth * 4.2),
      0,
      1
    );

    const la = lw.y < shoulders.centerY;
    const ra = rw.y < shoulders.centerY;
    bothAboveMid = la && ra;
    bothBelowMid = !la && !ra;

    const elbowHop = Math.hypot(le.x - re.x, le.y - re.y) / shoulderWidth;
    const flyHi = clamp((shoulders.centerY - Math.min(lw.y, rw.y)) / (shoulderWidth * 1.85), 0, 1);
    flyRecovery = clamp((symPair * 0.55 + flyHi * 0.45) * (bothAboveMid ? 1.15 : 0.82), 0, 1);
    breastSweep = clamp(symPair * 0.4 + clamp((elbowHop - 0.92) / 1.05, 0, 1) * 0.55, 0, 1);
    if (!bothBelowMid) breastSweep *= 0.72;
    if (!bothAboveMid) flyRecovery *= 0.88;
  } else if (landmarkVisible(le) && landmarkVisible(re)) {
    const elbowDy = Math.abs(le.y - re.y);
    const elbowDx = Math.abs(le.x - re.x);

    symPair = clamp(
      1 - (elbowDy + elbowDx * 0.32) / (shoulderWidth * 2.5),
      0,
      0.72
    );

    const la = le.y < shoulders.centerY;
    const ra = re.y < shoulders.centerY;
    bothAboveMid = la && ra;
    bothBelowMid = !la && !ra;

    const elbowSpread = elbowDx / shoulderWidth;
    const elbowHi = clamp(
      (shoulders.centerY - Math.min(le.y, re.y)) / (shoulderWidth * 1.65),
      0,
      1
    );

    flyRecovery = clamp(
      (symPair * 0.5 + elbowHi * 0.32) * (bothAboveMid ? 1 : 0.62),
      0,
      0.56
    );
    breastSweep = clamp(
      symPair * 0.34 + clamp((elbowSpread - 0.72) / 1.15, 0, 1) * 0.42,
      0,
      0.66
    );
    if (!bothBelowMid) breastSweep *= 0.68;
  }

  return { flyRecovery, breastSweep, symPair, bothBelowMid, bothAboveMid };
}

function lowerBodySnapshot(lm: LandmarkInput[], shoulders: ShoulderInput): {
  kickAlternating: number;
  kickSymmetric: number;
  kneeFlexSync: number;
  bodyRoll: number;
  trunkHorizontal: number;
} {
  const ls = lm[LM.L_SH];
  const rs = lm[LM.R_SH];
  const lh = lm[LM.L_HIP];
  const rh = lm[LM.R_HIP];
  const lk = lm[LM.L_KNEE];
  const rk = lm[LM.R_KNEE];
  const la = lm[LM.L_ANK];
  const ra = lm[LM.R_ANK];

  let kickAlternating = 0.5;
  let kickSymmetric = 0.5;
  let kneeFlexSync = 0.5;
  let bodyRoll = 0.4;
  let trunkHorizontal = 0.4;

  if (landmarkVisible(la) && landmarkVisible(ra)) {
    const ankleYDelta = Math.abs(la.y - ra.y);
    const ankleXDelta = Math.abs(la.x - ra.x);
    const scale = shoulderNorm(shoulders);
    kickAlternating = clamp((ankleYDelta / (scale * 1.8)) + (ankleXDelta / (scale * 3.8)), 0, 1);
    kickSymmetric = 1 - clamp((ankleYDelta / (scale * 2.2)) + (ankleXDelta / (scale * 4.4)), 0, 1);
  }

  if (landmarkVisible(lk) && landmarkVisible(rk) && landmarkVisible(la) && landmarkVisible(ra)) {
    const leftKneeToAnkle = Math.abs(lk.y - la.y);
    const rightKneeToAnkle = Math.abs(rk.y - ra.y);
    const diffFlex = Math.abs(leftKneeToAnkle - rightKneeToAnkle);
    const base = Math.max(leftKneeToAnkle + rightKneeToAnkle, LONG_RANGE_SHOULDER_NORM);
    kneeFlexSync = clamp(1 - diffFlex / base, 0, 1);
  }

  if (landmarkVisible(ls) && landmarkVisible(rs) && landmarkVisible(lh) && landmarkVisible(rh)) {
    const shoulderDy = Math.abs(ls.y - rs.y);
    const hipDy = Math.abs(lh.y - rh.y);
    const shoulderDx = Math.abs(ls.x - rs.x);
    const hipDx = Math.abs(lh.x - rh.x);
    const norm = Math.max(shoulderDx + hipDx, LONG_RANGE_SHOULDER_NORM);
    bodyRoll = clamp((shoulderDy + hipDy) / norm, 0, 1);

    const shCenterY = (ls.y + rs.y) / 2;
    const hipCenterY = (lh.y + rh.y) / 2;
    const shCenterX = (ls.x + rs.x) / 2;
    const hipCenterX = (lh.x + rh.x) / 2;
    const torsoDy = Math.abs(shCenterY - hipCenterY);
    const torsoDx = Math.abs(shCenterX - hipCenterX);
    trunkHorizontal = clamp(
      torsoDx / Math.max(torsoDy + torsoDx, LONG_RANGE_SHOULDER_NORM),
      0,
      1
    );
  }

  return { kickAlternating, kickSymmetric, kneeFlexSync, bodyRoll, trunkHorizontal };
}

function softmaxProbs(logits: number[]): number[] {
  const m = Math.max(...logits);
  const ex = logits.map((l) => Math.exp((l - m) / TEMPERATURE));
  const s = ex.reduce((a, b) => a + b, 0);
  return ex.map((e) => e / s);
}

function entropy(probs: readonly number[]): number {
  let h = 0;
  for (const p of probs) {
    if (p > 1e-9) h -= p * Math.log(p);
  }
  return h;
}

function featureSnapshot(input: {
  syncCue: number;
  altDrive: number;
  spread: number;
  geoSymPair: number;
  geoFlyRecovery: number;
  geoBreastSweep: number;
  kickAlternating: number;
  kickSymmetric: number;
  kneeFlexSync: number;
  bodyRoll: number;
  trunkHorizontal: number;
  pairedOk: boolean;
  hasSolidMotion: boolean;
  bothBelowMid: boolean;
  bothAboveMid: boolean;
  backCue: boolean;
  topView: boolean;
  topSideView: boolean;
}): StrokeFeatureVector {
  return {
    syncCue: input.syncCue,
    altDrive: input.altDrive,
    spread: input.spread,
    geoSymPair: input.geoSymPair,
    geoFlyRecovery: input.geoFlyRecovery,
    geoBreastSweep: input.geoBreastSweep,
    kickAlternating: input.kickAlternating,
    kickSymmetric: input.kickSymmetric,
    kneeFlexSync: input.kneeFlexSync,
    bodyRoll: input.bodyRoll,
    trunkHorizontal: input.trunkHorizontal,
    pairedOk: input.pairedOk ? 1 : 0,
    hasSolidMotion: input.hasSolidMotion ? 1 : 0,
    bothBelowMid: input.bothBelowMid ? 1 : 0,
    bothAboveMid: input.bothAboveMid ? 1 : 0,
    backCue: input.backCue ? 1 : 0,
    topView: input.topView ? 1 : 0,
    topSideView: input.topSideView ? 1 : 0,
  };
}

function applyCalibrationAdjustments(
  logits: [number, number, number, number],
  features: StrokeFeatureVector,
  model: StrokeCalibrationModel | null
): [number, number, number, number] {
  if (!model || !calibrationModelIsUsable(model)) return logits;
  const keys = model.featureKeys;
  const adjusted: [number, number, number, number] = [...logits] as [
    number,
    number,
    number,
    number,
  ];
  for (let cls = 0; cls < 4; cls++) {
    let delta = model.biases[cls] ?? 0;
    const w = model.weights[cls] ?? [];
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (!key) continue;
      delta += (w[i] ?? 0) * (features[key] ?? 0);
    }
    adjusted[cls] += delta;
  }
  return adjusted;
}

/** Calibration may only nudge the heuristic classifier when every stroke has examples. */
function calibrationModelIsUsable(model: StrokeCalibrationModel): boolean {
  const counts = model.labelCounts;
  if (!counts || counts.length !== 4) return false;
  if (model.biases.length !== 4 || model.weights.length !== 4) return false;
  if (model.featureKeys.length !== STROKE_FEATURE_KEYS.length) return false;
  if (!STROKE_FEATURE_KEYS.every((key, index) => model.featureKeys[index] === key)) {
    return false;
  }
  if (model.weights.some((weights) => weights.length !== model.featureKeys.length)) {
    return false;
  }

  return counts.every(
    (count) =>
      Number.isFinite(count) &&
      count >= MIN_CALIBRATION_CLASS_SAMPLES
  );
}

const IDX = { F: 0, B: 1, FI: 2, BR: 3 };

export function classifySwimStroke(
  ctx: StrokeClassifierContext,
  belief?: StrokeBeliefState | null,
  calibrationModel: StrokeCalibrationModel | null = activeCalibrationModel
): {
  stroke: ClassifiedStroke;
  confidence: number;
} {
  const { landmarks: lm, shoulders, motion, motionHistory, primaryArm, partialArmCount } = ctx;

  if (!shoulders.visible) {
    return { stroke: "Unknown", confidence: 0 };
  }

  const waterMotion: MotionSummaryInput = {
    left: waterAwareArmMotion(motion.left, motionHistory.leftElbow),
    right: waterAwareArmMotion(motion.right, motionHistory.rightElbow),
  };
  const leftTravel = waterMotion.left.rangeX + waterMotion.left.rangeY;
  const rightTravel = waterMotion.right.rangeX + waterMotion.right.rangeY;
  const bilateralTravel = leftTravel + rightTravel;
  const pairedHistoryX = alignedAxisSeries(
    motionHistory.leftWrist,
    motionHistory.rightWrist,
    "x"
  );
  const pairedHistoryY = alignedAxisSeries(
    motionHistory.leftWrist,
    motionHistory.rightWrist,
    "y"
  );
  const pairedElbowHistoryX = alignedAxisSeries(
    motionHistory.leftElbow,
    motionHistory.rightElbow,
    "x"
  );
  const pairedElbowHistoryY = alignedAxisSeries(
    motionHistory.leftElbow,
    motionHistory.rightElbow,
    "y"
  );
  const hasPairedWristHistory = Boolean(pairedHistoryX || pairedHistoryY);
  const hasPairedElbowHistory = Boolean(pairedElbowHistoryX || pairedElbowHistoryY);
  const hasPairedWaterHistory =
    (hasPairedWristHistory || hasPairedElbowHistory) &&
    (ctx.bothArmsChainVisible ||
      hasPairedElbowHistory ||
      partialArmCount > 0);

  if (!primaryArm && partialArmCount === 0) {
    return {
      stroke: "Unknown",
      confidence: shoulders.view === "top" || shoulders.view === "top-side" ? 0.26 : 0,
    };
  }

  const view = shoulders.view;

  if (view === "side" || (!ctx.bothArmsChainVisible && !hasPairedWaterHistory)) {
    const sideArm = primaryArm ?? "left";
    const pm = waterMotion[sideArm === "left" ? "left" : "right"];
    const samplesOk = pm.samples >= 10;
    const sideMotionThreshold = scaleByShoulder(0.052, shoulders, 0.26);
    const sideTravelThreshold = scaleByShoulder(0.1, shoulders, 0.28);
    const sideArmTravel = pm.rangeX + pm.rangeY;
    const strokeMotion =
      samplesOk &&
      (pm.rangeX > sideMotionThreshold || pm.rangeY > sideMotionThreshold);
    const hasSingleArmEvidence =
      partialArmCount > 0 &&
      sideArmTravel > sideTravelThreshold * 0.46;
    const hasPairedArmEvidence =
      partialArmCount >= 2 &&
      bilateralTravel > sideTravelThreshold;
    const lowEvidence =
      !strokeMotion ||
      (!hasSingleArmEvidence && !hasPairedArmEvidence);
    if (lowEvidence) {
      return {
        stroke: "Unknown",
        confidence: samplesOk ? 0.4 : 0.3,
      };
    }

    const lower = lowerBodySnapshot(lm, shoulders);
    const sideIndices =
      sideArm === "left"
        ? { elbow: LM.L_EL, wrist: LM.L_WR }
        : { elbow: LM.R_EL, wrist: LM.R_WR };
    const sideWrist = lm[sideIndices.wrist];
    const sideElbow = lm[sideIndices.elbow];
    const sideBackCue =
      view === "side" &&
      landmarkVisible(sideWrist) &&
      landmarkVisible(sideElbow) &&
      sideWrist.y > shoulders.centerY &&
      sideWrist.y + 0.006 < sideElbow.y &&
      lower.kickAlternating >= lower.kickSymmetric - 0.05;
    const longAxisSingleArm =
      samplesOk &&
      partialArmCount > 0 &&
      pm.rangeX > sideMotionThreshold * 1.2 &&
      pm.rangeY > sideMotionThreshold * 0.82 &&
      lower.kickAlternating >= lower.kickSymmetric - 0.08;
    const symmetricKickCue =
      lower.kickSymmetric > 0.72 &&
      lower.kneeFlexSync > 0.68 &&
      bilateralTravel > sideTravelThreshold * 0.92;

    if (longAxisSingleArm) {
      return {
        stroke: sideBackCue ? "Backstroke" : "Freestyle",
        confidence: view === "side" ? 0.54 : 0.58,
      };
    }

    if (symmetricKickCue && (view === "top-side" || view === "side")) {
      return {
        stroke: "Breaststroke",
        confidence: view === "side" ? 0.52 : 0.55,
      };
    }

    return {
      stroke: "Unknown",
      confidence: 0.42,
    };
  }

  const axis = dominantAxis(waterMotion);
  let paired =
    axis === "x"
      ? pairedHistoryX
      : pairedHistoryY;
  if (!paired) {
    paired = axis === "x" ? pairedHistoryY : pairedHistoryX;
  }
  const wristPairSelected = paired !== null;
  if (!paired) {
    paired = axis === "x" ? pairedElbowHistoryX : pairedElbowHistoryY;
  }
  if (!paired) {
    paired = axis === "x" ? pairedElbowHistoryY : pairedElbowHistoryX;
  }

  const useElbowPair = !wristPairSelected && paired !== null;
  const pairLeftTrack = useElbowPair
    ? motionHistory.leftElbow
    : motionHistory.leftWrist;
  const pairRightTrack = useElbowPair
    ? motionHistory.rightElbow
    : motionHistory.rightWrist;

  const corr = dualAxisCorrelationBlend(pairLeftTrack, pairRightTrack);
  let rhoBlend = corr.rhoBlend;

  const dyn = elbowWristSeparationDynamics(
    motionHistory.leftWrist,
    motionHistory.rightWrist,
    motionHistory.leftElbow,
    motionHistory.rightElbow
  );

  let opposition = 0.5;
  const px = alignedAxisSeries(pairLeftTrack, pairRightTrack, "x");
  const py = alignedAxisSeries(pairLeftTrack, pairRightTrack, "y");
  if (px && py) {
    const ox = velocityOppositionRate(px.a, px.b);
    const oy = velocityOppositionRate(py.a, py.b);
    opposition = ox * corr.wx + oy * corr.wy;
  }

  const geo = geometrySnapshot(lm, shoulders);
  const mirroredSync = mirroredPairSync(pairLeftTrack, pairRightTrack, shoulders);
  const symmetricViewCue =
    (view === "top" || view === "top-side" || view === "front") &&
    geo.symPair > 0.52 &&
    mirroredSync > 0.62;
  let altDrive = clamp((opposition - 0.42) / 0.38, 0, 1);
  if (symmetricViewCue) {
    altDrive *= 1 - clamp((mirroredSync - 0.62) / 0.33, 0, 1) * 0.62;
  }
  /** Pull rho toward alternating when wrists oppose often — fixes noisy Pearson at cycle boundaries. */
  rhoBlend = rhoBlend * (1 - altDrive * 0.38) - altDrive * 0.22;

  const rawSyncCue = clamp((rhoBlend + 1) / 2, 0, 1);
  const syncCue = symmetricViewCue
    ? Math.max(rawSyncCue, mirroredSync * 0.82)
    : rawSyncCue;
  const spread = dualAxisSpread(
    pairLeftTrack,
    pairRightTrack,
    shoulderNorm(shoulders)
  );

  const lower = lowerBodySnapshot(lm, shoulders);

  const hasSolidMotion =
    waterMotion.left.samples >= 12 &&
    waterMotion.right.samples >= 12 &&
    leftTravel > scaleByShoulder(0.032, shoulders, 0.3) &&
    rightTravel > scaleByShoulder(0.032, shoulders, 0.3) &&
    bilateralTravel > scaleByShoulder(0.085, shoulders, 0.3);

  const pairedOk = paired !== null;

  if (!hasSolidMotion && !pairedOk) {
    return { stroke: "Unknown", confidence: 0.36 };
  }

  const topBonus =
    view === "top-side" &&
    geo.bothAboveMid &&
    geo.symPair > 0.52 &&
    pairedOk &&
    syncCue > 0.53
      ? 0.48
      : 0;

  const topBreastBonus =
    view === "top-side" &&
    geo.bothBelowMid &&
    geo.symPair > 0.5 &&
    pairedOk &&
    syncCue > 0.5
      ? 0.52
      : 0;

  const backCue =
    !geo.bothAboveMid &&
    geo.bothBelowMid &&
    spread > 0.38 &&
    syncCue < 0.48 &&
    altDrive > 0.38 &&
    ctx.bothArmsChainVisible &&
    landmarkVisible(lm[LM.L_WR]) &&
    landmarkVisible(lm[LM.R_WR]) &&
    landmarkVisible(lm[LM.L_EL]) &&
    landmarkVisible(lm[LM.R_EL]) &&
    wristsHigherThanElbows(lm[LM.L_WR]!, lm[LM.R_WR]!, lm[LM.L_EL]!, lm[LM.R_EL]!);

  /**
   * Hierarchical tree inspired by YOLOv7-Swim-Pose-Recognition:
   * 1) long-axis (free/back) vs short-axis (fly/breast)
   * 2) subtype classification inside selected axis.
   */
  let axisLongScore =
    altDrive * 2.15 +
    (1 - syncCue) * 2.1 +
    spread * 1.25 -
    geo.symPair * 0.85 +
    lower.kickAlternating * 1.1 -
    lower.kickSymmetric * 0.55;
  let axisShortScore =
    syncCue * 2.25 +
    geo.symPair * 1.55 +
    geo.flyRecovery * 0.72 +
    geo.breastSweep * 0.72 -
    altDrive * 1.95 +
    lower.kickSymmetric * 1.05 -
    lower.kickAlternating * 0.6;

  if (!pairedOk) {
    axisLongScore += 0.65;
    axisShortScore -= 0.75;
  }
  if (!hasSolidMotion) {
    axisLongScore -= 0.65;
    axisShortScore -= 0.65;
  }
  if (view === "top") {
    axisShortScore -= 0.35; // overhead is often ambiguous for short-axis split
  }

  const axisProbs = softmaxProbs([axisLongScore, axisShortScore]);
  const pLong = axisProbs[0]!;
  const pShort = axisProbs[1]!;

  const freeScore =
    altDrive * 2.35 +
    (1 - syncCue) * 1.85 +
    spread * 1.25 +
    (geo.bothBelowMid ? -0.05 : 0.2) +
    lower.kickAlternating * 0.95 -
    lower.kneeFlexSync * 0.35;
  let backScore =
    (backCue ? 2.8 : -0.2) +
    altDrive * 1.25 +
    (1 - syncCue) * 1.35 +
    (geo.bothBelowMid ? 0.75 : -0.1) +
    lower.kickAlternating * 0.55 +
    lower.bodyRoll * 0.65;

  let flyScore =
    geo.flyRecovery * 2.55 +
    syncCue * 1.85 +
    topBonus +
    dyn.elbowSyncRho * 0.35 -
    dyn.breastDynamics * 0.95 -
    altDrive * 1.8 +
    lower.kickSymmetric * 0.8 +
    lower.kneeFlexSync * 0.45;
  let breastScore =
    geo.breastSweep * 2.25 +
    dyn.breastDynamics * 1.95 +
    syncCue * 1.65 +
    topBreastBonus +
    dyn.elbowSyncRho * 0.42 -
    geo.flyRecovery * 0.95 -
    altDrive * 1.65 +
    lower.kickSymmetric * 1.05 +
    lower.kneeFlexSync * 0.9 -
    lower.trunkHorizontal * 0.5;

  if (!pairedOk) {
    flyScore -= 1.0;
    breastScore -= 0.95;
    backScore -= 0.35;
  }
  if (view === "top") {
    flyScore -= geo.bothAboveMid ? 0.08 : 0.38;
    breastScore -= geo.bothBelowMid ? 0.08 : 0.35;
  }

  const longProbs = softmaxProbs([freeScore, backScore]);
  const shortProbs = softmaxProbs([flyScore, breastScore]);

  const instant: [number, number, number, number] = [
    pLong * longProbs[0]!,
    pLong * longProbs[1]!,
    pShort * shortProbs[0]!,
    pShort * shortProbs[1]!,
  ];
  const features = featureSnapshot({
    syncCue,
    altDrive,
    spread,
    geoSymPair: geo.symPair,
    geoFlyRecovery: geo.flyRecovery,
    geoBreastSweep: geo.breastSweep,
    kickAlternating: lower.kickAlternating,
    kickSymmetric: lower.kickSymmetric,
    kneeFlexSync: lower.kneeFlexSync,
    bodyRoll: lower.bodyRoll,
    trunkHorizontal: lower.trunkHorizontal,
    pairedOk,
    hasSolidMotion,
    bothBelowMid: geo.bothBelowMid,
    bothAboveMid: geo.bothAboveMid,
    backCue,
    topView: view === "top",
    topSideView: view === "top-side",
  });
  const instantLogits = instant.map((p) =>
    Math.log(clamp(p, 1e-5, 1))
  ) as [number, number, number, number];
  const calibrated = applyCalibrationAdjustments(instantLogits, features, calibrationModel);
  const calibratedProbs = softmaxProbs(calibrated);
  const probs: readonly number[] = belief
    ? fuseBelief(belief, calibratedProbs as [number, number, number, number])
    : calibratedProbs;

  const names: ClassifiedStroke[] = ["Freestyle", "Backstroke", "Butterfly", "Breaststroke"];
  const order = probs
    .map((p, i) => ({ p, i }))
    .sort((u, v) => v.p - u.p);

  const best = order[0]!;
  const second = order[1]!;
  const probabilityGap = best.p - second.p;
  const occludedWaterRead = !ctx.bothArmsChainVisible && hasPairedWaterHistory;
  const elbowOnlyWaterRead = occludedWaterRead && useElbowPair;

  let confidence = clamp((best.p - second.p) / Math.max(best.p, 0.075), 0.34, 0.93);

  const hNorm = entropy(probs) / Math.log(4);
  if (hNorm > 0.92) confidence *= 0.74;
  if (best.p < 0.23) confidence *= 0.66;
  if (!pairedOk && (best.i === IDX.FI || best.i === IDX.BR)) {
    confidence = Math.min(confidence, 0.68);
  }
  if (!hasSolidMotion) {
    confidence = Math.min(confidence, 0.58);
  }
  if (probabilityGap < 0.075) {
    confidence *= 0.72;
  }
  if (occludedWaterRead) {
    confidence *= 0.9;
  }
  if (elbowOnlyWaterRead) {
    confidence *= 0.92;
  }

  if (
    (confidence < (occludedWaterRead ? 0.42 : 0.5) &&
      hNorm > (occludedWaterRead ? 0.86 : 0.78)) ||
    best.p < (occludedWaterRead ? 0.23 : 0.28) ||
    probabilityGap < (occludedWaterRead ? 0.03 : 0.045)
  ) {
    return { stroke: "Unknown", confidence: clamp(best.p + 0.12, 0.28, 0.52) };
  }

  return { stroke: names[best.i] ?? "Unknown", confidence };
}
