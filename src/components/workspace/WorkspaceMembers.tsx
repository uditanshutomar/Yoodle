"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { UserPlus, Crown, Shield, User } from "lucide-react";
import Button from "@/components/ui/Button";

interface Member {
  userId: string | { _id: string; name?: string; email?: string; displayName?: string };
  role: string;
  joinedAt: string;
}

interface WorkspaceMembersProps {
  members: Member[];
  isAdmin: boolean;
  onAddMember: (email: string, role: string) => void;
  onRemoveMember: (memberId: string) => void;
}

const roleIcons: Record<string, typeof User> = {
  owner: Crown,
  admin: Shield,
  member: User,
};

const roleColors: Record<string, string> = {
  owner: "#FFE600",
  admin: "#06B6D4",
  member: "#0A0A0A",
};

export default function WorkspaceMembers({
  members,
  isAdmin,
  onAddMember,
  onRemoveMember,
}: WorkspaceMembersProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");

  const handleAdd = () => {
    if (!email.trim()) return;
    onAddMember(email.trim(), role);
    setEmail("");
  };

  return (
    <div className="space-y-4">
      {/* Add member form */}
      {isAdmin && (
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label
              className="text-xs font-bold text-[#0A0A0A]/60 mb-1 block"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              Add by email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              placeholder="user@example.com"
              className="w-full px-3 py-2 text-sm border-2 border-[#0A0A0A]/10 rounded-xl bg-white focus:border-[#06B6D4] focus:outline-none"
              style={{ fontFamily: "var(--font-body)" }}
            />
          </div>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="px-2 py-2 text-sm border-2 border-[#0A0A0A]/10 rounded-xl bg-white focus:border-[#06B6D4] focus:outline-none"
            style={{ fontFamily: "var(--font-body)" }}
          >
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
          <Button
            variant="primary"
            size="sm"
            icon={UserPlus}
            onClick={handleAdd}
            className="!bg-[#06B6D4] !border-[#0A0A0A] !text-white"
          >
            Add
          </Button>
        </div>
      )}

      {/* Member list */}
      <div className="space-y-2">
        {members.map((m, i) => {
          const memberData = typeof m.userId === "object" ? m.userId : null;
          const memberId = memberData ? memberData._id : (m.userId as string);
          const name = memberData?.displayName || memberData?.name || "Unknown";
          const memberEmail = memberData?.email || "";
          const RoleIcon = roleIcons[m.role] || User;

          return (
            <motion.div
              key={memberId}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="flex items-center justify-between py-2 px-3 rounded-xl hover:bg-[#0A0A0A]/5 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-full border-2"
                  style={{ borderColor: roleColors[m.role] || "#0A0A0A" }}
                >
                  <RoleIcon size={14} style={{ color: roleColors[m.role] || "#0A0A0A" }} />
                </div>
                <div>
                  <p className="text-sm font-bold text-[#0A0A0A]" style={{ fontFamily: "var(--font-heading)" }}>
                    {name}
                  </p>
                  {memberEmail && (
                    <p className="text-[10px] text-[#0A0A0A]/40" style={{ fontFamily: "var(--font-body)" }}>
                      {memberEmail}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full"
                  style={{
                    color: roleColors[m.role],
                    backgroundColor: `${roleColors[m.role]}15`,
                    fontFamily: "var(--font-heading)",
                  }}
                >
                  {m.role}
                </span>
                {isAdmin && m.role !== "owner" && (
                  <button
                    onClick={() => onRemoveMember(memberId)}
                    className="text-[10px] text-red-400 hover:text-red-600 transition-colors"
                  >
                    Remove
                  </button>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
