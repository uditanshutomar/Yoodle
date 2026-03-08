const VULTR_API_BASE = "https://api.vultr.com/v2";

function getHeaders(): Record<string, string> {
  const apiKey = process.env.VULTR_API_KEY;
  if (!apiKey) throw new Error("VULTR_API_KEY not configured");
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

// ── Create Instance ─────────────────────────────────────────────────

export async function createInstance(options: {
  label: string;
  region?: string;
  plan?: string;
  osId?: number;
  sshKeyIds?: string[];
  userData?: string;
}): Promise<{ id: string; mainIp: string; status: string }> {
  const {
    label,
    region = "ewr",
    plan = "vc2-1c-1gb",
    osId = 1743, // Ubuntu 22.04 LTS x64
    sshKeyIds,
    userData,
  } = options;

  const body: Record<string, unknown> = {
    region,
    plan,
    os_id: osId,
    label,
    backups: "disabled",
  };

  if (sshKeyIds?.length) {
    body.sshkey_id = sshKeyIds;
  }

  if (userData) {
    body.user_data = Buffer.from(userData).toString("base64");
  }

  const res = await fetch(`${VULTR_API_BASE}/instances`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`Vultr API error (create): ${res.status} - ${errorBody}`);
  }

  const data = await res.json();
  const instance = data.instance;

  return {
    id: instance.id,
    mainIp: instance.main_ip || "",
    status: instance.status || "pending",
  };
}

// ── Get Instance ────────────────────────────────────────────────────

export async function getInstance(instanceId: string): Promise<{
  id: string;
  mainIp: string;
  status: string;
  vcpuCount: number;
  ram: number;
  disk: number;
  region: string;
  os: string;
  label: string;
  dateCreated: string;
  defaultPassword: string;
}> {
  const res = await fetch(`${VULTR_API_BASE}/instances/${instanceId}`, {
    method: "GET",
    headers: getHeaders(),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`Vultr API error (get): ${res.status} - ${errorBody}`);
  }

  const data = await res.json();
  const inst = data.instance;

  return {
    id: inst.id,
    mainIp: inst.main_ip || "",
    status: inst.status || "unknown",
    vcpuCount: inst.vcpu_count || 0,
    ram: inst.ram || 0,
    disk: inst.disk || 0,
    region: inst.region || "",
    os: inst.os || "",
    label: inst.label || "",
    dateCreated: inst.date_created || "",
    defaultPassword: inst.default_password || "",
  };
}

// ── List Instances ──────────────────────────────────────────────────

export async function listInstances(): Promise<
  Array<{
    id: string;
    mainIp: string;
    status: string;
    vcpuCount: number;
    ram: number;
    disk: number;
    region: string;
    os: string;
    label: string;
    dateCreated: string;
  }>
> {
  const res = await fetch(`${VULTR_API_BASE}/instances`, {
    method: "GET",
    headers: getHeaders(),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`Vultr API error (list): ${res.status} - ${errorBody}`);
  }

  const data = await res.json();
  const instances = data.instances || [];

  return instances.map(
    (inst: Record<string, unknown>) => ({
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
    })
  );
}

// ── Start Instance ──────────────────────────────────────────────────

export async function startInstance(instanceId: string): Promise<void> {
  const res = await fetch(`${VULTR_API_BASE}/instances/${instanceId}/start`, {
    method: "POST",
    headers: getHeaders(),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`Vultr API error (start): ${res.status} - ${errorBody}`);
  }
}

// ── Stop Instance ───────────────────────────────────────────────────

export async function stopInstance(instanceId: string): Promise<void> {
  const res = await fetch(`${VULTR_API_BASE}/instances/${instanceId}/halt`, {
    method: "POST",
    headers: getHeaders(),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`Vultr API error (stop): ${res.status} - ${errorBody}`);
  }
}

// ── Reboot Instance ─────────────────────────────────────────────────

export async function rebootInstance(instanceId: string): Promise<void> {
  const res = await fetch(`${VULTR_API_BASE}/instances/${instanceId}/reboot`, {
    method: "POST",
    headers: getHeaders(),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`Vultr API error (reboot): ${res.status} - ${errorBody}`);
  }
}

// ── Delete Instance ─────────────────────────────────────────────────

export async function deleteInstance(instanceId: string): Promise<void> {
  const res = await fetch(`${VULTR_API_BASE}/instances/${instanceId}`, {
    method: "DELETE",
    headers: getHeaders(),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`Vultr API error (delete): ${res.status} - ${errorBody}`);
  }
}

// ── Get Instance Bandwidth ──────────────────────────────────────────

export async function getInstanceBandwidth(instanceId: string): Promise<{
  incomingBytes: number;
  outgoingBytes: number;
}> {
  const res = await fetch(
    `${VULTR_API_BASE}/instances/${instanceId}/bandwidth`,
    {
      method: "GET",
      headers: getHeaders(),
    }
  );

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(
      `Vultr API error (bandwidth): ${res.status} - ${errorBody}`
    );
  }

  const data = await res.json();
  const bandwidth = data.bandwidth || {};

  // Sum up all monthly bandwidth entries
  let incomingBytes = 0;
  let outgoingBytes = 0;

  for (const month of Object.values(bandwidth) as Array<{
    incoming_bytes?: number;
    outgoing_bytes?: number;
  }>) {
    incomingBytes += month.incoming_bytes || 0;
    outgoingBytes += month.outgoing_bytes || 0;
  }

  return { incomingBytes, outgoingBytes };
}
