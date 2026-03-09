import type { ComputeProvider, VMInstance, VMBandwidth } from "../types";

const VULTR_API_BASE = "https://api.vultr.com/v2";
const DEFAULT_REGION = "ewr";
const DEFAULT_PLAN = "vc2-1c-1gb";
const DEFAULT_OS_ID = 1743; // Ubuntu 22.04 LTS x64

function getApiKey(): string {
  const apiKey = process.env.VULTR_API_KEY;
  if (!apiKey) {
    throw new Error("VULTR_API_KEY not configured for Vultr compute provider");
  }
  return apiKey;
}

function getHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${getApiKey()}`,
    "Content-Type": "application/json",
  };
}

/**
 * Execute a fetch request against the Vultr API and handle errors uniformly.
 */
async function vultrFetch(
  path: string,
  options: RequestInit,
  operation: string,
): Promise<Response> {
  const response = await fetch(`${VULTR_API_BASE}${path}`, {
    ...options,
    headers: getHeaders(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Vultr API error (${operation}): ${response.status} - ${errorBody}`,
    );
  }

  return response;
}

/**
 * Map a raw Vultr instance object to the VMInstance interface.
 */
function mapInstance(inst: Record<string, unknown>): VMInstance {
  return {
    id: inst.id as string,
    mainIp: (inst.main_ip as string) || "",
    status: (inst.status as string) || "unknown",
    vcpuCount: (inst.vcpu_count as number) || 0,
    ram: (inst.ram as number) || 0,
    disk: (inst.disk as number) || 0,
    region: (inst.region as string) || "",
    os: (inst.os as string) || "",
    label: (inst.label as string) || "",
    dateCreated: (inst.date_created as string) || "",
  };
}

export class VultrComputeProvider implements ComputeProvider {
  readonly name = "vultr";

  async createInstance(options: {
    label: string;
    region?: string;
    plan?: string;
    sshKeyIds?: string[];
    userData?: string;
  }): Promise<VMInstance> {
    const body: Record<string, unknown> = {
      region: options.region || DEFAULT_REGION,
      plan: options.plan || DEFAULT_PLAN,
      os_id: DEFAULT_OS_ID,
      label: options.label,
      backups: "disabled",
    };

    if (options.sshKeyIds?.length) {
      body.sshkey_id = options.sshKeyIds;
    }

    if (options.userData) {
      body.user_data = Buffer.from(options.userData).toString("base64");
    }

    const response = await vultrFetch("/instances", {
      method: "POST",
      body: JSON.stringify(body),
    }, "create");

    const data = await response.json();
    return mapInstance(data.instance);
  }

  async getInstance(instanceId: string): Promise<VMInstance> {
    const response = await vultrFetch(
      `/instances/${instanceId}`,
      { method: "GET" },
      "get",
    );

    const data = await response.json();
    return mapInstance(data.instance);
  }

  async listInstances(): Promise<VMInstance[]> {
    const response = await vultrFetch(
      "/instances",
      { method: "GET" },
      "list",
    );

    const data = await response.json();
    const instances: Record<string, unknown>[] = data.instances || [];
    return instances.map(mapInstance);
  }

  async startInstance(instanceId: string): Promise<void> {
    await vultrFetch(
      `/instances/${instanceId}/start`,
      { method: "POST" },
      "start",
    );
  }

  async stopInstance(instanceId: string): Promise<void> {
    await vultrFetch(
      `/instances/${instanceId}/halt`,
      { method: "POST" },
      "stop",
    );
  }

  async rebootInstance(instanceId: string): Promise<void> {
    await vultrFetch(
      `/instances/${instanceId}/reboot`,
      { method: "POST" },
      "reboot",
    );
  }

  async deleteInstance(instanceId: string): Promise<void> {
    await vultrFetch(
      `/instances/${instanceId}`,
      { method: "DELETE" },
      "delete",
    );
  }

  async getBandwidth(instanceId: string): Promise<VMBandwidth> {
    const response = await vultrFetch(
      `/instances/${instanceId}/bandwidth`,
      { method: "GET" },
      "bandwidth",
    );

    const data = await response.json();
    const bandwidth: Record<
      string,
      { incoming_bytes?: number; outgoing_bytes?: number }
    > = data.bandwidth || {};

    let incomingBytes = 0;
    let outgoingBytes = 0;

    for (const month of Object.values(bandwidth)) {
      incomingBytes += month.incoming_bytes || 0;
      outgoingBytes += month.outgoing_bytes || 0;
    }

    return { incomingBytes, outgoingBytes };
  }
}
