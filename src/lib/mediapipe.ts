import type { PoseConstructorConfig, PoseInstance } from "@/types/glide";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function resolvePoseCtor(mp: any): new (config: PoseConstructorConfig) => PoseInstance {
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