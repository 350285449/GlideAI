import fs from "node:fs/promises";
import path from "node:path";

const FEATURE_KEYS = [
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
];

const LABEL_INDEX = {
  Freestyle: 0,
  Backstroke: 1,
  Butterfly: 2,
  Breaststroke: 3,
};
const LABELS = Object.keys(LABEL_INDEX);

function softmax(logits) {
  const m = Math.max(...logits);
  const ex = logits.map((v) => Math.exp(v - m));
  const s = ex.reduce((a, b) => a + b, 0);
  return ex.map((v) => v / s);
}

function train(samples, { epochs = 450, learningRate = 0.08, l2 = 0.0005 } = {}) {
  const featureCount = FEATURE_KEYS.length;
  const weights = Array.from({ length: 4 }, () => Array.from({ length: featureCount }, () => 0));
  const biases = [0, 0, 0, 0];
  const labelCounts = [0, 0, 0, 0];

  for (const sample of samples) {
    const y = LABEL_INDEX[sample.label];
    if (y !== undefined) labelCounts[y] += 1;
  }

  for (let epoch = 0; epoch < epochs; epoch++) {
    for (const sample of samples) {
      const y = LABEL_INDEX[sample.label];
      if (y === undefined) continue;
      const x = FEATURE_KEYS.map((k) => Number(sample.features?.[k] ?? 0));

      const logits = [0, 0, 0, 0];
      for (let c = 0; c < 4; c++) {
        let z = biases[c];
        for (let i = 0; i < featureCount; i++) z += weights[c][i] * x[i];
        logits[c] = z;
      }
      const probs = softmax(logits);

      for (let c = 0; c < 4; c++) {
        const err = probs[c] - (c === y ? 1 : 0);
        biases[c] -= learningRate * err;
        for (let i = 0; i < featureCount; i++) {
          const grad = err * x[i] + l2 * weights[c][i];
          weights[c][i] -= learningRate * grad;
        }
      }
    }
  }

  return { featureKeys: FEATURE_KEYS, labelCounts, weights, biases };
}

async function main() {
  const input = process.argv[2] ?? "data/stroke-samples.json";
  const output = process.argv[3] ?? "src/data/strokeCalibrationModel.json";
  const raw = await fs.readFile(path.resolve(input), "utf8");
  const samples = JSON.parse(raw);
  if (!Array.isArray(samples) || samples.length === 0) {
    throw new Error("Samples JSON must be a non-empty array.");
  }
  const model = train(samples);
  const missingLabels = LABELS.filter((label) => model.labelCounts[LABEL_INDEX[label]] === 0);
  if (missingLabels.length > 0) {
    console.warn(
      `Warning: calibration is missing ${missingLabels.join(", ")} samples; runtime will ignore this under-covered model.`
    );
  }
  await fs.mkdir(path.dirname(path.resolve(output)), { recursive: true });
  await fs.writeFile(path.resolve(output), `${JSON.stringify(model, null, 2)}\n`, "utf8");
  console.log(`Saved calibration model to ${output}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
