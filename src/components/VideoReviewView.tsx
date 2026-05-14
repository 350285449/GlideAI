"use client";
import { useState } from "react";
import AnalysisEngine, { SessionCompleteData } from "@/components/AnalysisEngine";
import { X, Play, Loader2 } from "lucide-react";

export default function VideoReviewView({ onSessionComplete }: { onSessionComplete: (data: SessionCompleteData) => void }) {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [adSegments, setAdSegments] = useState<[number, number][]>([]);
  const [ytLink, setYtLink] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setVideoUrl(url);
      setAdSegments([]);
      setError(null);
    }
  };

  const handleYtSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ytLink) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const proxyUrl = `/api/yt/proxy?url=${encodeURIComponent(ytLink)}`;
      setVideoUrl(proxyUrl);
      
      // Try to fetch SponsorBlock segments using a regex to get the video ID
      try {
        const videoIdMatch = ytLink.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
        const videoId = videoIdMatch ? videoIdMatch[1] : null;
        
        if (videoId) {
          const sbRes = await fetch(`https://sponsor.ajay.app/api/skipSegments?videoID=${videoId}&category=sponsor`);
          if (sbRes.ok) {
            const sbData = await sbRes.json();
            const segments = sbData.map((s: any) => [s.segment[0], s.segment[1]]);
            setAdSegments(segments);
          } else {
            setAdSegments([]);
          }
        }
      } catch (err) {
        setAdSegments([]); // Fallback to no ads detected if API fails
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (videoUrl) {
    return (
      <div className="w-full h-full relative flex flex-col">
        <button
          onClick={() => {
            if (videoUrl.startsWith('blob:')) {
              URL.revokeObjectURL(videoUrl);
            }
            setVideoUrl(null);
            setAdSegments([]);
          }}
          className="absolute top-4 left-4 z-[200] flex items-center gap-2 bg-zinc-900/80 text-white px-4 py-2 rounded-lg border border-zinc-700 hover:bg-zinc-800 transition"
        >
          <X className="w-4 h-4" />
          Close Video
        </button>
        <div className="flex-1 min-h-0 relative">
          <AnalysisEngine onSessionComplete={onSessionComplete} videoUrl={videoUrl} adSegments={adSegments} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center w-full h-full p-8 text-center bg-zinc-950/50">
      <h2 className="text-3xl font-bold text-white mb-6">Video Review</h2>
      <p className="text-zinc-400 mb-8 max-w-md">
        Upload a pre-recorded swimming video or paste a YouTube link to generate a full session report with real-time pose annotation.
      </p>
      
      <div className="flex flex-col gap-6 w-full max-w-md">
        <label className="cursor-pointer bg-cyan-600 hover:bg-cyan-500 text-white px-8 py-4 rounded-2xl font-bold transition-all hover:scale-105 shadow-lg shadow-cyan-900/20 flex items-center justify-center gap-3 w-full">
          Select Video File
          <input type="file" accept="video/mp4,video/x-m4v,video/*" className="hidden" onChange={handleFileUpload} />
        </label>
        
        <div className="relative flex items-center gap-4">
          <div className="flex-1 h-px bg-zinc-800"></div>
          <span className="text-zinc-500 text-sm font-medium">OR</span>
          <div className="flex-1 h-px bg-zinc-800"></div>
        </div>

        <form onSubmit={handleYtSubmit} className="flex flex-col gap-3">
          <div className="relative">
            <Play className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
            <input 
              type="url"
              placeholder="Paste YouTube link here..."
              value={ytLink}
              onChange={(e) => setYtLink(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-3 pl-10 pr-4 text-white focus:outline-none focus:border-cyan-500 transition-colors"
              disabled={loading}
            />
          </div>
          <button 
            type="submit" 
            disabled={!ytLink || loading}
            className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-8 py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Load YouTube Video"}
          </button>
          {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
        </form>
      </div>
    </div>
  );
}