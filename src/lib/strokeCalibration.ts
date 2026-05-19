import type {
  ClassifiedStroke,
  StrokeCalibrationModel,
  StrokeFeatureVector,
} from "@/lib/strokeClassification";
import { STROKE_FEATURE_KEYS } from "@/lib/strokeClassification";

export interface LabeledStrokeSample {
  label: Exclude<ClassifiedStroke, "Unknown">;
  features: StrokeFeatureVector;
}

const LABEL_INDEX: Record<Exclude<ClassifiedStroke, "Unknown">, number> = {
  Freestyle: 0,
  Backstroke: 1,
  Butterfly: 2,
  Breaststroke: 3,
};

function softmax(logits: number[]): number[] {
  const m = Math.max(...logits);
  const ex = logits.map((v) => Math.exp(v - m));
  const s = ex.reduce((a, b) => a + b, 0);
  return ex.map((v) => v / s);
}

export function trainStrokeCalibrationModel(
  samples: LabeledStrokeSample[],
  options?: { epochs?: number; learningRate?: number; l2?: number }
): StrokeCalibrationModel {
  const epochs = options?.epochs ?? 350;
  const lr = options?.learningRate ?? 0.08;
  const l2 = options?.l2 ?? 0.0005;
  const keys = [...STROKE_FEATURE_KEYS];
  const featureCount = keys.length;

  const weights: [number[], number[], number[], number[]] = [
    Array.from({ length: featureCount }, () => 0),
    Array.from({ length: featureCount }, () => 0),
    Array.from({ length: featureCount }, () => 0),
    Array.from({ length: featureCount }, () => 0),
  ];
  const biases: [number, number, number, number] = [0, 0, 0, 0];
  const labelCounts: [number, number, number, number] = [0, 0, 0, 0];

  for (const sample of samples) {
    labelCounts[LABEL_INDEX[sample.label]] += 1;
  }

  if (samples.length === 0) {
    return { featureKeys: keys, weights, biases, labelCounts };
  }

  for (let epoch = 0; epoch < epochs; epoch++) {
    for (const sample of samples) {
      const x = keys.map((k) => sample.features[k] ?? 0);
      const logits = [0, 0, 0, 0];
      for (let c = 0; c < 4; c++) {
        let z = biases[c]!;
        for (let i = 0; i < featureCount; i++) {
          z += weights[c]![i]! * x[i]!;
        }
        logits[c] = z;
      }
      const probs = softmax(logits);
      const y = LABEL_INDEX[sample.label];

      for (let c = 0; c < 4; c++) {
        const err = probs[c]! - (c === y ? 1 : 0);
        biases[c] = biases[c]! - lr * err;
        for (let i = 0; i < featureCount; i++) {
          const grad = err * x[i]! + l2 * weights[c]![i]!;
          weights[c]![i] = weights[c]![i]! - lr * grad;
        }
      }
    }
  }

  return {
    featureKeys: keys,
    labelCounts,
    weights,
    biases,
  };
}
