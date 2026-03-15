"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, Play, Pause, FileText, Download, Loader2, Video, ExternalLink } from "lucide-react";
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
  fileId: string;
  name: string;
  mimeType: string;
  size?: string;
  createdTime?: string;
  viewUrl?: string;
  downloadUrl?: string;
}

export default function RecordingPage() {
  const params = useParams();
  const router = useRouter();
  const meetingId = params.meetingId as string;

  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [meetingTitle, setMeetingTitle] = useState("");
  const [meetingDate, setMeetingDate] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Fetch meeting info, transcript, and recordings in parallel
  useEffect(() => {
    async function fetchData() {
      try {
        const [meetingRes, transcriptRes, recordingsRes] = await Promise.allSettled([
          fetch(`/api/meetings/${meetingId}`, { credentials: "include" }),
          fetch(`/api/transcription?meetingId=${meetingId}`, { credentials: "include" }),
          fetch(`/api/recordings/${meetingId}`, { credentials: "include" }),
        ]);

        if (meetingRes.status === "fulfilled" && meetingRes.value.ok) {
          const data = await meetingRes.value.json();
          if (data.success && data.data) {
            setMeetingTitle(data.data.title || "");
            setMeetingDate(new Date(data.data.startedAt || data.data.createdAt));
          }
        }

        if (transcriptRes.status === "fulfilled" && transcriptRes.value.ok) {
          const data = await transcriptRes.value.json();
          setSegments(data.data?.segments || []);
        }

        if (recordingsRes.status === "fulfilled" && recordingsRes.value.ok) {
          const data = await recordingsRes.value.json();
          setRecordings(data.data?.recordings || []);
        }
      } catch {
        // fetch failed — UI will show empty states
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

  const formatFileSize = (sizeStr?: string) => {
    if (!sizeStr) return "";
    const bytes = parseInt(sizeStr, 10);
    if (isNaN(bytes)) return "";
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
    const d = meetingDate || new Date();
    const datePart = d.toISOString().slice(0, 10);
    const timePart = d.toTimeString().slice(0, 5).replace(":", "-");
    const safeName = meetingTitle
      ? meetingTitle.replace(/[^a-zA-Z0-9 _-]/g, "").replace(/\s+/g, "_")
      : "Transcript";
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeName}_${datePart}_${timePart}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const latestRecording = recordings.length > 0 ? recordings[0] : null;

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
          className="text-2xl font-black text-[var(--text-primary)]"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          Recording & Transcript
        </h1>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 size={32} className="animate-spin text-[var(--text-muted)]" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recording Player */}
          <div className="space-y-4">
            <Card>
              <div className="flex items-center justify-between mb-4">
                <h3
                  className="text-base font-bold text-[var(--text-primary)]"
                  style={{ fontFamily: "var(--font-heading)" }}
                >
                  Recording
                </h3>
                <Badge variant="default">Meeting {meetingId.slice(0, 8)}</Badge>
              </div>

              {latestRecording ? (
                <>
                  {/* If we have a downloadUrl (webContentLink), use native video player */}
                  {latestRecording.downloadUrl ? (
                    <div className="rounded-xl overflow-hidden bg-[var(--foreground)]">
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
                  ) : (
                    <div className="flex flex-col items-center justify-center h-48 bg-[var(--foreground)] rounded-xl">
                      <Video size={28} className="text-[var(--background)]/40 mb-2" />
                      <span
                        className="text-sm text-[var(--background)]/60 mb-3"
                        style={{ fontFamily: "var(--font-body)" }}
                      >
                        Recording stored in Google Drive
                      </span>
                      {latestRecording.viewUrl && (
                        <a
                          href={latestRecording.viewUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-xs font-bold text-[#FFE600] hover:underline"
                          style={{ fontFamily: "var(--font-heading)" }}
                        >
                          <ExternalLink size={12} />
                          Open in Google Drive
                        </a>
                      )}
                    </div>
                  )}

                  <div className="flex items-center justify-between mt-3">
                    <div className="flex items-center gap-2">
                      {latestRecording.downloadUrl && (
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={isPlaying ? Pause : Play}
                          onClick={handlePlayPause}
                        >
                          {isPlaying ? "Pause" : "Play"}
                        </Button>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      {latestRecording.viewUrl && (
                        <a
                          href={latestRecording.viewUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                        >
                          <ExternalLink size={14} />
                          View in Drive
                        </a>
                      )}
                      {latestRecording.downloadUrl && (
                        <a
                          href={latestRecording.downloadUrl}
                          download
                          className="flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                        >
                          <Download size={14} />
                          Download {formatFileSize(latestRecording.size) && `(${formatFileSize(latestRecording.size)})`}
                        </a>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-32 bg-[var(--foreground)] rounded-xl">
                  <Video size={28} className="text-[var(--background)]/20 mb-2" />
                  <span
                    className="text-sm text-[var(--background)]/40"
                    style={{ fontFamily: "var(--font-body)" }}
                  >
                    No recording available
                  </span>
                </div>
              )}

              <p
                className="text-xs text-[var(--text-muted)] mt-2 text-center"
                style={{ fontFamily: "var(--font-body)" }}
              >
                {latestRecording
                  ? `Recorded ${latestRecording.createdTime ? new Date(latestRecording.createdTime).toLocaleDateString() : ""}`
                  : "Recordings are saved to your Google Drive when you record during a meeting."}
              </p>
            </Card>

            {/* All recordings list */}
            {recordings.length > 1 && (
              <Card>
                <h3
                  className="text-sm font-bold text-[var(--text-primary)] mb-3"
                  style={{ fontFamily: "var(--font-heading)" }}
                >
                  All Recordings ({recordings.length})
                </h3>
                <div className="space-y-2">
                  {recordings.map((rec) => (
                    <a
                      key={rec.fileId}
                      href={rec.viewUrl || rec.downloadUrl || "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between p-2 rounded-lg hover:bg-[var(--surface-hover)] transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <Video size={14} className="text-[var(--text-muted)]" />
                        <span className="text-xs text-[var(--text-secondary)]">
                          {rec.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {rec.createdTime && (
                          <span className="text-[10px] text-[var(--text-muted)]">
                            {new Date(rec.createdTime).toLocaleDateString()}
                          </span>
                        )}
                        {formatFileSize(rec.size) && (
                          <span className="text-[10px] text-[var(--text-muted)]">
                            {formatFileSize(rec.size)}
                          </span>
                        )}
                        <ExternalLink size={10} className="text-[var(--text-muted)]" />
                      </div>
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
                  <FileText size={16} className="text-[var(--text-primary)]" />
                  <h3
                    className="text-base font-bold text-[var(--text-primary)]"
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
                    className="mx-auto text-[var(--text-muted)] mb-3"
                  />
                  <p
                    className="text-sm text-[var(--text-muted)]"
                    style={{ fontFamily: "var(--font-body)" }}
                  >
                    No transcript available for this meeting.
                  </p>
                  <p
                    className="text-xs text-[var(--text-muted)] mt-1"
                    style={{ fontFamily: "var(--font-body)" }}
                  >
                    Enable captions during a meeting to generate a transcript.
                  </p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[500px] overflow-y-auto">
                  {segments.map((seg, i) => (
                    <div key={i} className="flex gap-3">
                      <span className="text-xs text-[var(--text-muted)] w-10 shrink-0 pt-0.5 font-mono">
                        {formatTimestamp(seg.timestamp)}
                      </span>
                      <div>
                        <span
                          className="text-xs font-bold text-[var(--text-primary)]"
                          style={{ fontFamily: "var(--font-heading)" }}
                        >
                          {seg.speaker}
                        </span>
                        <p
                          className="text-sm text-[var(--text-secondary)]"
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
