import type { ComputeProvider } from "../types";

let cachedProvider: ComputeProvider | null = null;

/**
 * Get the configured compute provider.
 * Selection via COMPUTE_PROVIDER env var: "vultr"
 * Defaults to "vultr" if not specified.
 */
export async function getComputeProvider(): Promise<ComputeProvider> {
  if (cachedProvider) return cachedProvider;

  const provider = process.env.COMPUTE_PROVIDER || "vultr";

  switch (provider) {
    case "vultr": {
      const { VultrComputeProvider } = await import("./vultr");
      cachedProvider = new VultrComputeProvider();
      break;
    }
    default:
      throw new Error(
        `Unknown COMPUTE_PROVIDER: "${provider}". Supported: vultr`,
      );
  }

  return cachedProvider;
}
