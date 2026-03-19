import pino from "pino";

const isDev = process.env.NODE_ENV !== "production";

export const logger = pino({
  level: process.env.LOG_LEVEL || (isDev ? "debug" : "info"),
  transport: isDev
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          ignore: "pid,hostname",
          translateTime: "HH:MM:ss",
        },
      }
    : undefined, // JSON in production
  base: {
    service: "yoodle",
  },
  serializers: {
    err: pino.stdSerializers.err,
    req: (req) => ({
      method: req.method,
      url: req.url,
    }),
  },
});

/**
 * Create a child logger with a specific module context.
 *
 * Usage:
 *   const log = createLogger("meetings:copilot");
 *   log.info({ roomId }, "User joined room");
 */
export function createLogger(module: string) {
  return logger.child({ module });
}
