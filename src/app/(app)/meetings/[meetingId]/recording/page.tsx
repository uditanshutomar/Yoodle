"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, Play, Pause, FileText, Download, Loader2 } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";

interface TranscriptSegment {
  speaker: string;
  speakerId: string;
  text: string;
  timestamp: number;
  duration?: number;
}

export default function RecordingPage() {
  const params = useParams();
  const router = useRouter();
  const meetingId = params.meetingId as string;

  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);

  // Fetch transcript from API
  useEffect(() => {
    async function fetchTranscript() {
      try {
        const res = await fetch(`/api/transcription?meetingId=${meetingId}`, {
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          setSegments(data.data?.segments || []);
        }
      } catch (err) {
        console.error("[Recording] Failed to fetch transcript:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchTranscript();
  }, [meetingId]);

  const formatTimestamp = (ts: number) => {
    const totalSeconds = Math.floor(ts / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const handleDownloadTranscript = () => {
    if (segments.length === 0) return;

    const lines = segments.map(
      (seg) => `[${formatTimestamp(seg.timestamp)}] ${seg.speaker}: ${seg.text}`
    );
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `yoodle-transcript-${meetingId.slice(0, 8)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-5xl mx-auto space-y-6"
    >
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          icon={ArrowLeft}
          onClick={() => router.push("/meetings")}
        >
          Back
        </Button>
        <h1
          className="text-2xl font-black text-[#0A0A0A]"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          Recording & Transcript
        </h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recording Player */}
        <div className="space-y-4">
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h3
                className="text-base font-bold"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                Recording
              </h3>
              <Badge variant="default">Meeting {meetingId.slice(0, 8)}</Badge>
            </div>
            <div className="flex items-center justify-center h-32 bg-[#0A0A0A] rounded-xl">
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className="flex items-center gap-2 text-white/80 hover:text-white transition-colors cursor-pointer"
              >
                {isPlaying ? (
                  <Pause size={24} fill="currentColor" />
                ) : (
                  <Play size={24} fill="currentColor" />
                )}
                <span
                  className="text-sm font-bold"
                  style={{ fontFamily: "var(--font-heading)" }}
                >
                  {isPlaying ? "Pause" : "Play Recording"}
                </span>
              </button>
            </div>
            <p
              className="text-xs text-[#0A0A0A]/40 mt-2 text-center"
              style={{ fontFamily: "var(--font-body)" }}
            >
              Recording is saved locally when downloaded from the meeting room.
            </p>
          </Card>
        </div>

        {/* Transcript */}
        <div className="space-y-4">
          <Card>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <FileText size={16} />
                <h3
                  className="text-base font-bold"
                  style={{ fontFamily: "var(--font-heading)" }}
                >
                  Live Transcript
                </h3>
              </div>
              {segments.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  icon={Download}
                  onClick={handleDownloadTranscript}
                >
                  Download .txt
                </Button>
              )}
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2
                  size={24}
                  className="animate-spin text-[#0A0A0A]/40"
                />
              </div>
            ) : segments.length === 0 ? (
              <div className="text-center py-12">
                <FileText
                  size={32}
                  className="mx-auto text-[#0A0A0A]/20 mb-3"
                />
                <p
                  className="text-sm text-[#0A0A0A]/40"
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  No transcript available for this meeting.
                </p>
                <p
                  className="text-xs text-[#0A0A0A]/30 mt-1"
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  Transcription is generated live during meetings when enabled.
                </p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[500px] overflow-y-auto">
                {segments.map((seg, i) => (
                  <div key={i} className="flex gap-3">
                    <span className="text-xs text-[#0A0A0A]/40 w-10 shrink-0 pt-0.5 font-mono">
                      {formatTimestamp(seg.timestamp)}
                    </span>
                    <div>
                      <span
                        className="text-xs font-bold text-[#0A0A0A]"
                        style={{ fontFamily: "var(--font-heading)" }}
                      >
                        {seg.speaker}
                      </span>
                      <p
                        className="text-sm text-[#0A0A0A]/70"
                        style={{ fontFamily: "var(--font-body)" }}
                      >
                        {seg.text}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </motion.div>
  );
}
