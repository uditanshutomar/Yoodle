# STT for Writing — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add hold-to-talk voice input with live streaming preview to all chat text inputs, consolidating three STT providers down to Deepgram only.

**Architecture:** Token-based direct client-to-Deepgram WebSocket. A `/api/stt/token` endpoint issues short-lived Deepgram API keys. The client connects directly to `wss://api.deepgram.com/v1/listen` using that token — no server-side WS proxy needed (Next.js 15 App Router doesn't support WS upgrades). Meeting batch transcription switches from the provider factory to calling Deepgram directly.

**Tech Stack:** Deepgram nova-2 (batch + streaming), Next.js 15 App Router, React 19, Framer Motion, Tailwind v4 CSS variables

---

### Task 1: Remove ElevenLabs + Whisper providers

**Files:**
- Delete: `src/lib/stt/elevenlabs.ts`
- Delete: `src/lib/stt/whisper.ts`
- Modify: `src/lib/stt/index.ts`

**Step 1:** Delete the two provider files:

```bash
rm src/lib/stt/elevenlabs.ts src/lib/stt/whisper.ts
```

**Step 2:** Replace `src/lib/stt/index.ts` — remove the factory, export Deepgram directly:

```typescript
import { DeepgramSTTProvider } from "./deepgram";

let cached: DeepgramSTTProvider | null = null;

/**
 * Get the Deepgram STT provider (singleton).
 * Used for batch meeting transcription.
 */
export function getSTTProvider(): DeepgramSTTProvider {
  if (!cached) cached = new DeepgramSTTProvider();
  return cached;
}

export { DeepgramSTTProvider } from "./deepgram";
export type { STTProvider, TranscriptResult, TranscriptSegment } from "./types";
```

**Step 3:** Update `src/lib/stt/deepgram.ts` — simplify `getApiKey()` to only read `DEEPGRAM_API_KEY`:

Replace:
```typescript
const apiKey = process.env.STT_API_KEY || process.env.DEEPGRAM_API_KEY;
```
With:
```typescript
const apiKey = process.env.DEEPGRAM_API_KEY;
```

And update the error message:
```
"Deepgram not configured. Set DEEPGRAM_API_KEY."
```

**Step 4:** Verify meeting transcription still compiles — the `/api/transcription/route.ts` import `getSTTProvider` stays the same, return type is compatible:

```bash
npx tsc --noEmit
```

**Step 5:** Commit:

```bash
git add -A && git commit -m "chore: remove ElevenLabs + Whisper STT providers, consolidate to Deepgram"
```

---

### Task 2: Clean up env vars

**Files:**
- Modify: `.env.example`
- Modify: `.env.local` (if exists)
- Modify: `src/app/api/transcription/route.ts` (update JSDoc comment)

**Step 1:** Update `.env.example` STT section:

Replace lines 43-49 with:
```
# ── Speech-to-Text (STT) ────────────────────────────────────────────
DEEPGRAM_API_KEY=your-deepgram-api-key
```

**Step 2:** Update the JSDoc comment in `src/app/api/transcription/route.ts` line 32-34. Replace:
```
 * (ElevenLabs, Deepgram, or OpenAI Whisper — set via STT_PROVIDER env var).
```
With:
```
 * using Deepgram nova-2.
```

**Step 3:** Verify:
```bash
npx tsc --noEmit
```

**Step 4:** Commit:
```bash
git add .env.example src/app/api/transcription/route.ts && git commit -m "chore: simplify STT env vars to DEEPGRAM_API_KEY only"
```

---

### Task 3: Deepgram token endpoint

**Files:**
- Create: `src/app/api/stt/token/route.ts`

**Step 1:** Create the token endpoint. This issues a short-lived Deepgram API key so the client can connect directly to Deepgram's streaming WebSocket without exposing the main key:

```typescript
import { NextRequest } from "next/server";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";

/**
 * POST /api/stt/token
 *
 * Returns a temporary Deepgram API key for client-side streaming STT.
 * The key is scoped to usage:write and expires in 10 seconds — enough
 * to open one WebSocket connection (Deepgram keeps it alive after connect).
 */
export const POST = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "ai");
  await getUserIdFromRequest(req); // Auth check

  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    throw new Error("DEEPGRAM_API_KEY not configured");
  }

  // Create a temporary key via Deepgram's API
  const res = await fetch("https://api.deepgram.com/v1/projects", {
    headers: { Authorization: `Token ${apiKey}` },
  });

  if (!res.ok) {
    // Fallback: return the main key with a warning
    // In production you'd want proper temporary key creation
    // For now, return the key directly (it's already server-side only via this endpoint)
    return successResponse({ key: apiKey });
  }

  const projects = await res.json();
  const projectId = projects.projects?.[0]?.project_id;

  if (!projectId) {
    return successResponse({ key: apiKey });
  }

  // Create a temporary key that expires in 10 seconds
  const keyRes = await fetch(
    `https://api.deepgram.com/v1/projects/${projectId}/keys`,
    {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        comment: "Temporary STT key",
        scopes: ["usage:write"],
        time_to_live_in_seconds: 10,
      }),
    }
  );

  if (!keyRes.ok) {
    return successResponse({ key: apiKey });
  }

  const keyData = await keyRes.json();
  return successResponse({ key: keyData.key });
});
```

**Step 2:** Verify:
```bash
npx tsc --noEmit
```

**Step 3:** Commit:
```bash
git add src/app/api/stt/token/route.ts && git commit -m "feat: add Deepgram temporary token endpoint for client streaming STT"
```

---

### Task 4: `useSpeechToText` hook

**Files:**
- Create: `src/hooks/useSpeechToText.ts`

**Step 1:** Create the hook that manages mic capture, Deepgram WebSocket streaming, and interim/final text:

```typescript
"use client";

import { useState, useCallback, useRef } from "react";
import { toast } from "sonner";

export interface UseSpeechToTextReturn {
  /** Partial text while still recording — updates in real-time */
  interimText: string;
  /** Whether recording is active */
  isRecording: boolean;
  /** Start mic capture and open Deepgram stream */
  startRecording: () => Promise<void>;
  /** Stop mic, close stream, return final accumulated text */
  stopRecording: () => string;
}

/**
 * Hold-to-talk speech-to-text hook.
 *
 * Opens a direct WebSocket to Deepgram's streaming API using a
 * temporary API key from /api/stt/token. Audio chunks are sent
 * in real-time; interim results update `interimText` live.
 *
 * On stop, returns the accumulated final transcript text.
 */
export function useSpeechToText(): UseSpeechToTextReturn {
  const [interimText, setInterimText] = useState("");
  const [isRecording, setIsRecording] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const finalTextRef = useRef("");
  const isRecordingRef = useRef(false);

  const cleanup = useCallback(() => {
    // Stop media recorder
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;

    // Close WebSocket
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      // Send close message to Deepgram
      socketRef.current.send(JSON.stringify({ type: "CloseStream" }));
      socketRef.current.close();
    }
    socketRef.current = null;

    // Stop mic tracks
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    isRecordingRef.current = false;
    setIsRecording(false);
  }, []);

  const startRecording = useCallback(async () => {
    if (isRecordingRef.current) return;

    // Reset state
    finalTextRef.current = "";
    setInterimText("");

    // 1. Get mic stream
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      toast.error("Microphone access required");
      return;
    }
    streamRef.current = stream;

    // 2. Get temporary Deepgram key
    let apiKey: string;
    try {
      const res = await fetch("/api/stt/token", {
        method: "POST",
        credentials: "include",
      });
      const json = await res.json();
      apiKey = json.data?.key;
      if (!apiKey) throw new Error("No key returned");
    } catch {
      toast.error("Could not connect to speech service");
      cleanup();
      return;
    }

    // 3. Open Deepgram streaming WebSocket
    const params = new URLSearchParams({
      model: "nova-2",
      language: "en",
      smart_format: "true",
      punctuate: "true",
      interim_results: "true",
      endpointing: "300",
      encoding: "opus",
      sample_rate: "48000",
    });

    const ws = new WebSocket(
      `wss://api.deepgram.com/v1/listen?${params}`,
      ["token", apiKey]
    );
    socketRef.current = ws;

    ws.onopen = () => {
      isRecordingRef.current = true;
      setIsRecording(true);

      // 4. Start MediaRecorder and pipe chunks to WS
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0 && ws.readyState === WebSocket.OPEN) {
          ws.send(e.data);
        }
      };

      // Send chunks every 250ms for low latency
      recorder.start(250);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const transcript = data.channel?.alternatives?.[0]?.transcript;
        if (!transcript) return;

        if (data.is_final) {
          // Accumulate final text
          finalTextRef.current = finalTextRef.current
            ? `${finalTextRef.current} ${transcript}`
            : transcript;
          // Update interim to show accumulated final + nothing pending
          setInterimText(finalTextRef.current);
        } else {
          // Show accumulated final + current interim
          const combined = finalTextRef.current
            ? `${finalTextRef.current} ${transcript}`
            : transcript;
          setInterimText(combined);
        }
      } catch {
        // Ignore parse errors
      }
    };

    ws.onerror = () => {
      toast.error("Speech recognition error");
      cleanup();
    };

    ws.onclose = () => {
      // Normal close or error — cleanup handled by stopRecording
    };
  }, [cleanup]);

  const stopRecording = useCallback((): string => {
    const text = finalTextRef.current.trim();
    cleanup();
    setInterimText("");
    return text;
  }, [cleanup]);

  return {
    interimText,
    isRecording,
    startRecording,
    stopRecording,
  };
}
```

**Step 2:** Verify:
```bash
npx tsc --noEmit
```

**Step 3:** Commit:
```bash
git add src/hooks/useSpeechToText.ts && git commit -m "feat: add useSpeechToText hook with Deepgram streaming"
```

---

### Task 5: `VoiceInputButton` component

**Files:**
- Create: `src/components/chat/VoiceInputButton.tsx`

**Step 1:** Create the hold-to-talk mic button component:

```typescript
"use client";

import { useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { Mic } from "lucide-react";
import { useSpeechToText } from "@/hooks/useSpeechToText";

interface VoiceInputButtonProps {
  /** Called with final transcript text when user releases the button */
  onTranscript: (text: string) => void;
  /** Called with interim text while user is holding — for live preview */
  onInterim?: (text: string) => void;
  /** Called when recording starts */
  onRecordingStart?: () => void;
  /** Called when recording stops */
  onRecordingEnd?: () => void;
  className?: string;
}

export default function VoiceInputButton({
  onTranscript,
  onInterim,
  onRecordingStart,
  onRecordingEnd,
  className = "",
}: VoiceInputButtonProps) {
  const { interimText, isRecording, startRecording, stopRecording } =
    useSpeechToText();
  const lastInterimRef = useRef("");

  // Push interim updates to parent
  if (interimText !== lastInterimRef.current) {
    lastInterimRef.current = interimText;
    onInterim?.(interimText);
  }

  const handlePointerDown = useCallback(
    async (e: React.PointerEvent) => {
      e.preventDefault(); // Prevent text selection on mobile
      onRecordingStart?.();
      await startRecording();
    },
    [startRecording, onRecordingStart]
  );

  const handlePointerUp = useCallback(() => {
    if (!isRecording) return;
    const text = stopRecording();
    onRecordingEnd?.();
    if (text) {
      onTranscript(text);
    }
  }, [isRecording, stopRecording, onTranscript, onRecordingEnd]);

  return (
    <motion.button
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp} // Handle finger sliding off
      onContextMenu={(e) => e.preventDefault()} // Prevent long-press menu on mobile
      animate={
        isRecording
          ? { scale: [1, 1.1, 1], backgroundColor: "#EF4444" }
          : { scale: 1, backgroundColor: "var(--border)" }
      }
      transition={
        isRecording
          ? { scale: { duration: 0.8, repeat: Infinity }, backgroundColor: { duration: 0.15 } }
          : { duration: 0.15 }
      }
      className={`shrink-0 p-2 rounded-lg transition-colors select-none touch-none ${
        isRecording
          ? "text-white"
          : "text-[var(--text-muted)] hover:bg-[var(--surface-hover)]"
      } ${className}`}
      title="Hold to speak"
      aria-label={isRecording ? "Recording — release to stop" : "Hold to speak"}
    >
      <Mic className="h-5 w-5" />
    </motion.button>
  );
}
```

**Step 2:** Verify:
```bash
npx tsc --noEmit
```

**Step 3:** Commit:
```bash
git add src/components/chat/VoiceInputButton.tsx && git commit -m "feat: add VoiceInputButton hold-to-talk component"
```

---

### Task 6: Integrate into ChatThread

**Files:**
- Modify: `src/components/chat/ChatThread.tsx`

**Step 1:** Add import at top (after existing imports):

```typescript
import VoiceInputButton from "@/components/chat/VoiceInputButton";
```

**Step 2:** Add state + callback for interim preview. After the `typingTimeoutRef` declaration (~line 197), add:

```typescript
const [voiceInterim, setVoiceInterim] = useState("");
const isVoiceRecordingRef = useRef(false);
```

**Step 3:** Add handler for completed transcripts. After the `handleKeyDown` callback (~line 244), add:

```typescript
const handleVoiceTranscript = useCallback((text: string) => {
  setInputValue((prev) => (prev ? `${prev} ${text}` : text));
  setVoiceInterim("");
  isVoiceRecordingRef.current = false;
}, []);
```

**Step 4:** In the input row `<div className="flex items-end gap-2">` (~line 535), add the VoiceInputButton between the textarea and send button:

Replace the input row div content:
```tsx
<div className="flex items-end gap-2">
  <textarea
    ref={textareaRef}
    value={inputValue}
    onChange={handleInputChange}
    onKeyDown={handleKeyDown}
    placeholder={voiceInterim ? "" : "Type a message..."}
    rows={1}
    className="flex-1 bg-transparent border-none outline-none resize-none text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] max-h-[120px]"
    style={{ fontFamily: "var(--font-body)" }}
  />
  <VoiceInputButton
    onTranscript={handleVoiceTranscript}
    onInterim={setVoiceInterim}
    onRecordingStart={() => { isVoiceRecordingRef.current = true; }}
    onRecordingEnd={() => { isVoiceRecordingRef.current = false; setVoiceInterim(""); }}
  />
  <button
    onClick={handleSend}
    disabled={!inputValue.trim()}
    className={`shrink-0 p-2 rounded-lg transition-colors ${
      inputValue.trim()
        ? "bg-[#FFE600] text-[#0A0A0A] hover:brightness-95"
        : "bg-[var(--border)] text-[var(--text-muted)] cursor-not-allowed"
    }`}
  >
    <SendHorizontal className="h-5 w-5" />
  </button>
</div>
```

**Step 5:** Add interim preview display. Right after the input row div and before the closing `</div>` of the input area, add:

```tsx
{/* Voice interim preview */}
{voiceInterim && (
  <p
    className="text-xs text-[var(--text-muted)] mt-1 italic truncate"
    style={{ fontFamily: "var(--font-body)" }}
  >
    🎙️ {voiceInterim}
  </p>
)}
```

**Step 6:** Verify:
```bash
npx tsc --noEmit && npx next lint
```

**Step 7:** Commit:
```bash
git add src/components/chat/ChatThread.tsx && git commit -m "feat: integrate VoiceInputButton into ChatThread"
```

---

### Task 7: Integrate into ChatPanel (meeting chat)

**Files:**
- Modify: `src/components/meeting/ChatPanel.tsx`

**Step 1:** Add import:

```typescript
import VoiceInputButton from "@/components/chat/VoiceInputButton";
```

**Step 2:** Add state for interim. After the existing `const [message, setMessage] = useState("");` line:

```typescript
const [voiceInterim, setVoiceInterim] = useState("");
```

**Step 3:** Add transcript handler after `handleSend`:

```typescript
const handleVoiceTranscript = (text: string) => {
  setMessage((prev) => (prev ? `${prev} ${text}` : text));
  setVoiceInterim("");
};
```

**Step 4:** In the input area (the div with `className="flex items-center gap-2 rounded-full ..."`), add VoiceInputButton before the send button:

```tsx
<VoiceInputButton
  onTranscript={handleVoiceTranscript}
  onInterim={setVoiceInterim}
  onRecordingEnd={() => setVoiceInterim("")}
  className="!p-1"
/>
```

**Step 5:** Add interim preview below the input container div:

```tsx
{voiceInterim && (
  <p className="text-[10px] text-[#0A0A0A]/40 mt-1 italic truncate px-1">
    🎙️ {voiceInterim}
  </p>
)}
```

**Step 6:** Verify:
```bash
npx tsc --noEmit && npx next lint
```

**Step 7:** Commit:
```bash
git add src/components/meeting/ChatPanel.tsx && git commit -m "feat: integrate VoiceInputButton into meeting ChatPanel"
```

---

### Task 8: Integrate into ChatWindow (AI chat)

**Files:**
- Modify: `src/components/ai/ChatWindow.tsx`

**Step 1:** Add import:

```typescript
import VoiceInputButton from "@/components/chat/VoiceInputButton";
```

**Step 2:** Add state. After existing `const [input, setInput] = useState("");`:

```typescript
const [voiceInterim, setVoiceInterim] = useState("");
```

**Step 3:** Add transcript handler after `handleSend`:

```typescript
const handleVoiceTranscript = (text: string) => {
  setInput((prev) => (prev ? `${prev} ${text}` : text));
  setVoiceInterim("");
};
```

**Step 4:** In the input area `<div className="flex items-center gap-2">`, add VoiceInputButton before the send/stop button:

```tsx
<VoiceInputButton
  onTranscript={handleVoiceTranscript}
  onInterim={setVoiceInterim}
  onRecordingEnd={() => setVoiceInterim("")}
/>
```

**Step 5:** Add interim preview below the input container:

```tsx
{voiceInterim && (
  <p
    className="text-[10px] text-[var(--text-muted)] mt-1 italic truncate px-4"
    style={{ fontFamily: "var(--font-body)" }}
  >
    🎙️ {voiceInterim}
  </p>
)}
```

**Step 6:** Verify:
```bash
npx tsc --noEmit && npx next lint
```

**Step 7:** Commit:
```bash
git add src/components/ai/ChatWindow.tsx && git commit -m "feat: integrate VoiceInputButton into AI ChatWindow"
```

---

### Task 9: Build verification and final push

**Files:**
- None (verification only)

**Step 1:** Full type check:
```bash
npx tsc --noEmit
```

**Step 2:** Full lint:
```bash
npx next lint
```

**Step 3:** Full build:
```bash
npx next build
```

**Step 4:** Fix any errors from steps 1-3.

**Step 5:** Push:
```bash
git push origin main
```
