"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import WorkspaceMembers from "@/components/workspace/WorkspaceMembers";
import AuditTrail from "@/components/workspace/AuditTrail";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";

interface WorkspaceDetail {
  _id: string;
  name: string;
  description?: string;
  ownerId: string;
  members: { userId: string | { _id: string; name?: string; email?: string; displayName?: string }; role: string; joinedAt: string }[];
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
  const [activeTab, setActiveTab] = useState<"overview" | "members" | "audit">("overview");
  const [actionError, setActionError] = useState("");

  const fetchWorkspace = useCallback(async () => {
    if (!user || !workspaceId) return;
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}`, {
        credentials: "include",
      });
      const data = await res.json();
      if (data.success && data.data) setWorkspace(data.data);
    } catch {
      // workspace fetch failed
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
    } catch {
      // audit fetch failed
    }
  }, [user, workspaceId]);

  useEffect(() => {
    fetchWorkspace();
    fetchAudit();
  }, [fetchWorkspace, fetchAudit]);

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
        setActionError(data.error?.message || "Failed to add member.");
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
        setActionError(data.error?.message || "Failed to remove member.");
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
            <span className="text-xl font-black text-white">{workspace.name.charAt(0).toUpperCase()}</span>
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
      </div>

      {/* Action error */}
      {actionError && (
        <div className="bg-red-50 border-2 border-red-300 rounded-xl px-4 py-2 text-sm text-red-600" style={{ fontFamily: "var(--font-body)" }}>
          {actionError}
        </div>
      )}

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
