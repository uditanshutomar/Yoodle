# Speech-to-Text for Writing — Design

## Summary

Add hold-to-talk voice input with live streaming transcription to all text inputs (chat, AI chat, meeting chat). Consolidate STT providers from three (ElevenLabs, Deepgram, Whisper) down to Deepgram only.

## Decisions

- **Provider:** Deepgram (streaming WebSocket for voice input, batch REST for meeting transcription)
- **Interaction:** Hold-to-talk (pointerdown to start, pointerup to stop)
- **Text insertion:** Append mode — each dictation chunk appends to existing textarea content
- **Live preview:** Streaming interim results shown in textarea while holding
- **Placement:** All three text inputs (ChatThread, ChatPanel, ChatWindow)

## Architecture

### Provider Consolidation

**Remove:**
- `src/lib/stt/elevenlabs.ts`
- `src/lib/stt/whisper.ts`
- `getSTTProvider()` factory in `src/lib/stt/index.ts`
- `STT_PROVIDER` env var switching logic

**Keep:**
- `src/lib/stt/deepgram.ts` — batch transcription for meetings (nova-2, diarization)
- `src/lib/stt/types.ts` — STTProvider interface, TranscriptSegment, etc.

**Add:**
- `src/lib/stt/deepgram-stream.ts` — Deepgram streaming WebSocket helper

**Env vars:** Collapse to `DEEPGRAM_API_KEY` only. Remove `STT_PROVIDER`, `ELEVEN_LABS_API_KEY`, `STT_API_KEY`.

**Meeting transcription** continues to work identically — same nova-2 model, same diarization, same output format. Only the provider factory indirection is removed.

### Streaming STT

**WebSocket proxy route:** `src/app/api/stt/stream/route.ts`
- Client opens WebSocket to our Next.js server
- Server opens Deepgram streaming WebSocket (`wss://api.deepgram.com/v1/listen`)
- Audio flows: client → server → Deepgram → server → client
- Keeps DEEPGRAM_API_KEY server-side
- Auth check on connection (JWT cookie)

**Client hook:** `src/hooks/useSpeechToText.ts`
- `startRecording()` — getUserMedia for mic, open WS to `/api/stt/stream`, stream audio chunks
- `stopRecording()` — stop mic, close WS, return accumulated final text
- Exposes: `{ interimText, finalText, isRecording, startRecording, stopRecording }`
- No VAD needed — the user's finger on the button IS the activity detection

### UI Component

**`src/components/chat/VoiceInputButton.tsx`**
- Mic icon button next to send button
- `onPointerDown` → startRecording, button turns red/pulsing
- `onPointerUp` / `onPointerLeave` → stopRecording, appends final text
- While holding: textarea shows existing text + interim text in muted color
- On release: interim becomes regular text
- Uses pointer events for mobile compatibility

**Integration:**
- `ChatThread.tsx` — add VoiceInputButton next to send
- `ChatPanel.tsx` — same
- `ChatWindow.tsx` — same
- Each parent passes `onTranscript={(text) => setMessage(prev => prev + text)}`

### Error Handling

- No mic permission → toast "Microphone access required"
- WebSocket drops mid-recording → reconnect once, else insert captured text + toast
- Empty transcription → no-op
- Overlapping holds → ignore new pointerdown while recording
- Finger slides off button → onPointerLeave triggers stop gracefully
