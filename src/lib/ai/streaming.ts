/**
 * Create an SSE (Server-Sent Events) streaming response from an async generator.
 *
 * Encodes each chunk in SSE format: "data: {text}\n\n"
 * Sends "data: [DONE]\n\n" when the stream completes.
 */
export function createStreamingResponse(
  generator: AsyncGenerator<string>
): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of generator) {
          const data = `data: ${JSON.stringify({ text: chunk })}\n\n`;
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
