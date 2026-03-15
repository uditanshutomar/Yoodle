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
        const message =
          error instanceof Error ? error.message : "Stream error";
        const errorData = `data: ${JSON.stringify({ error: message })}\n\n`;
        controller.enqueue(encoder.encode(errorData));
        controller.close();
      }
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
