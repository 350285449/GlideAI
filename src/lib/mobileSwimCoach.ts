export type ManualCoachTone = "good" | "warning" | "critical";
export type ManualStroke = "Freestyle" | "Backstroke" | "Butterfly" | "Breaststroke";

export interface ManualPhase {
  id: "beginner" | "intermediate" | "advanced";
  label: string;
  levels: string;
  objective: string;
  rubric: Array<{
    skill: string;
    weight: number;
    cue: string;
  }>;
}

export interface FlawCorrection {
  problem: string;
  drill: string;
  logic: string;
  tags: string[];
}

export interface DrillSpec {
  name: string;
  description: string;
  purpose: string;
}

export type ScoreLevel = 0 | 1 | 2 | 3 | 4 | 5;

export interface ScoreCriterion {
  score: ScoreLevel;
  label: string;
  description: string;
}

export interface ManualScoreEstimate extends ScoreCriterion {
  level: ScoreLevel;
  levelPercent: number;
  rawScore: number;
  display: string;
}

interface StrokeKnowledgeBase {
  identifier: string;
  stroke: ManualStroke;
  displayName: string;
  phases: ManualPhase[];
  flawCorrections: FlawCorrection[];
  drills: DrillSpec[];
  scoring: ScoreCriterion[];
}

export interface ManualCoachComment {
  id: string;
  tone: ManualCoachTone;
  title: string;
  comment: string;
  evidence?: string;
  immediateCue?: string;
  drill?: string;
  source: string;
}

export interface ManualCoachSet {
  title: string;
  reps: string;
  instruction: string;
  successMetric: string;
}

export interface RubricRating {
  skill: string;
  weight: number;
  score: ScoreLevel;
  level: ScoreLevel;
  levelPercent: number;
  rawScore: number;
  cue: string;
  reason: string;
}

export interface ManualCoachResult {
  model: "glide-phone-manual-agent-v1";
  agentMode: "phone-local-keyword-rag";
  stroke: ManualStroke;
  strokeLabel: string;
  phase: ManualPhase;
  estimatedScore: ManualScoreEstimate;
  confidence: number;
  liveCue: string;
  primaryFocus: string;
  inferredCause: string;
  nextSet: ManualCoachSet;
  rubric: RubricRating[];
  comments: ManualCoachComment[];
  sources: ManualAgentSource[];
  voiceLine: string;
}

export interface ManualCoachInput {
  stroke: string;
  strokeFocus: string;
  confidence: number;
  lockState: string;
  trackingQuality: number;
  edgeLandmarks: number;
  completeArmChain: boolean;
  anyEvf: boolean;
  catchPhaseActive: boolean;
  bestEvfConfidence: number;
  shoulderView: string;
  shoulderSlopeDegrees: number;
  feedbackIds: string[];
}

export interface ManualAgentSource {
  id: string;
  source: string;
  title: string;
  score: number;
  excerpt: string;
}

const SCORING: ScoreCriterion[] = [
  {
    score: 0,
    label: "Unreadable",
    description: "Insufficient reliable stroke evidence; fix camera, light, or body position first.",
  },
  {
    score: 1,
    label: "Needs Work",
    description: "Inconsistent technique, significant drag, frequent stalling.",
  },
  {
    score: 2,
    label: "Mediocre",
    description: "Form is recognizable, but timing, body line, or propulsion still breaks under normal effort.",
  },
  {
    score: 3,
    label: "Proficient",
    description: "Smooth movement, maintains form under mild fatigue.",
  },
  {
    score: 4,
    label: "Advanced",
    description: "High efficiency, powerful propulsion, precise timing.",
  },
  {
    score: 5,
    label: "Elite",
    description: "Competitive standard, optimized biomechanical efficiency.",
  },
];

const FRONT_CRAWL: StrokeKnowledgeBase = {
  identifier: "STROKE_ANALYSIS_CURRICULUM_V1:FREESTYLE",
  stroke: "Freestyle",
  displayName: "Front crawl",
  phases: [
    {
      id: "beginner",
      label: "Beginner",
      levels: "Ultra 1-3",
      objective: "Master horizontal buoyancy and basic propulsive rhythm.",
      rubric: [
        { skill: "Body Position", weight: 30, cue: "Horizontal, face in water, streamlined." },
        { skill: "Kicking", weight: 30, cue: "Flutter kick from the hip with slight knee bend." },
        { skill: "Arm Action", weight: 20, cue: "Controlled alternating recovery above surface." },
        { skill: "Breathing", weight: 20, cue: "Side breathing with underwater exhalation." },
      ],
    },
    {
      id: "intermediate",
      label: "Intermediate",
      levels: "Ultra 4-6",
      objective: "Refine recovery mechanics and bilateral breathing timing.",
      rubric: [
        { skill: "Arm Entry", weight: 25, cue: "Hand entry beyond shoulder line." },
        { skill: "Recovery", weight: 25, cue: "High-elbow, bent-arm recovery clear of surface." },
        { skill: "Timing", weight: 25, cue: "Continuous movement with no dead spots." },
        { skill: "Breathing", weight: 25, cue: "Regular bilateral pattern." },
      ],
    },
    {
      id: "advanced",
      label: "Advanced",
      levels: "Ultra 7-9",
      objective: "Maximize S-drive efficiency and propulsive power.",
      rubric: [
        { skill: "Underwater Drive", weight: 30, cue: "S-pull path finishing at thigh." },
        { skill: "Body Roll", weight: 30, cue: "Hip-initiated rotation for drive and breath." },
        { skill: "Catch Strength", weight: 20, cue: "High-elbow catch and powerful push phase." },
        { skill: "Breathing Precision", weight: 20, cue: "Exhalation finishes at surface clearance." },
      ],
    },
  ],
  flawCorrections: [
    {
      problem: "Sinking legs or vertical profile",
      drill: "Prayer Swim / Shark Fin",
      logic: "Forces kick intensity and buoyancy awareness to maintain lift.",
      tags: ["body-line", "camera", "kick"],
    },
    {
      problem: "Lifting head to breathe",
      drill: "Side Glide Kick",
      logic: "Teaches head-on-arm position and rotation instead of vertical lifting.",
      tags: ["breathing", "rotation"],
    },
    {
      problem: "Rigid shoulders or no rotation",
      drill: "Smiley Faces / The Alternator",
      logic: "Makes shoulder roll visible and links shoulder-hip balance.",
      tags: ["rotation"],
    },
    {
      problem: "Straight-arm or windmill recovery",
      drill: "Finger Drag / 6-Kick Zipper",
      logic: "Constrains the recovery into high-elbow, bent-arm mechanics.",
      tags: ["recovery"],
    },
    {
      problem: "Choppy or short strokes",
      drill: "Catch-Up Drill",
      logic: "Builds stroke length and removes dead spots in the cycle.",
      tags: ["timing"],
    },
    {
      problem: "Weak pull or slipping water",
      drill: "Fist Drill / Paddle Hands",
      logic: "Increases awareness of the forearm surface used to hold water.",
      tags: ["catch", "elbow"],
    },
    {
      problem: "Linear or straight underwater pull",
      drill: "S-Pull / Under Body Pull",
      logic: "Teaches the curved pull path and leverage for propulsion.",
      tags: ["centerline", "underwater-drive"],
    },
  ],
  drills: [
    { name: "Streamline Kick", description: "Extended layout with arms beyond head.", purpose: "Core-driven flutter kick stability." },
    { name: "Side Glide Kick", description: "Leading arm forward, trailing arm on leg, face to side.", purpose: "Head position and breathing alignment." },
    { name: "10 Kick", description: "10 kicks side glide, switch through front glide, repeat.", purpose: "Transition control and rotational stability." },
    { name: "Finger Drag", description: "Thumbs drag along body, fingertips along surface during recovery.", purpose: "High-elbow recovery mechanics." },
    { name: "Catch-Up Drill", description: "Lead arm waits until recovering arm catches up.", purpose: "Stroke length and pull completion." },
    { name: "Fist Drill", description: "Closed fists then open hands.", purpose: "Feel forearm surface area." },
    { name: "S-Pull", description: "Curved underwater path under body.", purpose: "Bent-arm pull leverage." },
  ],
  scoring: SCORING,
};

const BACKSTROKE: StrokeKnowledgeBase = {
  identifier: "STROKE_ANALYSIS_CURRICULUM_V1:BACKSTROKE",
  stroke: "Backstroke",
  displayName: "Backstroke",
  phases: [
    {
      id: "beginner",
      label: "Beginner",
      levels: "Ultra 1-3",
      objective: "Establish body extension, steady head, and relaxed surface kick.",
      rubric: [
        { skill: "Body Extension", weight: 30, cue: "Long body with steady head position." },
        { skill: "Kick", weight: 30, cue: "Continuous relaxed kick from the hip." },
        { skill: "Arm Recovery", weight: 20, cue: "Controlled recovery above shoulder line." },
        { skill: "Knee Extension", weight: 20, cue: "Flatter knee extension and surface kick." },
      ],
    },
    {
      id: "intermediate",
      label: "Intermediate",
      levels: "Ultra 4-6",
      objective: "Develop shoulder-driven entry and underwater S-shape propulsion.",
      rubric: [
        { skill: "Hand Entry", weight: 30, cue: "Entry beyond shoulder." },
        { skill: "Arm Recovery", weight: 25, cue: "Controlled alternating recovery." },
        { skill: "Underwater Drive", weight: 25, cue: "S-shape drive past hips." },
        { skill: "Breathing", weight: 20, cue: "Normal relaxed breathing pattern." },
      ],
    },
    {
      id: "advanced",
      label: "Advanced",
      levels: "Ultra 7-9",
      objective: "Coordinate 11-and-1 entry, body roll timing, and continuous core kick.",
      rubric: [
        { skill: "Entry Angle", weight: 30, cue: "11 and 1 o'clock hand entry." },
        { skill: "Roll Timing", weight: 30, cue: "Body roll coordinates with recovery." },
        { skill: "Bent Arm Drive", weight: 20, cue: "Sustained underwater bent-arm S-drive." },
        { skill: "Core Kick", weight: 20, cue: "Stable continuous kick." },
      ],
    },
  ],
  flawCorrections: [
    {
      problem: "Knee break or kicking from the knees",
      drill: "Streamline Kick",
      logic: "Forces a straighter flutter kick from the hip with relaxed ankles.",
      tags: ["kick", "body-line"],
    },
    {
      problem: "Flat body position and lack of shoulder rotation",
      drill: "Smiley Faces / Rollover Drill",
      logic: "Promotes shoulder roll on the longitudinal axis while the head stays still.",
      tags: ["rotation"],
    },
    {
      problem: "Incorrect vertical recovery position",
      drill: "Rollover Drill",
      logic: "Builds rotational balance before adding arm pull complexity.",
      tags: ["recovery"],
    },
    {
      problem: "Lack of underwater propulsion and poor arm catch",
      drill: "1-Arm Backstroke",
      logic: "Isolates catch, extension, and S-shape pull past the hips.",
      tags: ["catch", "underwater-drive"],
    },
    {
      problem: "Rushing recovery or crossing midline",
      drill: "Rotational Drill",
      logic: "Checks recovery at 90 degrees and aligns entry from the shoulder.",
      tags: ["centerline", "timing"],
    },
    {
      problem: "Poor continuous roll timing",
      drill: "6-Kick Switch",
      logic: "Breaks down body roll and gives time to stabilize before pull.",
      tags: ["timing", "rotation"],
    },
  ],
  drills: [
    { name: "Streamline Kick", description: "Back layout, arms extended, steady head.", purpose: "Streamlined backstroke kick." },
    { name: "Smiley Faces", description: "Rotate shoulders enough to see the shoulder cue.", purpose: "Shoulder roll awareness." },
    { name: "Rollover Drill", description: "Legs-only back crawl rolling side to side.", purpose: "Rotational balance." },
    { name: "1-Arm Backstroke", description: "One arm strokes while the other stays extended.", purpose: "Isolate entry, catch, and drive." },
    { name: "Shoulder Sweep", description: "Recovery sweeps cheek or ear.", purpose: "Shoulder mobility and length." },
    { name: "Sail Boat", description: "Freeze recovery arm for at least 3 seconds.", purpose: "Arm and core strength." },
    { name: "6-Kick Switch", description: "Six kicks on side, then switch.", purpose: "Continuous kick and smooth roll." },
  ],
  scoring: SCORING,
};

const BREASTSTROKE: StrokeKnowledgeBase = {
  identifier: "STROKE_ANALYSIS_CURRICULUM_V1:BREASTSTROKE",
  stroke: "Breaststroke",
  displayName: "Breaststroke",
  phases: [
    {
      id: "beginner",
      label: "Beginner",
      levels: "Ultra 1-3",
      objective: "Build horizontal body position, basic whip kick, and breathing rhythm.",
      rubric: [
        { skill: "Body Position", weight: 35, cue: "Horizontal body and steady head." },
        { skill: "Leg Action", weight: 30, cue: "Heels lift, knees bend, kick finishes together." },
        { skill: "Arm Action", weight: 20, cue: "Basic extension and pull toward chest." },
        { skill: "Breathing", weight: 15, cue: "Coordinated exhalation and regular breath." },
      ],
    },
    {
      id: "intermediate",
      label: "Intermediate",
      levels: "Ultra 4-6",
      objective: "Coordinate whip kick, underwater arm recovery, and pull-breathe-glide sequence.",
      rubric: [
        { skill: "Body Position", weight: 30, cue: "Horizontal body with steady head." },
        { skill: "Whip Kick", weight: 30, cue: "Feet wider than knees with simultaneous action." },
        { skill: "Arm Recovery", weight: 20, cue: "Elbows remain below surface." },
        { skill: "Sequence", weight: 20, cue: "Pull, breathe, kick, glide." },
      ],
    },
    {
      id: "advanced",
      label: "Advanced",
      levels: "Ultra 7-9",
      objective: "Refine pull-breathe-kick-stretch precision and efficient glide.",
      rubric: [
        { skill: "Advanced Body Position", weight: 25, cue: "Look forward only during breath phase." },
        { skill: "Symmetric Kick", weight: 30, cue: "Simultaneous whip kick, feet wider than knees." },
        { skill: "Arm Drive", weight: 25, cue: "Elbows higher than hands through drive." },
        { skill: "Sequence Precision", weight: 20, cue: "Pull-breathe-kick-stretch and glide." },
      ],
    },
  ],
  flawCorrections: [
    {
      problem: "Sinking hips and incorrect body alignment",
      drill: "Super Glides",
      logic: "Forces full streamline extension and hips to the surface.",
      tags: ["body-line", "breathing"],
    },
    {
      problem: "Narrow or incomplete kick action",
      drill: "Heel Clickers",
      logic: "Encourages the legs to finish together for an efficient whip kick.",
      tags: ["kick"],
    },
    {
      problem: "Incorrect hand placement or pulling too wide",
      drill: "Diamond / Valentine Drill",
      logic: "Reinforces hands drawing to chest and chin before extension.",
      tags: ["centerline", "recovery"],
    },
    {
      problem: "Asymmetrical or incomplete leg action",
      drill: "2 Kicks - 1 Pull",
      logic: "Isolates the whip kick while maintaining streamline balance.",
      tags: ["kick", "timing"],
    },
    {
      problem: "Dropping elbows during recovery",
      drill: "Diamond / Valentine Drill",
      logic: "Keeps elbows aligned with shoulders and under the surface.",
      tags: ["elbow", "recovery"],
    },
    {
      problem: "Incorrect breathing and pull sequence",
      drill: "2 Kicks - 1 Pull",
      logic: "Balances pull-breathe-kick sequence with body position.",
      tags: ["breathing", "timing"],
    },
  ],
  drills: [
    { name: "Super Glides", description: "Hold full Superman extension until legs finish.", purpose: "Full body extension and glide." },
    { name: "Heel Clickers", description: "Kick legs together until heels touch.", purpose: "Complete whip kick finish." },
    { name: "Diamond / Valentine Drill", description: "Trace diamond or heart path with hands.", purpose: "Correct palm turn and arm path." },
    { name: "2 Kicks - 1 Pull", description: "One breaststroke plus one extra whip kick.", purpose: "Kick strength and sequence timing." },
  ],
  scoring: SCORING,
};

const BUTTERFLY: StrokeKnowledgeBase = {
  identifier: "STROKE_ANALYSIS_CURRICULUM_V1:BUTTERFLY",
  stroke: "Butterfly",
  displayName: "Butterfly",
  phases: [
    {
      id: "beginner",
      label: "Beginner",
      levels: "Ultra 1-3",
      objective: "Build body dolphin, balanced recovery, and a low breath.",
      rubric: [
        { skill: "Body Line", weight: 30, cue: "Long body with chest press and hips following." },
        { skill: "Dolphin Kick", weight: 30, cue: "Kick from the core with relaxed ankles." },
        { skill: "Arm Recovery", weight: 20, cue: "Both arms recover together over the surface." },
        { skill: "Breathing", weight: 20, cue: "Breathe low and return eyes down quickly." },
      ],
    },
    {
      id: "intermediate",
      label: "Intermediate",
      levels: "Ultra 4-6",
      objective: "Coordinate catch, breath, and two-kick rhythm without pausing.",
      rubric: [
        { skill: "Catch Timing", weight: 30, cue: "Hands anchor before the breath lifts." },
        { skill: "Two-Kick Rhythm", weight: 25, cue: "One kick on entry, one kick through the press." },
        { skill: "Recovery", weight: 25, cue: "Wide relaxed recovery with soft elbows." },
        { skill: "Timing", weight: 20, cue: "No dead spot between entry and catch." },
      ],
    },
    {
      id: "advanced",
      label: "Advanced",
      levels: "Ultra 7-9",
      objective: "Hold a powerful early catch with continuous undulation at speed.",
      rubric: [
        { skill: "High Catch", weight: 30, cue: "Forearms tip down before the press." },
        { skill: "Core Timing", weight: 30, cue: "Chest press, hips rise, kick finishes the pull." },
        { skill: "Symmetry", weight: 20, cue: "Both arms recover and enter together." },
        { skill: "Breathing Precision", weight: 20, cue: "Breath stays low without breaking rhythm." },
      ],
    },
  ],
  flawCorrections: [
    {
      problem: "Flat body line or sinking hips",
      drill: "Body Dolphin / Chest Press",
      logic: "Teaches the wave from chest to hips before adding arm load.",
      tags: ["body-line", "kick"],
    },
    {
      problem: "Weak catch or slipping press",
      drill: "Single-Arm Butterfly",
      logic: "Isolates early catch pressure while the other arm stays forward.",
      tags: ["catch", "elbow", "underwater-drive"],
    },
    {
      problem: "Arms recovering unevenly",
      drill: "3-3-3 Butterfly",
      logic: "Alternates single-arm and full-stroke fly to rebuild symmetry.",
      tags: ["rotation", "recovery", "timing"],
    },
    {
      problem: "Late breath or lifted head",
      drill: "No-Breath Butterfly / Low Breath",
      logic: "Keeps the head low so the body wave continues forward.",
      tags: ["breathing", "body-line"],
    },
    {
      problem: "Broken two-kick rhythm",
      drill: "Dolphin Kick + One Pull",
      logic: "Links entry kick and press kick before full-stroke speed.",
      tags: ["timing", "kick"],
    },
  ],
  drills: [
    { name: "Body Dolphin", description: "Arms extended, chest presses down, hips follow.", purpose: "Build undulation rhythm." },
    { name: "Chest Press", description: "Small dolphin motion led by sternum pressure.", purpose: "Keep fly forward instead of vertical." },
    { name: "Single-Arm Butterfly", description: "One arm pulls while the other stays forward.", purpose: "Catch pressure and breath timing." },
    { name: "3-3-3 Butterfly", description: "Three right-arm, three left-arm, three full strokes.", purpose: "Symmetry and rhythm transfer." },
    { name: "Dolphin Kick + One Pull", description: "Several dolphin kicks into one controlled fly pull.", purpose: "Two-kick timing." },
  ],
  scoring: SCORING,
};

const KNOWLEDGE_BASES: Record<ManualStroke, StrokeKnowledgeBase> = {
  Freestyle: FRONT_CRAWL,
  Backstroke: BACKSTROKE,
  Butterfly: BUTTERFLY,
  Breaststroke: BREASTSTROKE,
};

type ManualAgentChunkKind = "phase" | "correction" | "drill" | "score";

interface ManualAgentChunk {
  id: string;
  source: string;
  stroke: ManualStroke;
  kind: ManualAgentChunkKind;
  title: string;
  text: string;
  tags: string[];
  correction?: FlawCorrection;
}

interface PhoneAgentContext {
  query: string;
  tags: string[];
  chunks: ManualAgentChunk[];
  sources: ManualAgentSource[];
}

function buildManualAgentChunks(kb: StrokeKnowledgeBase): ManualAgentChunk[] {
  const chunks: ManualAgentChunk[] = [];

  for (const phase of kb.phases) {
    chunks.push({
      id: `${kb.stroke.toLowerCase()}-${phase.id}`,
      source: `${kb.identifier}:${phase.id.toUpperCase()}`,
      stroke: kb.stroke,
      kind: "phase",
      title: `${kb.displayName} ${phase.label}`,
      text: [
        phase.objective,
        phase.levels,
        ...phase.rubric.map((item) => `${item.skill}: ${item.cue}`),
      ].join(" "),
      tags: phase.rubric.map((item) => item.skill.toLowerCase()),
    });
  }

  kb.flawCorrections.forEach((correction, index) => {
    chunks.push({
      id: `${kb.stroke.toLowerCase()}-correction-${index + 1}`,
      source: `${kb.identifier}:CORRECTION-${index + 1}`,
      stroke: kb.stroke,
      kind: "correction",
      title: correction.problem,
      text: `${correction.problem}. Drill: ${correction.drill}. Logic: ${correction.logic}. Tags: ${correction.tags.join(" ")}.`,
      tags: correction.tags,
      correction,
    });
  });

  kb.drills.forEach((drill, index) => {
    chunks.push({
      id: `${kb.stroke.toLowerCase()}-drill-${index + 1}`,
      source: `${kb.identifier}:DRILL-${index + 1}`,
      stroke: kb.stroke,
      kind: "drill",
      title: drill.name,
      text: `${drill.name}. ${drill.description} Purpose: ${drill.purpose}.`,
      tags: [drill.name.toLowerCase(), drill.purpose.toLowerCase()],
    });
  });

  kb.scoring.forEach((score) => {
    chunks.push({
      id: `${kb.stroke.toLowerCase()}-score-${score.score}`,
      source: `${kb.identifier}:SCORE-${score.score}`,
      stroke: kb.stroke,
      kind: "score",
      title: `Level ${score.score} ${score.label}`,
      text: `${score.label}. ${score.description}`,
      tags: [score.label.toLowerCase(), "score", String(score.score)],
    });
  });

  return chunks;
}

const PHONE_AGENT_CHUNKS: Record<ManualStroke, ManualAgentChunk[]> = {
  Freestyle: buildManualAgentChunks(FRONT_CRAWL),
  Backstroke: buildManualAgentChunks(BACKSTROKE),
  Butterfly: buildManualAgentChunks(BUTTERFLY),
  Breaststroke: buildManualAgentChunks(BREASTSTROKE),
};

function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+/g)?.filter((word) => word.length > 2) ?? [];
}

function keywordScore(query: string, text: string): number {
  const queryTerms = tokenize(query);
  if (queryTerms.length === 0) return 0;

  const frequencies = new Map<string, number>();
  const textTerms = tokenize(text);
  for (const term of textTerms) {
    frequencies.set(term, (frequencies.get(term) ?? 0) + 1);
  }

  let score = 0;
  for (const term of queryTerms) {
    score += Math.log(1 + (frequencies.get(term) ?? 0));
  }

  return score / Math.sqrt(Math.max(1, textTerms.length));
}

function buildPhoneAgentTags(input: ManualCoachInput, kb: StrokeKnowledgeBase): string[] {
  const tags = new Set<string>([kb.stroke.toLowerCase(), "score"]);

  if (input.trackingQuality < 0.45 || input.edgeLandmarks >= 2) {
    tags.add("body-line");
    tags.add("camera");
  }
  if (input.catchPhaseActive && !input.anyEvf) {
    tags.add("catch");
    tags.add("elbow");
  }
  if (hasFeedback(input, "left-dropped-elbow") || hasFeedback(input, "right-dropped-elbow")) {
    tags.add("elbow");
    tags.add("catch");
  }
  if (
    hasFeedback(input, "shoulder-tilt") ||
    input.shoulderSlopeDegrees > 18 ||
    input.shoulderView === "side"
  ) {
    tags.add(kb.stroke === "Breaststroke" ? "body-line" : "rotation");
  }
  if (hasFeedback(input, "left-cross") || hasFeedback(input, "right-cross")) {
    tags.add("centerline");
    tags.add("recovery");
  }
  if (input.lockState === "acquiring" || input.confidence < 0.52) {
    tags.add("timing");
  }
  if (input.anyEvf) {
    tags.add("catch");
    tags.add("underwater-drive");
  }

  return [...tags];
}

function buildPhoneAgentQuery(input: ManualCoachInput, kb: StrokeKnowledgeBase, tags: string[]): string {
  return [
    kb.displayName,
    input.stroke,
    input.strokeFocus,
    input.lockState,
    input.shoulderView,
    ...tags,
    ...input.feedbackIds,
    input.anyEvf ? "strong catch evf" : "needs technique correction",
    input.catchPhaseActive ? "catch phase active" : "setup phase",
  ].join(" ");
}

function retrievePhoneAgentChunks(
  input: ManualCoachInput,
  kb: StrokeKnowledgeBase
): PhoneAgentContext {
  const tags = buildPhoneAgentTags(input, kb);
  const query = buildPhoneAgentQuery(input, kb, tags);
  const chunks = PHONE_AGENT_CHUNKS[kb.stroke]
    .map((chunk) => {
      const tagBoost =
        chunk.tags.filter((tag) =>
          tags.some((inputTag) => tag.includes(inputTag) || inputTag.includes(tag))
        ).length * 0.18;
      const correctionBoost = chunk.kind === "correction" ? 0.16 : 0;
      return {
        chunk,
        score: keywordScore(query, chunk.text) + tagBoost + correctionBoost,
      };
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, 5);

  return {
    query,
    tags,
    chunks: chunks.map((item) => item.chunk),
    sources: chunks.map((item) => ({
      id: item.chunk.id,
      source: item.chunk.source,
      title: item.chunk.title,
      score: Math.round(item.score * 100),
      excerpt: item.chunk.text.length > 132
        ? `${item.chunk.text.slice(0, 129).trim()}...`
        : item.chunk.text,
    })),
  };
}

function correctionFromAgent(
  kb: StrokeKnowledgeBase,
  context: PhoneAgentContext,
  tag: string
): FlawCorrection {
  return (
    context.chunks.find(
      (chunk) => chunk.correction && chunk.tags.some((item) => item === tag || item.includes(tag))
    )?.correction ?? findCorrection(kb, tag)
  );
}

function strokeFromLabel(value: string): ManualStroke | null {
  if (value === "Freestyle" || value === "Front Crawl") return "Freestyle";
  if (value === "Backstroke" || value === "Backcrawl") return "Backstroke";
  if (value === "Butterfly") return "Butterfly";
  if (value === "Breaststroke") return "Breaststroke";
  return null;
}

function selectKnowledgeBase(input: ManualCoachInput): StrokeKnowledgeBase {
  const focusStroke = input.strokeFocus === "Auto" ? null : strokeFromLabel(input.strokeFocus);
  const detectedStroke = strokeFromLabel(input.stroke);
  return KNOWLEDGE_BASES[focusStroke ?? detectedStroke ?? "Freestyle"];
}

function findCorrection(kb: StrokeKnowledgeBase, tag: string): FlawCorrection {
  return kb.flawCorrections.find((item) => item.tags.includes(tag)) ?? kb.flawCorrections[0];
}

function findScore(kb: StrokeKnowledgeBase, score: ScoreLevel): ScoreCriterion {
  return kb.scoring.find((item) => item.score === score) ?? kb.scoring[0] ?? SCORING[0]!;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function roundScore(value: number): number {
  return Math.round(value * 100) / 100;
}

function scoreProgress(rawScore: number): {
  level: ScoreLevel;
  levelPercent: number;
  rawScore: number;
} {
  const bounded = clampNumber(rawScore, 0, 5);
  if (bounded >= 5) {
    return { level: 5, levelPercent: 100, rawScore: 5 };
  }

  const level = Math.floor(bounded) as ScoreLevel;
  return {
    level,
    levelPercent: Math.round((bounded - level) * 100),
    rawScore: roundScore(bounded),
  };
}

function scoreEstimate(kb: StrokeKnowledgeBase, rawScore: number): ManualScoreEstimate {
  const progress = scoreProgress(rawScore);
  const criterion = findScore(kb, progress.level);

  return {
    ...criterion,
    score: progress.level,
    level: progress.level,
    levelPercent: progress.levelPercent,
    rawScore: progress.rawScore,
    display: `Level ${progress.level} - ${progress.levelPercent}%`,
  };
}

function estimatePhase(input: ManualCoachInput, kb: StrokeKnowledgeBase): ManualPhase {
  const [beginner, intermediate, advanced] = kb.phases;

  if (
    input.trackingQuality < 0.55 ||
    input.confidence < 0.48 ||
    !input.completeArmChain
  ) {
    return beginner;
  }

  if (
    input.trackingQuality >= 0.72 &&
    input.confidence >= 0.62 &&
    input.lockState === "locked" &&
    (input.anyEvf || kb.stroke !== "Freestyle")
  ) {
    return advanced;
  }

  return intermediate;
}

function numericStyleScore(input: ManualCoachInput): number {
  return clampNumber(
    0.35 +
      input.trackingQuality * 1.2 +
      input.confidence * 1.05 +
      (input.completeArmChain ? 0.75 : -0.25) +
      (input.anyEvf ? 0.7 : 0) +
      input.bestEvfConfidence * 0.55 +
      (input.lockState === "locked" ? 0.55 : 0) +
      (input.lockState === "holding" ? -0.12 : 0) +
      (input.lockState === "switching" ? -0.28 : 0) +
      (input.lockState === "acquiring" ? -0.5 : 0) +
      (input.catchPhaseActive && !input.anyEvf ? -0.5 : 0) +
      (input.edgeLandmarks > 1 ? -0.55 : input.edgeLandmarks > 0 ? -0.24 : 0),
    0,
    5
  );
}

function styleReadReliability(input: ManualCoachInput): number {
  return Math.max(
    0,
    Math.min(
      1,
      input.trackingQuality * 0.44 +
        input.confidence * 0.24 +
        (input.completeArmChain ? 0.16 : 0) +
        (input.lockState === "locked" ? 0.14 : 0) +
        (input.lockState === "holding" ? 0.06 : 0) -
        (input.lockState === "acquiring" ? 0.12 : 0) -
        (input.lockState === "switching" ? 0.08 : 0) -
        input.edgeLandmarks * 0.08
    )
  );
}

function weightedRubricRawScore(rubric: RubricRating[]): number {
  const totalWeight = rubric.reduce((total, item) => total + item.weight, 0);
  if (totalWeight <= 0) return 0;

  return rubric.reduce(
    (total, item) => total + item.rawScore * item.weight,
    0
  ) / totalWeight;
}

function reliabilityScoreCap(reliability: number): number {
  if (reliability < 0.28) return 0.95;
  if (reliability < 0.45) return 1.95;
  if (reliability < 0.6) return 2.95;
  if (reliability < 0.72) return 3.95;
  return 5;
}

function estimateScore(
  input: ManualCoachInput,
  kb: StrokeKnowledgeBase,
  rubric: RubricRating[]
): ManualScoreEstimate {
  const reliability = styleReadReliability(input);
  const rubricScore = weightedRubricRawScore(rubric);
  const evidenceScore = numericStyleScore(input);
  const rawScore = clampNumber(
    rubricScore * 0.76 + evidenceScore * 0.24,
    0,
    reliabilityScoreCap(reliability)
  );

  return scoreEstimate(kb, rawScore);
}

function hasFeedback(input: ManualCoachInput, id: string): boolean {
  return input.feedbackIds.includes(id);
}

function coachConfidence(input: ManualCoachInput, kb: StrokeKnowledgeBase): number {
  const strokeAligned =
    kb.stroke === strokeFromLabel(input.stroke) || kb.stroke === strokeFromLabel(input.strokeFocus);
  const reliability = styleReadReliability(input);
  const confidence =
    input.trackingQuality * 48 +
    input.confidence * 24 +
    (input.completeArmChain ? 12 : 0) +
    reliability * 12 +
    (strokeAligned ? 8 : 0) -
    (input.edgeLandmarks >= 2 ? 12 : 0);

  return Math.max(22, Math.min(96, Math.round(confidence)));
}

function rateRubricSkill(
  input: ManualCoachInput,
  skill: string,
  kb: StrokeKnowledgeBase
): Pick<RubricRating, "score" | "level" | "levelPercent" | "rawScore" | "reason"> {
  const lower = skill.toLowerCase();
  let value = numericStyleScore(input);
  let reason = "General style evidence from pose quality, stroke lock, and arm-chain visibility.";

  if (lower.includes("kick") || lower.includes("leg") || lower.includes("knee")) {
    value =
      0.25 +
      input.trackingQuality * 2.45 +
      input.confidence * 0.55 +
      (input.lockState === "locked" ? 0.65 : 0) +
      (kb.stroke === "Breaststroke" ? 0.35 : 0.15) -
      (input.edgeLandmarks > 0 ? 0.45 : 0);
    reason =
      "Kick is inferred from body stability and stroke type because lower-body landmarks are often partially submerged.";
  } else if (lower.includes("body") || lower.includes("extension")) {
    value =
      0.2 +
      input.trackingQuality * 3.3 +
      input.confidence * 0.45 +
      (input.edgeLandmarks === 0 ? 0.8 : -0.8) +
      (input.lockState === "locked" ? 0.25 : 0);
    reason =
      input.edgeLandmarks > 0
        ? "Body line is hard to trust because landmarks are near the frame edge."
        : "Body line is readable and centered enough for scoring.";
  } else if (
    lower.includes("catch") ||
    lower.includes("drive") ||
    lower.includes("strength") ||
    lower.includes("arm") ||
    lower.includes("recovery")
  ) {
    value =
      0.25 +
      input.confidence * 1.1 +
      (input.completeArmChain ? 1.2 : 0) +
      (input.anyEvf ? 1.3 : 0) +
      input.bestEvfConfidence * 0.85 +
      (input.lockState === "locked" ? 0.55 : 0) +
      (input.catchPhaseActive && !input.anyEvf ? -0.55 : 0);
    reason = input.anyEvf
      ? "Arm chain and EVF/catch evidence support a stronger arm-drive rating."
      : "Arm rating is limited because catch pressure or full arm chain is not consistent.";
  } else if (lower.includes("entry") || lower.includes("path") || lower.includes("angle")) {
    value =
      0.25 +
      input.trackingQuality * 0.95 +
      input.confidence * 1.25 +
      (input.completeArmChain ? 1 : 0) +
      (hasFeedback(input, "left-cross") || hasFeedback(input, "right-cross") ? -0.55 : 0.95) +
      (input.lockState === "locked" ? 0.45 : 0);
    reason = "Entry/path rating combines arm-chain visibility, style lock, and centerline feedback.";
  } else if (lower.includes("roll") || lower.includes("rotation")) {
    value =
      0.25 +
      input.trackingQuality * 1.65 +
      input.confidence * 0.7 +
      (input.shoulderSlopeDegrees > 8 && input.shoulderSlopeDegrees < 32 ? 1.25 : 0.35) +
      (input.shoulderView === "side" || input.shoulderView === "top-side" ? 0.6 : 0) +
      (input.lockState === "locked" ? 0.4 : 0);
    reason = "Rotation is inferred from shoulder view and shoulder-line behavior.";
  } else if (lower.includes("breath")) {
    value =
      0.25 +
      input.trackingQuality * 1.75 +
      input.confidence * 0.75 +
      (hasFeedback(input, "shoulder-tilt") ? -0.55 : 0.65) +
      (input.edgeLandmarks === 0 ? 0.45 : 0) +
      (input.lockState === "locked" ? 0.45 : 0);
    reason = "Breathing is inferred from head/shoulder stability and whether body line stays readable.";
  } else if (lower.includes("timing") || lower.includes("sequence")) {
    value =
      0.25 +
      input.confidence * 2.2 +
      input.trackingQuality * 0.85 +
      (input.lockState === "locked" ? 1.05 : 0) +
      (input.lockState === "acquiring" ? -0.35 : 0);
    reason = "Timing is inferred from style lock stability and repeated stroke evidence.";
  }

  const progress = scoreProgress(value);

  return {
    score: progress.level,
    level: progress.level,
    levelPercent: progress.levelPercent,
    rawScore: progress.rawScore,
    reason,
  };
}

function buildRubric(input: ManualCoachInput, phase: ManualPhase, kb: StrokeKnowledgeBase): RubricRating[] {
  return phase.rubric.map((item) => ({
    ...item,
    ...rateRubricSkill(input, item.skill, kb),
  }));
}

function commentFromCorrection(
  id: string,
  tone: ManualCoachTone,
  correction: FlawCorrection,
  comment: string,
  evidence: string,
  immediateCue: string,
  source: string
): ManualCoachComment {
  return {
    id,
    tone,
    title: correction.problem,
    comment,
    evidence,
    immediateCue,
    drill: correction.drill,
    source,
  };
}

function firstActionableComment(comments: ManualCoachComment[]): ManualCoachComment {
  return (
    comments.find((comment) => comment.tone === "critical") ??
    comments.find((comment) => comment.tone === "warning") ??
    comments[0]
  );
}

function inferPrimaryFocus(comment: ManualCoachComment, phase: ManualPhase): string {
  if (comment.id.includes("catch") || comment.id.includes("elbow")) return "Catch / Arm Drive";
  if (comment.id.includes("rotation")) return "Body Roll";
  if (comment.id.includes("centerline")) return "Entry Path";
  if (comment.id.includes("timing") || comment.id.includes("sequence")) return "Timing";
  if (comment.id.includes("kick")) return "Kick Mechanics";
  if (comment.id.includes("camera")) return "Readable Body Line";
  return phase.rubric[0].skill;
}

function inferCause(
  input: ManualCoachInput,
  kb: StrokeKnowledgeBase,
  phase: ManualPhase,
  comment: ManualCoachComment
): string {
  if (input.trackingQuality < 0.45) {
    return "The phone read is too weak to separate technique from camera placement. Fix the view first.";
  }
  if (comment.id.includes("catch") || comment.id.includes("elbow")) {
    return kb.stroke === "Breaststroke"
      ? "The arm path is not holding the manual's elbows-above-hands drive long enough before extension."
      : "The arm enters the propulsive window, but the forearm/catch shape is not holding water consistently.";
  }
  if (comment.id.includes("rotation")) {
    return "The shoulder line suggests the stroke is arm-led instead of rotation-led.";
  }
  if (comment.id.includes("centerline")) {
    return "The entry or pull is narrowing toward the midline, which can shorten leverage and increase drag.";
  }
  if (comment.id.includes("timing") || comment.id.includes("sequence")) {
    return "The stroke rhythm is not repeating cleanly enough for a stable style lock.";
  }
  if (comment.id.includes("kick")) {
    return "Body stability suggests the kick is not supporting the stroke phase strongly enough.";
  }
  if (input.anyEvf) {
    return "The catch shape is readable; the next goal is holding it under more speed or fatigue.";
  }
  return `The ${kb.displayName} manual points to ${phaseLabel(phase)} fundamentals as the current limiter.`;
}

function phaseLabel(phase: ManualPhase): string {
  return `${phase.label} ${phase.levels}`;
}

function buildNextSet(
  input: ManualCoachInput,
  kb: StrokeKnowledgeBase,
  phase: ManualPhase,
  comment: ManualCoachComment
): ManualCoachSet {
  if (input.trackingQuality < 0.45) {
    return {
      title: "Reset The Read",
      reps: "2 x 15 seconds",
      instruction: "Hold an easy drill position while the camera sees one full arm chain.",
      successMetric: "Tracking quality above 60 percent before scoring technique.",
    };
  }

  if (kb.stroke === "Breaststroke") {
    if (comment.id.includes("kick")) {
      return {
        title: "Whip Kick Isolation",
        reps: "4 x 15m",
        instruction: "Use Heel Clickers, then swim breaststroke with heels finishing together.",
        successMetric: "Kick finishes symmetrically without hips dropping.",
      };
    }
    if (comment.id.includes("sequence") || comment.id.includes("timing")) {
      return {
        title: "Sequence Reset",
        reps: "4 x 25",
        instruction: "Use 2 Kicks - 1 Pull and say pull, breathe, kick, stretch.",
        successMetric: "The glide stays long without stopping completely.",
      };
    }
    return {
      title: "Glide And Shape",
      reps: "4 x 25",
      instruction: "Use Super Glides into Diamond / Valentine Drill, then swim easy breaststroke.",
      successMetric: "Hands recover cleanly and body returns to streamline each cycle.",
    };
  }

  if (kb.stroke === "Backstroke") {
    if (comment.id.includes("rotation")) {
      return {
        title: "Roll Timing",
        reps: "4 x 25",
        instruction: "Use 6-Kick Switch or Rollover Drill, keeping the head still.",
        successMetric: "Shoulder roll appears without the recovery rushing across midline.",
      };
    }
    if (comment.id.includes("catch")) {
      return {
        title: "Backstroke Catch",
        reps: "4 x 25",
        instruction: "Use 1-Arm Backstroke and finish the S-shape pull past the hip.",
        successMetric: "The stroke stays long and the pull does not slip.",
      };
    }
    return {
      title: "Backstroke Line",
      reps: "4 x 25",
      instruction: "Use Streamline Kick, then swim backstroke with steady head and continuous kick.",
      successMetric: "Body stays long with no knee-break feedback.",
    };
  }

  if (kb.stroke === "Butterfly") {
    if (comment.id.includes("catch") || comment.id.includes("elbow")) {
      return {
        title: "Catch And Press",
        reps: "4 x 15m",
        instruction: "Use Single-Arm Butterfly, then two easy full strokes with forearms tipping down before the press.",
        successMetric: "Catch pressure appears before the breath or head lift.",
      };
    }
    if (comment.id.includes("timing") || comment.id.includes("kick")) {
      return {
        title: "Two-Kick Timing",
        reps: "4 x 15m",
        instruction: "Use Dolphin Kick + One Pull and feel one kick on entry, one kick through the press.",
        successMetric: "The stroke keeps moving with no pause after hand entry.",
      };
    }
    return {
      title: "Body Wave Reset",
      reps: "4 x 15m",
      instruction: "Use Body Dolphin into 3-3-3 Butterfly, keeping the breath low and arms symmetrical.",
      successMetric: "Hips follow the chest press and both hands recover together.",
    };
  }

  if (comment.id.includes("catch") || comment.id.includes("elbow")) {
    return {
      title: "Feel Then Swim",
      reps: "4 x 25",
      instruction: "Alternate 12.5m Fist Drill with 12.5m front crawl, holding high elbow before power.",
      successMetric: "EVF appears during the catch without rushing the stroke.",
    };
  }

  if (comment.id.includes("rotation")) {
    return {
      title: "Rotation Builder",
      reps: "4 x 25",
      instruction: "Use 10 Kick into front crawl. Rotate from hip and shoulder before breathing.",
      successMetric: "Shoulder roll becomes visible without lifting the head.",
    };
  }

  if (comment.id.includes("centerline")) {
    return {
      title: "Entry Width Control",
      reps: "4 x 25",
      instruction: "Enter just outside the shoulder, then shape the pull under the body.",
      successMetric: "No centerline-cross feedback for two consecutive lengths.",
    };
  }

  return {
    title: phase.id === "advanced" ? "Power Hold" : "Phase Builder",
    reps: phase.id === "beginner" ? "4 x 15m" : "4 x 25",
    instruction:
      phase.id === "beginner"
        ? "Use Streamline Kick, then swim easy front crawl without lifting the head."
        : "Use Finger Drag into full stroke, keeping high-elbow recovery and continuous timing.",
    successMetric:
      phase.id === "beginner"
        ? "Body line stays horizontal with relaxed flutter kick."
        : "Recovery clears the water without straight-arm windmill motion.",
  };
}

function buildComments(
  input: ManualCoachInput,
  kb: StrokeKnowledgeBase,
  context: PhoneAgentContext
): ManualCoachComment[] {
  const comments: ManualCoachComment[] = [];
  const source = context.sources[0]?.source ?? kb.identifier;

  if (input.trackingQuality < 0.45 || input.edgeLandmarks >= 2) {
    const correction = correctionFromAgent(kb, context, "body-line");
    comments.push({
      id: "camera-body-line",
      tone: "warning",
      title: "Phone-safe read",
      comment: "Detection is limited. Re-center the swimmer before trusting the style rating.",
      evidence:
        input.edgeLandmarks >= 2
          ? "Multiple landmarks are close to the frame edge."
          : "Tracking quality is below the coaching threshold.",
      immediateCue: "Move the phone back or re-center the lane.",
      drill: correction.drill,
      source,
    });
  }

  if (input.catchPhaseActive && !input.anyEvf) {
    const correction = correctionFromAgent(kb, context, "catch");
    comments.push(
      commentFromCorrection(
        "weak-catch",
        "critical",
        correction,
        "The propulsive phase is active, but the catch shape is not holding pressure.",
        "Catch phase is visible, but EVF/catch evidence is weak.",
        kb.stroke === "Breaststroke"
          ? "Keep elbows high as hands sweep in."
          : "Tip fingertips down before applying power.",
        source
      )
    );
  }

  if (hasFeedback(input, "left-dropped-elbow") || hasFeedback(input, "right-dropped-elbow")) {
    const correction = correctionFromAgent(kb, context, "elbow");
    comments.push(
      commentFromCorrection(
        "dropped-elbow",
        "critical",
        correction,
        "Dropped elbow mechanics are reducing leverage in the pull.",
        "The live flaw detector flagged dropped-elbow mechanics.",
        "Hold elbow height before the push.",
        source
      )
    );
  }

  if (
    hasFeedback(input, "shoulder-tilt") ||
    input.shoulderSlopeDegrees > 18 ||
    input.shoulderView === "side"
  ) {
    const correction = correctionFromAgent(kb, context, "rotation");
    comments.push(
      commentFromCorrection(
        "rotation",
        "warning",
        correction,
        "The stroke needs cleaner body roll or shoulder-hip connection.",
        `Shoulder view is ${input.shoulderView} with ${Math.round(
          input.shoulderSlopeDegrees
        )} degree slope.`,
        kb.stroke === "Breaststroke"
          ? "Return to streamline before the next pull."
          : "Rotate from the body before forcing the arm path.",
        source
      )
    );
  }

  if (hasFeedback(input, "left-cross") || hasFeedback(input, "right-cross")) {
    const correction = correctionFromAgent(kb, context, "centerline");
    comments.push(
      commentFromCorrection(
        "centerline-cross",
        "warning",
        correction,
        "The entry or pull path is narrowing across the body line.",
        "The front-view hand path crossed the body center.",
        kb.stroke === "Backstroke" ? "Aim entry to 11 and 1." : "Enter wider, then pull under the body.",
        source
      )
    );
  }

  if (input.lockState === "acquiring" || input.confidence < 0.52) {
    const correction = correctionFromAgent(kb, context, "timing");
    comments.push(
      commentFromCorrection(
        "timing",
        "warning",
        correction,
        "The stroke rhythm is not repeating cleanly yet.",
        `Style lock is ${input.lockState} at ${Math.round(input.confidence * 100)} percent confidence.`,
        kb.stroke === "Breaststroke"
          ? "Say pull, breathe, kick, stretch."
          : "Keep the arms moving without dead spots.",
        source
      )
    );
  }

  if (input.anyEvf && comments.length === 0) {
    const correction = correctionFromAgent(kb, context, "catch");
    comments.push({
      id: "strong-catch",
      tone: "good",
      title: correction.problem,
      comment: "The catch is readable. Move from correction into repeatability.",
      evidence: `Catch confidence is ${Math.round(input.bestEvfConfidence * 100)} percent.`,
      immediateCue: "Hold the catch shape as speed increases.",
      drill: correction.drill,
      source,
    });
  }

  if (comments.length === 0) {
    const correction = correctionFromAgent(kb, context, "body-line");
    comments.push({
      id: "steady-style",
      tone: "good",
      title: "Stable style read",
      comment: "The live evidence is clean enough to work the next phase goal.",
      evidence: "Pose quality, style lock, and arm-chain visibility are usable.",
      immediateCue: "Keep the body line long and repeat the same rhythm.",
      drill: correction.drill,
      source,
    });
  }

  return comments.filter(
    (comment, index, all) => all.findIndex((item) => item.id === comment.id) === index
  );
}

function buildLiveCue(comment: ManualCoachComment, input: ManualCoachInput): string {
  if (input.trackingQuality < 0.45) {
    return comment.immediateCue ?? "Move the phone back until one full arm chain is visible.";
  }

  if (comment.immediateCue) return comment.immediateCue;
  return comment.comment;
}

export function evaluatePhoneSwimAgent(input: ManualCoachInput): ManualCoachResult {
  const kb = selectKnowledgeBase(input);
  const context = retrievePhoneAgentChunks(input, kb);
  const phase = estimatePhase(input, kb);
  const rubric = buildRubric(input, phase, kb);
  const estimatedScore = estimateScore(input, kb, rubric);
  const comments = buildComments(input, kb, context).slice(0, 1);
  const first = firstActionableComment(comments);
  const nextSet = buildNextSet(input, kb, phase, first);

  return {
    model: "glide-phone-manual-agent-v1",
    agentMode: "phone-local-keyword-rag",
    stroke: kb.stroke,
    strokeLabel: kb.displayName,
    phase,
    estimatedScore,
    confidence: coachConfidence(input, kb),
    liveCue: buildLiveCue(first, input),
    primaryFocus: inferPrimaryFocus(first, phase),
    inferredCause: inferCause(input, kb, phase, first),
    nextSet,
    rubric,
    comments,
    sources: context.sources,
    voiceLine: first.drill
      ? `${first.title}. ${first.immediateCue ?? first.comment} Try ${first.drill}.`
      : `${first.title}. ${first.immediateCue ?? first.comment}`,
  };
}

export function evaluateSwimStyleCoach(input: ManualCoachInput): ManualCoachResult {
  return evaluatePhoneSwimAgent(input);
}

export function evaluateFrontCrawlCoach(input: ManualCoachInput): ManualCoachResult {
  return evaluatePhoneSwimAgent({ ...input, strokeFocus: "Freestyle" });
}
