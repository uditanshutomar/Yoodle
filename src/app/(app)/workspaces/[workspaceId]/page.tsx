"use client";

import { useEffect, useState, useCallback, lazy, Suspense } from "react";
import { useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Server, ArrowLeft, Play, Square, Trash2, Terminal as TerminalIcon } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import VMStatusBadge from "@/components/workspace/VMStatusBadge";
import WorkspaceMembers from "@/components/workspace/WorkspaceMembers";
import AuditTrail from "@/components/workspace/AuditTrail";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";

const WorkspaceTerminal = lazy(() => import("@/components/workspace/WorkspaceTerminal"));

interface WorkspaceDetail {
  _id: string;
  name: string;
  description?: string;
  ownerId: string;
  members: { userId: string | { _id: string; name?: string; email?: string; displayName?: string }; role: string; joinedAt: string }[];
  vm?: { vultrInstanceId: string; status: string; ipAddress: string; region: string; plan: string };
  settings: { autoShutdown: boolean; shutdownAfterMinutes: number };
}

interface AuditEntry {
  _id: string;
  action: string;
  userName: string;
  details?: Record<string, unknown>;
  createdAt: string;
}

export default function WorkspaceDetailPage() {
  const params = useParams();
  const workspaceId = params?.workspaceId as string;
  const { user } = useAuth();

  const [workspace, setWorkspace] = useState<WorkspaceDetail | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [vmLoading, setVmLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "members" | "audit">("overview");
  const [actionError, setActionError] = useState("");
  const [showTerminal, setShowTerminal] = useState(false);
  const [liveVMStatus, setLiveVMStatus] = useState<string | null>(null);

  const fetchVMStatus = useCallback(async () => {
    if (!user || !workspaceId) return;
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/vm`, {
        credentials: "include",
      });
      const data = await res.json();
      if (data.success && data.data?.appStatus) {
        setLiveVMStatus(data.data.appStatus);
      }
    } catch (err) {
      console.error("[VM Status Poll]", err);
    }
  }, [user, workspaceId]);

  const fetchWorkspace = useCallback(async () => {
    if (!user || !workspaceId) return;
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}`, {
        credentials: "include",
      });
      const data = await res.json();
      if (data.success && data.data) setWorkspace(data.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [user, workspaceId]);

  const fetchAudit = useCallback(async () => {
    if (!user || !workspaceId) return;
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/audit`, {
        credentials: "include",
      });
      const data = await res.json();
      if (data.success && data.data) setAuditLogs(data.data.logs || []);
    } catch (err) {
      console.error(err);
    }
  }, [user, workspaceId]);

  useEffect(() => {
    fetchWorkspace();
    fetchAudit();
  }, [fetchWorkspace, fetchAudit]);

  // Poll VM status while provisioning so the UI updates once the VM is ready
  useEffect(() => {
    const vmStatus = liveVMStatus || workspace?.vm?.status;
    if (vmStatus !== "provisioning") return;

    // Initial fetch
    fetchVMStatus();

    const interval = setInterval(() => {
      fetchVMStatus();
      fetchWorkspace(); // re-fetch workspace to get synced DB status
    }, 5000);

    return () => clearInterval(interval);
  }, [workspace?.vm?.status, liveVMStatus, fetchVMStatus, fetchWorkspace]);

  const handleVMAction = async (action: string) => {
    if (!user) return;
    setVmLoading(true);
    setActionError("");
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/vm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action }),
      });
      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        setActionError(`Server error (${res.status}). Try again in a moment.`);
      } else {
        const data = await res.json();
        if (!data.success) {
          setActionError(data.error || `Failed to ${action} VM.`);
        }
      }
      await fetchWorkspace();
      await fetchAudit();
    } catch {
      setActionError(`Failed to ${action} VM. Check your connection.`);
    } finally {
      setVmLoading(false);
    }
  };

  const handleAddMember = async (email: string, role: string) => {
    if (!user) return;
    setActionError("");
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, role }),
      });
      const data = await res.json();
      if (!data.success) {
        setActionError(data.error || "Failed to add member.");
      }
      await fetchWorkspace();
      await fetchAudit();
    } catch {
      setActionError("Failed to add member. Check your connection.");
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!user) return;
    setActionError("");
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/members?memberId=${memberId}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json();
      if (!data.success) {
        setActionError(data.error || "Failed to remove member.");
      }
      await fetchWorkspace();
      await fetchAudit();
    } catch {
      setActionError("Failed to remove member. Check your connection.");
    }
  };

  const isAdmin = workspace?.members.some((m) => {
    const id = typeof m.userId === "object" ? m.userId._id : m.userId;
    return id === user?.id && (m.role === "owner" || m.role === "admin");
  }) || false;

  // Use live-polled VM status when available, falling back to workspace DB status
  const effectiveVMStatus = liveVMStatus || workspace?.vm?.status;
  const vmIsRunning = effectiveVMStatus === "running";

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="w-8 h-8 border-3 border-[#06B6D4] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="text-center py-20">
        <h2 className="text-xl font-bold" style={{ fontFamily: "var(--font-heading)" }}>Workspace not found</h2>
        <Link href="/workspaces"><Button variant="secondary" size="md" icon={ArrowLeft} className="mt-4">Back</Button></Link>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <Link href="/workspaces" className="inline-flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[#06B6D4] transition-colors" style={{ fontFamily: "var(--font-body)" }}>
        <ArrowLeft size={14} /> Back to Workspaces
      </Link>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#06B6D4] border-2 border-[#0A0A0A]">
            <Server size={24} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-[var(--text-primary)]" style={{ fontFamily: "var(--font-heading)" }}>
              {workspace.name}
            </h1>
            {workspace.description && (
              <p className="text-xs text-[var(--text-muted)]" style={{ fontFamily: "var(--font-body)" }}>{workspace.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {vmIsRunning && (
            <Button
              variant="primary"
              size="md"
              icon={TerminalIcon}
              onClick={() => setShowTerminal(!showTerminal)}
              className="!bg-[#0A0A0A] !border-[#0A0A0A] !text-[#06B6D4]"
            >
              {showTerminal ? "Hide Terminal" : "Open Terminal"}
            </Button>
          )}
          {workspace.vm && <VMStatusBadge status={effectiveVMStatus || workspace.vm.status} />}
        </div>
      </div>

      {/* Action error */}
      {actionError && (
        <div className="bg-red-50 border-2 border-red-300 rounded-xl px-4 py-2 text-sm text-red-600" style={{ fontFamily: "var(--font-body)" }}>
          {actionError}
        </div>
      )}

      {/* Terminal Panel */}
      <AnimatePresence>
        {showTerminal && vmIsRunning && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 450 }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <Suspense
              fallback={
                <div className="h-[450px] bg-[#0A0A0A] rounded-xl border-2 border-[#0A0A0A] flex items-center justify-center">
                  <div className="flex items-center gap-2 text-white/60">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      className="w-5 h-5 border-2 border-[#06B6D4] border-t-transparent rounded-full"
                    />
                    <span className="text-sm font-mono">Loading terminal...</span>
                  </div>
                </div>
              }
            >
              <WorkspaceTerminal
                workspaceId={workspaceId}
                onClose={() => setShowTerminal(false)}
              />
            </Suspense>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tabs */}
      <div className="flex gap-1 bg-[var(--surface-hover)] p-1 rounded-xl w-fit">
        {(["overview", "members", "audit"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-bold rounded-lg transition-all ${
              activeTab === tab ? "bg-[var(--surface)] shadow-sm text-[var(--text-primary)]" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            }`}
            style={{ fontFamily: "var(--font-heading)" }}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* VM Control */}
          <Card className="!p-6 !border-[#06B6D4] !shadow-[4px_4px_0_#06B6D4]">
            <h3 className="text-base font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2" style={{ fontFamily: "var(--font-heading)" }}>
              <TerminalIcon size={16} className="text-[#06B6D4]" /> Virtual Machine
            </h3>

            {workspace.vm ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-xs" style={{ fontFamily: "var(--font-body)" }}>
                  <div><span className="text-[var(--text-muted)]">IP:</span> <span className="font-mono font-bold">{workspace.vm.ipAddress || "Pending"}</span></div>
                  <div><span className="text-[var(--text-muted)]">Region:</span> <span className="font-bold">{workspace.vm.region}</span></div>
                  <div><span className="text-[var(--text-muted)]">Plan:</span> <span className="font-bold">{workspace.vm.plan}</span></div>
                  <div><span className="text-[var(--text-muted)]">Status:</span> <VMStatusBadge status={effectiveVMStatus || workspace.vm.status} /></div>
                </div>
                {effectiveVMStatus === "provisioning" && (
                  <div className="flex items-center gap-2 py-2 px-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full"
                    />
                    <span className="text-xs text-amber-700" style={{ fontFamily: "var(--font-body)" }}>
                      VM is provisioning. This typically takes 1–2 minutes...
                    </span>
                  </div>
                )}
                {isAdmin && (
                  <div className="flex gap-2 pt-2">
                    {(effectiveVMStatus === "stopped" || effectiveVMStatus === "provisioning") && (
                      <Button variant="primary" size="sm" icon={Play} onClick={() => handleVMAction("start")} disabled={vmLoading || effectiveVMStatus === "provisioning"} className="!bg-[#10B981] !border-[#0A0A0A] !text-white">Start</Button>
                    )}
                    {vmIsRunning && !showTerminal && (
                      <Button variant="primary" size="sm" icon={TerminalIcon} onClick={() => setShowTerminal(true)} className="!bg-[#0A0A0A] !border-[#0A0A0A] !text-[#06B6D4]">Terminal</Button>
                    )}
                    {vmIsRunning && (
                      <Button variant="secondary" size="sm" icon={Square} onClick={() => handleVMAction("stop")} disabled={vmLoading}>Stop</Button>
                    )}
                    <Button variant="ghost" size="sm" icon={Trash2} onClick={() => handleVMAction("destroy")} disabled={vmLoading} className="!text-red-500">Destroy</Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-6">
                <p className="text-sm text-[var(--text-muted)] mb-4" style={{ fontFamily: "var(--font-body)" }}>No VM provisioned yet</p>
                {isAdmin && (
                  <Button variant="primary" size="md" icon={Server} onClick={() => handleVMAction("provision")} disabled={vmLoading} className="!bg-[#06B6D4] !border-[#0A0A0A] !text-white">
                    {vmLoading ? "Provisioning..." : "Provision VM"}
                  </Button>
                )}
              </div>
            )}
          </Card>

          {/* Quick Stats */}
          <Card className="!p-6">
            <h3 className="text-base font-bold text-[var(--text-primary)] mb-4" style={{ fontFamily: "var(--font-heading)" }}>
              Quick Stats
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-4 bg-[#06B6D4]/5 rounded-xl">
                <p className="text-2xl font-black text-[#06B6D4]" style={{ fontFamily: "var(--font-heading)" }}>{workspace.members.length}</p>
                <p className="text-xs text-[var(--text-muted)]" style={{ fontFamily: "var(--font-body)" }}>Members</p>
              </div>
              <div className="text-center p-4 bg-[#FFE600]/10 rounded-xl">
                <p className="text-2xl font-black text-[var(--text-primary)]" style={{ fontFamily: "var(--font-heading)" }}>{auditLogs.length}</p>
                <p className="text-xs text-[var(--text-muted)]" style={{ fontFamily: "var(--font-body)" }}>Actions</p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {activeTab === "members" && (
        <Card className="!p-6">
          <WorkspaceMembers
            members={workspace.members}
            isAdmin={isAdmin}
            onAddMember={handleAddMember}
            onRemoveMember={handleRemoveMember}
          />
        </Card>
      )}

      {activeTab === "audit" && (
        <Card className="!p-6">
          <h3 className="text-base font-bold text-[var(--text-primary)] mb-4" style={{ fontFamily: "var(--font-heading)" }}>
            Activity Log
          </h3>
          <AuditTrail entries={auditLogs} />
        </Card>
      )}
    </motion.div>
  );
}
