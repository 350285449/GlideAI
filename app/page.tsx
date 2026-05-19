"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import {
  Activity,
  Award,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock,
  Home,
  LogOut,
  Menu,
  Play,
  Save,
  Timer,
  Trash2,
  TrendingUp,
  Trophy,
  Waves,
  X,
} from "lucide-react";
import type { SessionMark } from "@/components/AnalysisEngine";

const AnalysisEngine = dynamic(
  () => import("@/components/AnalysisEngine"),
  { ssr: false }
);

type ReportLevel = 0 | 1 | 2 | 3 | 4 | 5;

export interface SessionReportCard {
  generatedAt: string;
  score: number;
  level: ReportLevel;
  levelPercent: number;
  headline: string;
  highlights: string[];
  improvements: string[];
  nextSessionFocus: string;
}

interface SessionDraft {
  id: number;
  date: string;
  durationMs: number;
  lapCount: number;
  bestEvf: number;
  marks: SessionMark[];
  strokeFocus: string;
}

export interface SavedSession extends SessionDraft {
  reportCard: SessionReportCard;
}

type ViewType = "menu" | "session" | "history" | "overview";

async function quitApp() {
  if (typeof window === "undefined") return;
  if (window.glideApp?.quit) {
    await window.glideApp.quit();
    return;
  }
  const isElectron = /Electron/i.test(window.navigator.userAgent);
  if (isElectron) {
    window.location.href = "about:blank";
    return;
  }
  window.close();
}

function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function levelForScore(score: number): { level: ReportLevel; levelPercent: number } {
  const rawLevel = clamp(score / 20, 0, 5);
  if (rawLevel >= 5) {
    return { level: 5, levelPercent: 100 };
  }

  const level = Math.floor(rawLevel) as ReportLevel;
  return {
    level,
    levelPercent: Math.round((rawLevel - level) * 100),
  };
}

function reportLevelClass(level: ReportLevel) {
  if (level >= 4) {
    return "border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
  }
  if (level === 3) {
    return "border-cyan-500/40 bg-cyan-500/10 text-cyan-300";
  }
  if (level === 2) {
    return "border-amber-500/40 bg-amber-500/10 text-amber-300";
  }
  return "border-zinc-700 bg-zinc-800/70 text-zinc-300";
}

function commonCue(marks: SessionMark[]) {
  const counts = new Map<string, number>();
  marks.forEach((mark) => {
    counts.set(mark.cue, (counts.get(mark.cue) ?? 0) + 1);
  });

  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;
}

function generateSessionReportCard(session: SessionDraft): SessionReportCard {
  const evfScore = Math.round(clamp(session.bestEvf, 0, 1) * 100);
  const markedQuality =
    session.marks.length > 0
      ? Math.round(average(session.marks.map((mark) => mark.quality)))
      : evfScore;
  const lapScore = clamp(session.lapCount * 18, 0, 100);
  const durationMinutes = session.durationMs / 60000;
  const sessionEvidenceScore = clamp(
    45 + session.marks.length * 10 + session.lapCount * 7 + durationMinutes * 2,
    45,
    100
  );
  const score = Math.round(
    evfScore * 0.45 +
      markedQuality * 0.3 +
      sessionEvidenceScore * 0.15 +
      lapScore * 0.1
  );
  const levelProgress = levelForScore(score);
  const primaryCue = commonCue(session.marks);

  const highlights = [
    evfScore >= 80
      ? `Strong EVF peak at ${evfScore}%.`
      : evfScore >= 60
        ? `EVF is building, with a best hold of ${evfScore}%.`
        : `Baseline EVF captured at ${evfScore}%.`,
    session.lapCount > 0
      ? `Logged ${pluralize(session.lapCount, "lap")} for repeatable tracking.`
      : "Captured a technique baseline before lap tracking.",
    session.marks.length > 0
      ? `Saved ${pluralize(session.marks.length, "coaching mark")} with ${markedQuality}% average quality.`
      : "Ready for richer notes once cues are marked during the swim.",
  ];

  const improvements = [
    evfScore < 70
      ? "Prioritize high elbow catch pressure before adding speed."
      : "Keep the elbow angle consistent as pace increases.",
    primaryCue
      ? `Revisit cue: ${primaryCue}`
      : "Add two or three marks next time to capture the exact coaching cues.",
    session.lapCount === 0
      ? "Use the lap button at each wall for better set comparison."
      : "Compare lap count and EVF together after the next set.",
  ];

  const nextSessionFocus =
    session.strokeFocus === "Auto"
      ? "Pick a stroke focus before the next set or keep Auto on for detection."
      : `Run another ${session.strokeFocus} set and aim for ${Math.min(
          100,
          evfScore + 5
        )}% EVF.`;

  return {
    generatedAt: new Date().toISOString(),
    score,
    level: levelProgress.level,
    levelPercent: levelProgress.levelPercent,
    headline:
      levelProgress.level >= 4
        ? "Clean session with strong technique signals."
        : levelProgress.level >= 3
          ? "Solid set with clear next-step cues."
          : "Useful baseline. Build consistency next.",
    highlights,
    improvements,
    nextSessionFocus,
  };
}

function isReportCard(value: unknown): value is SessionReportCard {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<SessionReportCard>;
  return (
    typeof candidate.generatedAt === "string" &&
    typeof candidate.score === "number" &&
    typeof candidate.level === "number" &&
    Number.isInteger(candidate.level) &&
    candidate.level >= 0 &&
    candidate.level <= 5 &&
    typeof candidate.levelPercent === "number" &&
    typeof candidate.headline === "string" &&
    Array.isArray(candidate.highlights) &&
    Array.isArray(candidate.improvements) &&
    candidate.highlights.every((item) => typeof item === "string") &&
    candidate.improvements.every((item) => typeof item === "string") &&
    typeof candidate.nextSessionFocus === "string"
  );
}

function parseStoredSessions(value: string | null): SavedSession[] {
  if (!value) return [];

  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) return [];

  return parsed.flatMap((session): SavedSession[] => {
    if (!session || typeof session !== "object") return [];

    const candidate = session as Partial<SavedSession>;
    const hasRequiredSessionFields =
      typeof candidate.id === "number" &&
      typeof candidate.date === "string" &&
      typeof candidate.durationMs === "number" &&
      typeof candidate.lapCount === "number" &&
      typeof candidate.bestEvf === "number" &&
      Array.isArray(candidate.marks) &&
      typeof candidate.strokeFocus === "string";

    if (!hasRequiredSessionFields) return [];

    const sessionDraft: SessionDraft = {
      id: candidate.id!,
      date: candidate.date!,
      durationMs: candidate.durationMs!,
      lapCount: candidate.lapCount!,
      bestEvf: candidate.bestEvf!,
      marks: candidate.marks!,
      strokeFocus: candidate.strokeFocus!,
    };

    return [
      {
        ...sessionDraft,
        reportCard: isReportCard(candidate.reportCard)
          ? candidate.reportCard
          : generateSessionReportCard(sessionDraft),
      },
    ];
  });
}

function ReportCardView({
  reportCard,
  compact = false,
}: {
  reportCard: SessionReportCard;
  compact?: boolean;
}) {
  return (
    <div
      className={
        compact
          ? "mt-4 border-t border-zinc-800/80 pt-4"
          : "w-full max-w-2xl rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 text-left"
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
            <ClipboardCheck className="h-4 w-4 text-cyan-400" />
            Report Card
          </div>
          <h3 className="text-lg font-bold text-white">{reportCard.headline}</h3>
          <p className="mt-1 text-sm text-zinc-500">
            Generated {new Date(reportCard.generatedAt).toLocaleString()}
          </p>
        </div>
        <div
          className={`flex min-w-[6.5rem] flex-col items-center rounded-xl border px-4 py-3 ${reportLevelClass(
            reportCard.level
          )}`}
        >
          <span className="text-3xl font-black leading-none">L{reportCard.level}</span>
          <span className="mt-1 font-mono text-xs">
            {reportCard.levelPercent}% level
          </span>
          <span className="mt-0.5 font-mono text-[10px] opacity-70">
            {reportCard.score}/100
          </span>
        </div>
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            Highlights
          </div>
          <div className="space-y-2">
            {reportCard.highlights.map((highlight) => (
              <p key={highlight} className="text-sm leading-relaxed text-zinc-300">
                {highlight}
              </p>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
            <TrendingUp className="h-4 w-4 text-amber-400" />
            Improve
          </div>
          <div className="space-y-2">
            {reportCard.improvements.map((improvement) => (
              <p key={improvement} className="text-sm leading-relaxed text-zinc-300">
                {improvement}
              </p>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-5 flex items-start gap-3 rounded-lg border border-cyan-900/50 bg-cyan-950/20 p-3 text-sm text-cyan-100">
        <Award className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
        <p>{reportCard.nextSessionFocus}</p>
      </div>
    </div>
  );
}

export default function AppHome() {
  const [canQuitApp, setCanQuitApp] = useState(false);
  const [sessions, setSessions] = useState<SavedSession[]>([]);
  const [viewHistory, setViewHistory] = useState<ViewType[]>(["menu"]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pendingSession, setPendingSession] = useState<SavedSession | null>(null);

  const view = viewHistory[historyIndex];

  const navigateTo = (newView: ViewType) => {
    if (newView === view) return;
    const newHistory = viewHistory.slice(0, historyIndex + 1);
    newHistory.push(newView);
    setViewHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    setSidebarOpen(false);
  };

  const goBack = () => {
    if (historyIndex > 0) setHistoryIndex(historyIndex - 1);
  };

  const goForward = () => {
    if (historyIndex < viewHistory.length - 1) setHistoryIndex(historyIndex + 1);
  };

  useEffect(() => {
    const isElectron =
      typeof window !== "undefined" &&
      (Boolean(window.glideApp?.quit) || /Electron/i.test(window.navigator.userAgent));

    setCanQuitApp(isElectron);

    try {
      const stored = localStorage.getItem("glideai_sessions");
      setSessions(parseStoredSessions(stored));
    } catch (e) {
      console.error("Failed to load sessions", e);
    }
  }, []);

  const handleSessionComplete = (session: SessionDraft) => {
    setPendingSession({
      ...session,
      reportCard: generateSessionReportCard(session),
    });
    navigateTo("overview");
  };

  const handleSaveSession = () => {
    if (!pendingSession) return;
    const updatedSessions = [pendingSession, ...sessions];
    setSessions(updatedSessions);
    try {
      localStorage.setItem("glideai_sessions", JSON.stringify(updatedSessions));
    } catch (e) {
      console.error("Failed to save session", e);
    }
    setPendingSession(null);
    navigateTo("menu");
  };

  const handleDiscardSession = () => {
    setPendingSession(null);
    navigateTo("menu");
  };

  return (
    <main className="min-h-screen flex flex-col bg-zinc-950 text-zinc-100 selection:bg-cyan-500/30 relative">
      {/* Sidebar Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-[100] flex">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          <div className="relative w-64 bg-zinc-900 border-r border-zinc-800 p-4 flex flex-col gap-2">
            <div className="flex justify-between items-center mb-6 px-2 mt-2">
              <h2 className="text-xl font-bold tracking-tight text-cyan-400">Glide<span className="text-white">AI</span></h2>
              <button onClick={() => setSidebarOpen(false)} className="p-2 text-zinc-400 hover:text-white transition rounded-md hover:bg-zinc-800" title="Close Menu">
                <X className="w-5 h-5"/>
              </button>
            </div>
            <button onClick={() => navigateTo("menu")} className={`flex items-center gap-3 p-3 rounded-lg transition ${view === "menu" ? "bg-zinc-800 text-white" : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"}`}>
              <Home className="w-5 h-5"/>
              Home
            </button>
            <button onClick={() => navigateTo("session")} className={`flex items-center gap-3 p-3 rounded-lg transition ${view === "session" ? "bg-zinc-800 text-white" : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"}`}>
              <Play className="w-5 h-5"/>
              New Session
            </button>
            <button onClick={() => navigateTo("history")} className={`flex items-center gap-3 p-3 rounded-lg transition ${view === "history" ? "bg-zinc-800 text-white" : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"}`}>
              <Clock className="w-5 h-5"/>
              History
            </button>
            {pendingSession && (
              <button onClick={() => navigateTo("overview")} className={`flex items-center gap-3 p-3 rounded-lg transition ${view === "overview" ? "bg-zinc-800 text-white" : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"}`}>
                <Activity className="w-5 h-5"/>
                Pending Overview
              </button>
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <header className="flex items-center justify-between gap-4 px-4 py-3 border-b border-zinc-800 bg-zinc-900/80 backdrop-blur-md sticky top-0 z-50 sm:px-8 sm:py-4">
        <div className="flex items-center gap-2 sm:gap-4">
          <button onClick={() => setSidebarOpen(true)} className="p-2 text-zinc-400 hover:text-white transition rounded-md hover:bg-zinc-800" title="Open menu">
            <Menu className="w-5 h-5" />
          </button>
          
          <div className="hidden sm:flex items-center gap-1 border-r border-zinc-800 pr-4 mr-2">
            <button onClick={goBack} disabled={historyIndex === 0} className="p-1.5 text-zinc-400 hover:text-white disabled:opacity-30 disabled:hover:text-zinc-400 transition rounded-md" title="Go back">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button onClick={goForward} disabled={historyIndex === viewHistory.length - 1} className="p-1.5 text-zinc-400 hover:text-white disabled:opacity-30 disabled:hover:text-zinc-400 transition rounded-md" title="Go forward">
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => navigateTo("menu")}
            className="flex items-center gap-3 transition hover:opacity-80"
          >
            <Waves className="w-7 h-7 text-cyan-400" />
            <div className="text-left hidden sm:block">
              <h1 className="text-xl font-bold tracking-tight">
                Glide<span className="text-cyan-400">AI</span>
              </h1>
              <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">
                Aquatic Intelligence
              </p>
            </div>
          </button>
        </div>

        <div className="flex items-center gap-3">
          {view === "session" && (
            <div className="hidden sm:flex items-center gap-2 text-xs text-emerald-400 font-medium bg-emerald-400/10 px-3 py-1.5 rounded-full border border-emerald-400/20">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Live Engine Active
            </div>
          )}
          {canQuitApp && (
            <button
              type="button"
              onClick={quitApp}
              className="inline-flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-red-400 transition hover:bg-red-500/20 hover:border-red-400/70"
            >
              <LogOut className="w-4 h-4" />
              Quit
            </button>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <section className="flex-1 flex flex-col min-h-0 p-4 sm:p-6 lg:p-8 relative">
        {view === "menu" && (
          <div className="max-w-4xl mx-auto w-full flex-1 flex flex-col justify-center">
            <div className="text-center mb-12">
              <h2 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-white mb-4">
                Your AI Swim Coach
              </h2>
              <p className="text-lg text-zinc-400 max-w-2xl mx-auto">
                On-device biomechanics tracking. Improve your catch, monitor your EVF, and correct your stroke in real-time.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-6 max-w-2xl mx-auto w-full">
              <button
                type="button"
                onClick={() => navigateTo("session")}
                className="group relative flex flex-col items-center gap-4 rounded-2xl border border-cyan-500/30 bg-cyan-950/20 p-8 text-center transition-all hover:border-cyan-400/50 hover:bg-cyan-900/30 hover:shadow-[0_0_30px_rgba(8,145,178,0.2)]"
              >
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-cyan-500/20 text-cyan-400 transition-transform group-hover:scale-110">
                  <Play className="h-8 w-8 ml-1" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white mb-1">New Session</h3>
                  <p className="text-sm text-cyan-200/70">Start live camera analysis</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => navigateTo("history")}
                className="group relative flex flex-col items-center gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-8 text-center transition-all hover:border-zinc-700 hover:bg-zinc-800/80"
              >
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-zinc-800 text-zinc-400 transition-transform group-hover:scale-110">
                  <Clock className="h-8 w-8" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white mb-1">Session History</h3>
                  <p className="text-sm text-zinc-500">Review past performance</p>
                </div>
                <div className="absolute top-4 right-4 flex items-center justify-center h-6 min-w-[1.5rem] px-1.5 rounded-full bg-zinc-800 text-[10px] font-bold text-zinc-400">
                  {sessions.length}
                </div>
              </button>
            </div>
          </div>
        )}

        {view === "overview" && (
          <div className="max-w-4xl mx-auto w-full flex-1 flex flex-col items-center justify-center relative py-12">
            <h2 className="text-3xl font-bold text-white mb-6">Session Overview</h2>
            <div className="p-8 border border-zinc-800 bg-zinc-900/50 rounded-2xl w-full max-w-2xl text-center mb-6">
              {pendingSession ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                  <div>
                    <p className="text-sm text-zinc-500 mb-1 uppercase tracking-wider">Duration</p>
                    <p className="text-2xl font-mono text-white">{formatDuration(pendingSession.durationMs)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-zinc-500 mb-1 uppercase tracking-wider">Laps</p>
                    <p className="text-2xl font-mono text-white">{pendingSession.lapCount}</p>
                  </div>
                  <div>
                    <p className="text-sm text-zinc-500 mb-1 uppercase tracking-wider">Best EVF</p>
                    <p className="text-2xl font-mono text-cyan-400">{Math.round(pendingSession.bestEvf * 100)}%</p>
                  </div>
                  <div>
                    <p className="text-sm text-zinc-500 mb-1 uppercase tracking-wider">Focus</p>
                    <p className="text-xl font-semibold text-white mt-1">{pendingSession.strokeFocus}</p>
                  </div>
                </div>
              ) : (
                <p className="text-zinc-500">No active session pending.</p>
              )}
            </div>
            {pendingSession && (
              <div className="mb-8 w-full flex justify-center">
                <ReportCardView reportCard={pendingSession.reportCard} />
              </div>
            )}
            <div className="flex items-center gap-4">
               <button onClick={handleDiscardSession} className="flex items-center gap-2 px-6 py-3 rounded-lg border border-red-500/40 bg-red-500/10 text-red-400 font-semibold hover:bg-red-500/20 transition">
                 <Trash2 className="w-5 h-5"/>
                 Discard
               </button>
               <button onClick={handleSaveSession} disabled={!pendingSession} className="flex items-center gap-2 px-8 py-3 rounded-lg bg-cyan-600 text-white font-bold hover:bg-cyan-500 transition shadow-[0_0_20px_rgba(8,145,178,0.4)] disabled:opacity-50">
                 <Save className="w-5 h-5"/>
                 Save to History
               </button>
            </div>
          </div>
        )}

        {view === "history" && (
          <div className="max-w-4xl mx-auto w-full">
            <div className="flex items-center gap-4 mb-8">
              <button
                type="button"
                onClick={goBack}
                className="p-2 rounded-lg border border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div>
                <h2 className="text-2xl font-bold text-white">Session History</h2>
                <p className="text-sm text-zinc-500">Your recorded swim analyses</p>
              </div>
            </div>

            {sessions.length === 0 ? (
              <div className="text-center py-20 border border-dashed border-zinc-800 rounded-2xl bg-zinc-900/20">
                <Clock className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-zinc-300 mb-1">No sessions yet</h3>
                <p className="text-zinc-500 mb-6 text-sm">Start a new session to record your first swim.</p>
                <button
                  type="button"
                  onClick={() => navigateTo("session")}
                  className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 font-semibold text-white transition hover:bg-cyan-500 shadow-lg shadow-cyan-900/20"
                >
                  <Play className="w-4 h-4" />
                  Start Session
                </button>
              </div>
            ) : (
              <div className="grid gap-4">
                {sessions.map((session) => (
                  <div key={session.id} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 transition hover:bg-zinc-900/60 hover:border-zinc-700">
                    <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                      <div>
                        <h4 className="font-semibold text-zinc-100">{new Date(session.date).toLocaleString()}</h4>
                        <p className="text-xs text-zinc-500 mt-0.5">Focus: <span className="text-cyan-400/80">{session.strokeFocus}</span></p>
                      </div>
                      <div className="flex gap-4">
                        <div className="flex items-center gap-1.5 text-sm font-medium text-zinc-300">
                          <Timer className="w-4 h-4 text-zinc-500" />
                          {formatDuration(session.durationMs)}
                        </div>
                        <div className="flex items-center gap-1.5 text-sm font-medium text-zinc-300">
                          <Activity className="w-4 h-4 text-emerald-500" />
                          {session.lapCount} laps
                        </div>
                        <div className="flex items-center gap-1.5 text-sm font-medium text-zinc-300">
                          <Trophy className="w-4 h-4 text-amber-500" />
                          {Math.round(session.bestEvf * 100)}% EVF
                        </div>
                      </div>
                    </div>

                    <ReportCardView reportCard={session.reportCard} compact />
                    
                    {session.marks.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-zinc-800/80">
                        <p className="text-xs font-semibold text-zinc-500 mb-2 uppercase tracking-wider">Session Marks ({session.marks.length})</p>
                        <div className="flex flex-wrap gap-2">
                          {session.marks.slice(0, 3).map(mark => (
                            <span key={mark.id} className="inline-flex items-center rounded-md border border-zinc-700 bg-zinc-800/50 px-2 py-1 text-xs text-zinc-300">
                              <span className="text-cyan-400 mr-1.5">{mark.timeLabel}</span>
                              {mark.stroke}
                            </span>
                          ))}
                          {session.marks.length > 3 && (
                            <span className="inline-flex items-center rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-zinc-500">
                              +{session.marks.length - 3} more
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {view === "session" && (
          <AnalysisEngine onSessionComplete={handleSessionComplete} />
        )}
      </section>

      {/* Footer */}
      <footer className="px-4 py-4 border-t border-zinc-800/80 text-center text-xs text-zinc-600 bg-zinc-950 sm:px-8 mt-auto relative z-40">
        GlideAI v1.0.0-Beta &middot; 100% On-Device Processing &middot; Zero Data Upload
      </footer>
    </main>
  );
}
