"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, Play, Pause, FileText, Download, Loader2, Video } from "lucide-react";
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

interface Recording {
  key: string;
  size: number;
  lastModified: string;
  downloadUrl: string;
}

export default function RecordingPage() {
  const params = useParams();
  const router = useRouter();
  const meetingId = params.meetingId as string;

  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Fetch transcript and recordings in parallel
  useEffect(() => {
    async function fetchData() {
      try {
        const [transcriptRes, recordingsRes] = await Promise.allSettled([
          fetch(`/api/transcription?meetingId=${meetingId}`, { credentials: "include" }),
          fetch(`/api/recordings/${meetingId}`, { credentials: "include" }),
        ]);

        if (transcriptRes.status === "fulfilled" && transcriptRes.value.ok) {
          const data = await transcriptRes.value.json();
          setSegments(data.data?.segments || []);
        }

        if (recordingsRes.status === "fulfilled" && recordingsRes.value.ok) {
          const data = await recordingsRes.value.json();
          setRecordings(data.data?.recordings || []);
        }
      } catch (err) {
        console.error("[Recording] Failed to fetch data:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [meetingId]);

  const formatTimestamp = (ts: number) => {
    const totalSeconds = Math.floor(ts / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handlePlayPause = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
    setIsPlaying(!isPlaying);
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

  const latestRecording = recordings.length > 0 ? recordings[recordings.length - 1] : null;

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

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 size={32} className="animate-spin text-[#0A0A0A]/40" />
        </div>
      ) : (
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

              {latestRecording ? (
                <>
                  <div className="rounded-xl overflow-hidden bg-[#0A0A0A]">
                    <video
                      ref={videoRef}
                      src={latestRecording.downloadUrl}
                      className="w-full aspect-video"
                      onPlay={() => setIsPlaying(true)}
                      onPause={() => setIsPlaying(false)}
                      onEnded={() => setIsPlaying(false)}
                      controls
                    />
                  </div>
                  <div className="flex items-center justify-between mt-3">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={isPlaying ? Pause : Play}
                        onClick={handlePlayPause}
                      >
                        {isPlaying ? "Pause" : "Play"}
                      </Button>
                    </div>
                    <a
                      href={latestRecording.downloadUrl}
                      download
                      className="flex items-center gap-1 text-xs text-[#0A0A0A]/60 hover:text-[#0A0A0A] transition-colors"
                    >
                      <Download size={14} />
                      Download ({formatFileSize(latestRecording.size)})
                    </a>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-32 bg-[#0A0A0A] rounded-xl">
                  <Video size={28} className="text-white/20 mb-2" />
                  <span
                    className="text-sm text-white/40"
                    style={{ fontFamily: "var(--font-body)" }}
                  >
                    No recording available
                  </span>
                </div>
              )}

              <p
                className="text-xs text-[#0A0A0A]/40 mt-2 text-center"
                style={{ fontFamily: "var(--font-body)" }}
              >
                {latestRecording
                  ? `Recorded ${new Date(latestRecording.lastModified).toLocaleDateString()}`
                  : "Recording is saved when you record during a meeting."}
              </p>
            </Card>

            {/* All recordings list */}
            {recordings.length > 1 && (
              <Card>
                <h3
                  className="text-sm font-bold mb-3"
                  style={{ fontFamily: "var(--font-heading)" }}
                >
                  All Recordings ({recordings.length})
                </h3>
                <div className="space-y-2">
                  {recordings.map((rec, i) => (
                    <a
                      key={i}
                      href={rec.downloadUrl}
                      download
                      className="flex items-center justify-between p-2 rounded-lg hover:bg-[#0A0A0A]/5 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <Video size={14} className="text-[#0A0A0A]/40" />
                        <span className="text-xs text-[#0A0A0A]/70">
                          {new Date(rec.lastModified).toLocaleString()}
                        </span>
                      </div>
                      <span className="text-xs text-[#0A0A0A]/40">
                        {formatFileSize(rec.size)}
                      </span>
                    </a>
                  ))}
                </div>
              </Card>
            )}
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
                    Transcript
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

              {segments.length === 0 ? (
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
                    Enable captions during a meeting to generate a transcript.
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
      )}
    </motion.div>
  );
}
