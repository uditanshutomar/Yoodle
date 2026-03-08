"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Server, Plus } from "lucide-react";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import WorkspaceCard from "@/components/workspace/WorkspaceCard";
import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";

interface WorkspaceSummary {
  _id: string;
  name: string;
  description?: string;
  members: { userId: string; role: string }[];
  vm?: { status: string };
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

export default function WorkspacesPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!user) return;
    fetch("/api/workspaces", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.data) setWorkspaces(data.data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [user]);

  const createWorkspace = async () => {
    if (!user) return;
    setCreating(true);
    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: "New Workspace", description: "" }),
      });
      const data = await res.json();
      if (data.success && data.data) {
        router.push(`/workspaces/${data.data._id}`);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setCreating(false);
    }
  };

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
      {/* Header */}
      <motion.div variants={itemVariants} className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#06B6D4] border-2 border-[#0A0A0A]">
            <Server size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-[#0A0A0A]" style={{ fontFamily: "var(--font-heading)" }}>
              Workspaces
            </h1>
            <p className="text-xs text-[#0A0A0A]/50" style={{ fontFamily: "var(--font-body)" }}>
              Shared cloud environments powered by Vultr
            </p>
          </div>
        </div>
        <Button variant="primary" size="md" icon={Plus} onClick={createWorkspace} disabled={creating} className="!bg-[#06B6D4] !border-[#0A0A0A] !text-white">
          {creating ? "Creating…" : "New Workspace"}
        </Button>
      </motion.div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="w-8 h-8 border-3 border-[#06B6D4] border-t-transparent rounded-full" />
        </div>
      ) : workspaces.length === 0 ? (
        <motion.div variants={itemVariants}>
          <EmptyState
            title="No workspaces yet"
            description="Create a shared workspace with cloud VMs for your team. Collaborate in real-time with a shared terminal."
            action={{ label: "Create Workspace", onClick: createWorkspace, icon: Plus }}
          />
        </motion.div>
      ) : (
        <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {workspaces.map((ws) => (
            <WorkspaceCard
              key={ws._id}
              name={ws.name}
              description={ws.description}
              memberCount={ws.members?.length || 0}
              vmStatus={ws.vm?.status}
              onClick={() => router.push(`/workspaces/${ws._id}`)}
            />
          ))}
        </motion.div>
      )}
    </motion.div>
  );
}
