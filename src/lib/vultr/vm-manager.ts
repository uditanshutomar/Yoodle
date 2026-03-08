import { createInstance, getInstance, startInstance, stopInstance, deleteInstance } from "./client";

/**
 * Cloud-init script to provision a workspace VM with basic dev tools.
 */
function buildCloudInit(workspaceName: string): string {
  return `#!/bin/bash
set -e

# Update system
apt-get update -y && apt-get upgrade -y

# Install essential tools
apt-get install -y curl git build-essential htop tmux vim unzip

# Install Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Install Docker
curl -fsSL https://get.docker.com | bash

# Create workspace directory
mkdir -p /workspace
echo "Yoodle Workspace: ${workspaceName}" > /workspace/README.md

# Set hostname
hostnamectl set-hostname yoodle-workspace

# Success marker
echo "PROVISIONED" > /var/run/yoodle-provisioned
`;
}

/**
 * Provision a new workspace VM on Vultr.
 */
export async function provisionVM(opts: {
  workspaceName: string;
  region?: string;
  plan?: string;
}): Promise<{ instanceId: string; ipAddress: string }> {
  const { workspaceName, region = "ewr", plan = "vc2-1c-1gb" } = opts;

  const sshKeyId = process.env.VULTR_SSH_KEY_ID;
  const userData = buildCloudInit(workspaceName);

  const instance = await createInstance({
    label: `yoodle-ws-${workspaceName.toLowerCase().replace(/\s+/g, "-").slice(0, 20)}`,
    region,
    plan,
    sshKeyIds: sshKeyId ? [sshKeyId] : undefined,
    userData,
  });

  return {
    instanceId: instance.id,
    ipAddress: instance.mainIp,
  };
}

/**
 * Get VM status and details.
 */
export async function getVMStatus(instanceId: string) {
  const instance = await getInstance(instanceId);
  return {
    status: instance.status,
    ipAddress: instance.mainIp,
    vcpus: instance.vcpuCount,
    ram: instance.ram,
    disk: instance.disk,
    region: instance.region,
    os: instance.os,
  };
}

/**
 * Start a stopped VM.
 */
export async function startVM(instanceId: string): Promise<void> {
  await startInstance(instanceId);
}

/**
 * Stop a running VM.
 */
export async function stopVM(instanceId: string): Promise<void> {
  await stopInstance(instanceId);
}

/**
 * Destroy a VM permanently.
 */
export async function destroyVM(instanceId: string): Promise<void> {
  await deleteInstance(instanceId);
}
