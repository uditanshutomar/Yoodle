"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Building2, Plus, ChevronDown, ChevronRight, Trash2, UserPlus, ScrollText, X } from "lucide-react";
import Card from "@/components/ui/Card";
import { useAuth } from "@/hooks/useAuth";
import {
  useWorkspaces,
  type Workspace,
  type WorkspaceMember,
  type AuditLogEntry,
} from "@/hooks/useWorkspaces";

/* ─── Helpers ─── */

function getMemberId(member: WorkspaceMember): string {
  if (typeof member.userId === "object" && member.userId !== null) {
    return member.userId._id;
  }
  return member.userId as string;
}

function getMemberName(member: WorkspaceMember): string {
  if (typeof member.userId === "object" && member.userId !== null) {
    return member.userId.displayName || member.userId.name || member.userId.email || "Unknown";
  }
  return String(member.userId);
}

function getMemberEmail(member: WorkspaceMember): string {
  if (typeof member.userId === "object" && member.userId !== null) {
    return member.userId.email || "";
  }
  return "";
}

function getUserRole(workspace: Workspace, userId: string): "owner" | "admin" | "member" | null {
  if (workspace.ownerId === userId) return "owner";
  const member = workspace.members.find((m) => getMemberId(m) === userId);
  return member?.role ?? null;
}

function isAdminOrOwner(workspace: Workspace, userId: string): boolean {
  const role = getUserRole(workspace, userId);
  return role === "owner" || role === "admin";
}

/* ─── Role Badge ─── */

function RoleBadge({ role }: { role: string }) {
  const styles: Record<string, string> = {
    owner: "bg-[#FFE600] text-[#1a1a1a]",
    admin: "bg-[#A855F7] text-white",
    member: "bg-[var(--surface-hover)] text-[var(--text-secondary)]",
  };
  return (
    <span
      className={`inline-block text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${styles[role] || styles.member}`}
      style={{ fontFamily: "var(--font-heading)" }}
    >
      {role}
    </span>
  );
}

/* ─── Main Component ─── */

export default function WorkspaceSection() {
  const { user } = useAuth();
  const {
    workspaces,
    loading,
    error,
    fetchWorkspaces,
    createWorkspace,
    updateWorkspace,
    deleteWorkspace,
    fetchMembers,
    addMember,
    removeMember,
    fetchAuditLogs,
  } = useWorkspaces();

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetchWorkspaces().catch((err: unknown) => {
      console.error("[WorkspaceSection] Failed to load workspaces:", err);
    });
  }, [fetchWorkspaces]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      await createWorkspace(newName.trim(), newDesc.trim() || undefined);
      setNewName("");
      setNewDesc("");
      setShowCreate(false);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create workspace");
    } finally {
      setCreating(false);
    }
  };

  const userId = user?.id || "";

  return (
    <Card className="!p-6">
      <h2
        className="flex items-center gap-2 text-base font-bold text-[var(--text-primary)] mb-4"
        style={{ fontFamily: "var(--font-heading)" }}
      >
        <Building2 size={16} /> Workspaces
      </h2>

      {/* Error */}
      {error && (
        <div className="text-sm text-[#FF6B6B] mb-3" style={{ fontFamily: "var(--font-body)" }}>
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && workspaces.length === 0 && (
        <p className="text-sm text-[var(--text-muted)]" style={{ fontFamily: "var(--font-body)" }}>
          Loading workspaces...
        </p>
      )}

      {/* Empty */}
      {!loading && workspaces.length === 0 && !error && (
        <p className="text-sm text-[var(--text-muted)]" style={{ fontFamily: "var(--font-body)" }}>
          No workspaces yet
        </p>
      )}

      {/* Workspace list */}
      <div className="space-y-2 mb-4">
        {workspaces.map((ws) => (
          <WorkspaceItem
            key={ws._id}
            workspace={ws}
            userId={userId}
            isExpanded={expandedId === ws._id}
            onToggle={() => setExpandedId(expandedId === ws._id ? null : ws._id)}
            onUpdate={updateWorkspace}
            onDelete={deleteWorkspace}
            onFetchMembers={fetchMembers}
            onAddMember={addMember}
            onRemoveMember={removeMember}
            onFetchAuditLogs={fetchAuditLogs}
          />
        ))}
      </div>

      {/* Create workspace */}
      {!showCreate ? (
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 text-sm font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          <Plus size={14} /> Create Workspace
        </button>
      ) : (
        <div className="border-2 border-[var(--border)] rounded-xl p-4 space-y-3">
          <input
            type="text"
            placeholder="Workspace name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="w-full px-4 py-2.5 text-sm border-2 border-[var(--border)] rounded-xl bg-[var(--surface)] text-[var(--text-primary)] focus:border-[#FFE600] focus:outline-none"
            style={{ fontFamily: "var(--font-body)" }}
          />
          <input
            type="text"
            placeholder="Description (optional)"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            className="w-full px-4 py-2.5 text-sm border-2 border-[var(--border)] rounded-xl bg-[var(--surface)] text-[var(--text-primary)] focus:border-[#FFE600] focus:outline-none"
            style={{ fontFamily: "var(--font-body)" }}
          />
          {createError && (
            <p className="text-xs text-[#FF6B6B]" style={{ fontFamily: "var(--font-body)" }}>{createError}</p>
          )}
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={creating || !newName.trim()}
              className="px-4 py-2 text-sm font-bold rounded-xl bg-[#FFE600] text-[#1a1a1a] hover:bg-[#FFE600]/90 transition-colors disabled:opacity-50"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              {creating ? "Creating..." : "Create"}
            </button>
            <button
              onClick={() => { setShowCreate(false); setNewName(""); setNewDesc(""); setCreateError(null); }}
              className="px-4 py-2 text-sm font-bold rounded-xl border-2 border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}

/* ─── Workspace Item ─── */

interface WorkspaceItemProps {
  workspace: Workspace;
  userId: string;
  isExpanded: boolean;
  onToggle: () => void;
  onUpdate: (id: string, data: { name?: string; description?: string; settings?: { autoShutdown?: boolean; shutdownAfterMinutes?: number } }) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
  onFetchMembers: (id: string) => Promise<WorkspaceMember[]>;
  onAddMember: (id: string, email: string, role: "member" | "admin") => Promise<unknown>;
  onRemoveMember: (workspaceId: string, memberId: string) => Promise<unknown>;
  onFetchAuditLogs: (id: string) => Promise<AuditLogEntry[]>;
}

function WorkspaceItem({
  workspace,
  userId,
  isExpanded,
  onToggle,
  onUpdate,
  onDelete,
  onFetchMembers,
  onAddMember,
  onRemoveMember,
  onFetchAuditLogs,
}: WorkspaceItemProps) {
  const role = getUserRole(workspace, userId);
  const canEdit = isAdminOrOwner(workspace, userId);
  const isOwner = role === "owner";

  // Detail state
  const [editName, setEditName] = useState(workspace.name);
  const [editDesc, setEditDesc] = useState(workspace.description || "");
  const [saving, setSaving] = useState(false);

  // Per-operation error feedback
  const [opError, setOpError] = useState<string | null>(null);

  // Members
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [membersLoaded, setMembersLoaded] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState<"member" | "admin">("member");
  const [addingMember, setAddingMember] = useState(false);

  // Settings
  const [autoShutdown, setAutoShutdown] = useState(workspace.settings?.autoShutdown ?? true);
  const [shutdownMinutes, setShutdownMinutes] = useState(workspace.settings?.shutdownAfterMinutes ?? 60);

  // Audit
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [showAudit, setShowAudit] = useState(false);
  const [auditLoaded, setAuditLoaded] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);

  // Delete confirm
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Load members when expanded
  const loadMembers = useCallback(async () => {
    if (membersLoaded) return;
    setMembersError(null);
    try {
      const data = await onFetchMembers(workspace._id);
      setMembers(data);
      setMembersLoaded(true);
    } catch (err) {
      setMembersLoaded(true); // prevent infinite retry loop
      setMembersError(err instanceof Error ? err.message : "Failed to load members");
    }
  }, [membersLoaded, onFetchMembers, workspace._id]);

  useEffect(() => {
    if (isExpanded && !membersLoaded) {
      loadMembers();
    }
  }, [isExpanded, membersLoaded, loadMembers]);

  // Sync local state when workspace prop changes
  useEffect(() => {
    setEditName(workspace.name);
    setEditDesc(workspace.description || "");
    setAutoShutdown(workspace.settings?.autoShutdown ?? true);
    setShutdownMinutes(workspace.settings?.shutdownAfterMinutes ?? 60);
  }, [workspace]);

  // Auto-clear operation errors after 4s
  useEffect(() => {
    if (!opError) return;
    const t = setTimeout(() => setOpError(null), 4000);
    return () => clearTimeout(t);
  }, [opError]);

  const handleSave = async () => {
    const mins = Math.max(5, shutdownMinutes);
    setSaving(true);
    setOpError(null);
    try {
      await onUpdate(workspace._id, {
        name: editName.trim(),
        description: editDesc.trim(),
        settings: { autoShutdown, shutdownAfterMinutes: mins },
      });
    } catch (err) {
      setOpError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleAddMember = async () => {
    if (!memberEmail.trim()) return;
    setAddingMember(true);
    setOpError(null);
    try {
      await onAddMember(workspace._id, memberEmail.trim(), memberRole);
      setMemberEmail("");
      setMemberRole("member");
      setMembersLoaded(false);
    } catch (err) {
      setOpError(err instanceof Error ? err.message : "Failed to add member");
    } finally {
      setAddingMember(false);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    setOpError(null);
    try {
      await onRemoveMember(workspace._id, memberId);
      setMembersLoaded(false);
    } catch (err) {
      setOpError(err instanceof Error ? err.message : "Failed to remove member");
    }
  };

  const handleToggleAudit = async () => {
    if (!showAudit && !auditLoaded) {
      setAuditError(null);
      try {
        const logs = await onFetchAuditLogs(workspace._id);
        setAuditLogs(logs);
        setAuditLoaded(true);
      } catch (err) {
        setAuditLoaded(true);
        setAuditError(err instanceof Error ? err.message : "Failed to load audit logs");
      }
    }
    setShowAudit(!showAudit);
  };

  const handleDelete = async () => {
    setDeleting(true);
    setOpError(null);
    try {
      await onDelete(workspace._id);
      setConfirmDelete(false);
    } catch (err) {
      setOpError(err instanceof Error ? err.message : "Failed to delete workspace");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="border-2 border-[var(--border)] rounded-xl overflow-hidden">
      {/* Header row */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-[var(--surface-hover)] transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span
            className="text-sm font-bold text-[var(--text-primary)]"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            {workspace.name}
          </span>
          {role && <RoleBadge role={role} />}
        </div>
        <span className="text-xs text-[var(--text-muted)]" style={{ fontFamily: "var(--font-body)" }}>
          {workspace.members.length} member{workspace.members.length !== 1 ? "s" : ""}
        </span>
      </button>

      {/* Expandable detail */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-5 border-t-2 border-[var(--border)] pt-4">
              {/* Operation error banner */}
              {opError && (
                <div className="text-xs text-[#FF6B6B] bg-[#FF6B6B]/5 border border-[#FF6B6B]/20 rounded-lg px-3 py-2" style={{ fontFamily: "var(--font-body)" }}>
                  {opError}
                </div>
              )}

              {/* Edit name/description */}
              {canEdit && (
                <div className="space-y-3">
                  <label className="text-xs font-bold text-[var(--text-secondary)] block" style={{ fontFamily: "var(--font-heading)" }}>
                    Name
                  </label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full px-4 py-2.5 text-sm border-2 border-[var(--border)] rounded-xl bg-[var(--surface)] text-[var(--text-primary)] focus:border-[#FFE600] focus:outline-none"
                    style={{ fontFamily: "var(--font-body)" }}
                  />
                  <label className="text-xs font-bold text-[var(--text-secondary)] block" style={{ fontFamily: "var(--font-heading)" }}>
                    Description
                  </label>
                  <input
                    type="text"
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    className="w-full px-4 py-2.5 text-sm border-2 border-[var(--border)] rounded-xl bg-[var(--surface)] text-[var(--text-primary)] focus:border-[#FFE600] focus:outline-none"
                    style={{ fontFamily: "var(--font-body)" }}
                  />

                  {/* Auto-shutdown settings */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-[var(--text-primary)]" style={{ fontFamily: "var(--font-heading)" }}>
                        Auto-shutdown
                      </p>
                      <p className="text-xs text-[var(--text-secondary)]" style={{ fontFamily: "var(--font-body)" }}>
                        Automatically shut down idle rooms
                      </p>
                    </div>
                    <button
                      onClick={() => setAutoShutdown(!autoShutdown)}
                      className={`relative w-11 h-6 rounded-full border-2 border-[var(--border-strong)] transition-colors ${
                        autoShutdown ? "bg-[#FFE600]" : "bg-[var(--text-muted)]"
                      }`}
                    >
                      <motion.div
                        className="absolute top-0.5 w-4 h-4 rounded-full bg-[var(--foreground)]"
                        animate={{ left: autoShutdown ? "calc(100% - 20px)" : "2px" }}
                        transition={{ type: "spring", stiffness: 500, damping: 30 }}
                      />
                    </button>
                  </div>

                  {autoShutdown && (
                    <div>
                      <label className="text-xs font-bold text-[var(--text-secondary)] block mb-1" style={{ fontFamily: "var(--font-heading)" }}>
                        Shutdown after (minutes)
                      </label>
                      <input
                        type="number"
                        min={5}
                        value={shutdownMinutes}
                        onChange={(e) => setShutdownMinutes(Math.max(5, Number(e.target.value) || 5))}
                        className="w-32 px-4 py-2.5 text-sm border-2 border-[var(--border)] rounded-xl bg-[var(--surface)] text-[var(--text-primary)] focus:border-[#FFE600] focus:outline-none"
                        style={{ fontFamily: "var(--font-body)" }}
                      />
                    </div>
                  )}

                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="px-4 py-2 text-sm font-bold rounded-xl bg-[#FFE600] text-[#1a1a1a] hover:bg-[#FFE600]/90 transition-colors disabled:opacity-50"
                    style={{ fontFamily: "var(--font-heading)" }}
                  >
                    {saving ? "Saving..." : "Save"}
                  </button>
                </div>
              )}

              {/* Members list */}
              <div>
                <h3 className="text-xs font-bold text-[var(--text-secondary)] mb-2" style={{ fontFamily: "var(--font-heading)" }}>
                  Members
                </h3>
                {!membersLoaded && !membersError && (
                  <p className="text-xs text-[var(--text-muted)]" style={{ fontFamily: "var(--font-body)" }}>
                    Loading members...
                  </p>
                )}
                {membersError && (
                  <div className="flex items-center gap-2 text-xs text-[#FF6B6B] mb-2" style={{ fontFamily: "var(--font-body)" }}>
                    <span>{membersError}</span>
                    <button
                      onClick={() => { setMembersLoaded(false); setMembersError(null); }}
                      className="underline hover:no-underline"
                    >
                      Retry
                    </button>
                  </div>
                )}
                <div className="space-y-1">
                  {members.map((m) => {
                    const mid = getMemberId(m);
                    const mRole = m.role;
                    const isOwnerMember = mRole === "owner";
                    return (
                      <div key={mid} className="flex items-center justify-between py-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-[var(--text-primary)]" style={{ fontFamily: "var(--font-body)" }}>
                            {getMemberName(m)}
                          </span>
                          {getMemberEmail(m) && (
                            <span className="text-xs text-[var(--text-muted)]" style={{ fontFamily: "var(--font-body)" }}>
                              ({getMemberEmail(m)})
                            </span>
                          )}
                          <RoleBadge role={mRole} />
                        </div>
                        {canEdit && !isOwnerMember && mid !== userId && (
                          <button
                            onClick={() => handleRemoveMember(mid)}
                            className="text-[#FF6B6B] hover:text-[#FF4444] transition-colors"
                            title="Remove member"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Add member form */}
                {canEdit && (
                  <div className="flex items-center gap-2 mt-3">
                    <input
                      type="email"
                      placeholder="Email address"
                      value={memberEmail}
                      onChange={(e) => setMemberEmail(e.target.value)}
                      className="flex-1 px-3 py-2 text-sm border-2 border-[var(--border)] rounded-xl bg-[var(--surface)] text-[var(--text-primary)] focus:border-[#FFE600] focus:outline-none"
                      style={{ fontFamily: "var(--font-body)" }}
                    />
                    <select
                      value={memberRole}
                      onChange={(e) => setMemberRole(e.target.value as "member" | "admin")}
                      className="px-3 py-2 text-sm border-2 border-[var(--border)] rounded-xl bg-[var(--surface)] text-[var(--text-primary)] focus:border-[#FFE600] focus:outline-none"
                      style={{ fontFamily: "var(--font-body)" }}
                    >
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                    </select>
                    <button
                      onClick={handleAddMember}
                      disabled={addingMember || !memberEmail.trim()}
                      className="flex items-center gap-1 px-3 py-2 text-sm font-bold rounded-xl bg-[#FFE600] text-[#1a1a1a] hover:bg-[#FFE600]/90 transition-colors disabled:opacity-50"
                      style={{ fontFamily: "var(--font-heading)" }}
                    >
                      <UserPlus size={12} />
                      {addingMember ? "Adding..." : "Add"}
                    </button>
                  </div>
                )}
              </div>

              {/* Audit logs */}
              {canEdit && (
                <div>
                  <button
                    onClick={handleToggleAudit}
                    className="flex items-center gap-2 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                    style={{ fontFamily: "var(--font-heading)" }}
                  >
                    <ScrollText size={12} />
                    {showAudit ? "Hide" : "Show"} Audit Log
                  </button>
                  <AnimatePresence>
                    {showAudit && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="overflow-hidden"
                      >
                        {auditError ? (
                          <div className="flex items-center gap-2 text-xs text-[#FF6B6B] mt-2" style={{ fontFamily: "var(--font-body)" }}>
                            <span>{auditError}</span>
                            <button
                              onClick={() => { setAuditLoaded(false); setAuditError(null); handleToggleAudit(); }}
                              className="underline hover:no-underline"
                            >
                              Retry
                            </button>
                          </div>
                        ) : auditLogs.length === 0 ? (
                          <p className="text-xs text-[var(--text-muted)] mt-2" style={{ fontFamily: "var(--font-body)" }}>
                            No audit logs
                          </p>
                        ) : (
                          <div className="mt-2 overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-left text-[var(--text-muted)] border-b border-[var(--border)]">
                                  <th className="pb-1 pr-4" style={{ fontFamily: "var(--font-heading)" }}>Action</th>
                                  <th className="pb-1 pr-4" style={{ fontFamily: "var(--font-heading)" }}>User</th>
                                  <th className="pb-1" style={{ fontFamily: "var(--font-heading)" }}>Timestamp</th>
                                </tr>
                              </thead>
                              <tbody>
                                {auditLogs.map((log) => (
                                  <tr key={log._id} className="border-b border-[var(--border)]">
                                    <td className="py-1.5 pr-4 text-[var(--text-primary)]" style={{ fontFamily: "var(--font-body)" }}>
                                      {log.action}
                                    </td>
                                    <td className="py-1.5 pr-4 text-[var(--text-secondary)]" style={{ fontFamily: "var(--font-body)" }}>
                                      {log.userName || log.userId}
                                    </td>
                                    <td className="py-1.5 text-[var(--text-muted)]" style={{ fontFamily: "var(--font-body)" }}>
                                      {new Date(log.createdAt).toLocaleString()}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {/* Delete workspace */}
              {isOwner && (
                <div className="pt-2 border-t border-[var(--border)]">
                  {!confirmDelete ? (
                    <button
                      onClick={() => setConfirmDelete(true)}
                      className="flex items-center gap-2 text-sm font-bold text-[#FF6B6B] hover:text-[#FF4444] transition-colors"
                      style={{ fontFamily: "var(--font-heading)" }}
                    >
                      <Trash2 size={14} /> Delete Workspace
                    </button>
                  ) : (
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-[#FF6B6B]" style={{ fontFamily: "var(--font-body)" }}>
                        Are you sure? This cannot be undone.
                      </span>
                      <button
                        onClick={handleDelete}
                        disabled={deleting}
                        className="px-3 py-1.5 text-sm font-bold rounded-xl bg-[#FF6B6B] text-white hover:bg-[#FF4444] transition-colors disabled:opacity-50"
                        style={{ fontFamily: "var(--font-heading)" }}
                      >
                        {deleting ? "Deleting..." : "Confirm Delete"}
                      </button>
                      <button
                        onClick={() => setConfirmDelete(false)}
                        className="text-sm font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                        style={{ fontFamily: "var(--font-heading)" }}
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
