"use client";

import { motion } from "framer-motion";
import { Server, Users } from "lucide-react";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import VMStatusBadge from "./VMStatusBadge";

interface WorkspaceCardProps {
  name: string;
  description?: string;
  memberCount: number;
  vmStatus?: string;
  onClick?: () => void;
}

export default function WorkspaceCard({
  name,
  description,
  memberCount,
  vmStatus,
  onClick,
}: WorkspaceCardProps) {
  return (
    <motion.div whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }}>
      <Card
        hover
        className="!p-5 cursor-pointer h-full !border-[#06B6D4] !shadow-[4px_4px_0_#06B6D4]"
        onClick={onClick}
      >
        <div className="flex items-start justify-between mb-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#06B6D4] border-2 border-[#0A0A0A]">
            <Server size={16} className="text-white" />
          </div>
          {vmStatus && <VMStatusBadge status={vmStatus} />}
        </div>

        <h3
          className="text-base font-bold text-[#0A0A0A] mb-1"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          {name}
        </h3>

        {description && (
          <p
            className="text-xs text-[#0A0A0A]/50 mb-3 line-clamp-2"
            style={{ fontFamily: "var(--font-body)" }}
          >
            {description}
          </p>
        )}

        <div className="flex items-center gap-3 text-xs text-[#0A0A0A]/50">
          <span className="flex items-center gap-1">
            <Users size={12} /> {memberCount} member{memberCount !== 1 ? "s" : ""}
          </span>
          {vmStatus && (
            <Badge variant={vmStatus === "running" ? "success" : "default"}>
              {vmStatus}
            </Badge>
          )}
        </div>
      </Card>
    </motion.div>
  );
}
