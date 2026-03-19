import { StreamEvent } from "./gemini";
import { createLogger } from "@/lib/infra/logger";

const log = createLogger("ai:streaming");

/**
 * Create an SSE (Server-Sent Events) streaming response from an async generator.
 *
 * Supports three event types:
 * - Text chunks: `{ text: "..." }`
 * - Tool calls: `{ type: "tool_call", name: "...", args: {...} }`
 * - Tool results: `{ type: "tool_result", name: "...", success: true, summary: "..." }`
 *
 * Sends "data: [DONE]\n\n" when the stream completes.
 * Cleans up the generator when the client disconnects (cancel).
 */
export function createStreamingResponse(
  generator: AsyncGenerator<StreamEvent>
): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of generator) {
          let payload: Record<string, unknown>;

          if (typeof chunk === "string") {
            // Text chunk
            payload = { text: chunk };
          } else {
            // Tool call or tool result — pass through as-is
            payload = chunk as Record<string, unknown>;
          }

          const data = `data: ${JSON.stringify(payload)}\n\n`;
          controller.enqueue(encoder.encode(data));
        }

        // Signal completion
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (error) {
        // Log the real error server-side; send a classified message to the client
        // to avoid leaking internal details (API keys, paths, connection strings).
        log.error({ err: error }, "SSE stream error");

        // Classify the error so the client knows whether to retry
        const errMsg = error instanceof Error ? error.message : "";
        const isTransient =
          errMsg.includes("ECONNRESET") ||
          errMsg.includes("ETIMEDOUT") ||
          errMsg.includes("socket hang up") ||
          errMsg.includes("503") ||
          errMsg.includes("429") ||
          errMsg.includes("quota");

        try {
          const errorPayload = {
            error: isTransient
              ? "The AI service is temporarily unavailable. Please try again in a moment."
              : "An error occurred while processing your request.",
            retryable: isTransient,
          };
          const errorData = `data: ${JSON.stringify(errorPayload)}\n\n`;
          controller.enqueue(encoder.encode(errorData));
          controller.close();
        } catch {
          // Controller already closed (client disconnected) — nothing to do
        }
      }
    },

    cancel() {
      // Client disconnected — clean up the generator to stop Gemini calls
      generator.return(undefined).catch((err) => {
        log.warn({ err }, "Streaming generator cleanup error on client disconnect");
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
