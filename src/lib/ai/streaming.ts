import { StreamEvent } from "./gemini";

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
        // Log the real error server-side; send a generic message to the client
        // to avoid leaking internal details (API keys, paths, connection strings).
        console.error("SSE stream error:", error);
        try {
          const errorData = `data: ${JSON.stringify({ error: "An error occurred while processing your request." })}\n\n`;
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
        console.warn("streaming generator cleanup error on client disconnect", err);
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
