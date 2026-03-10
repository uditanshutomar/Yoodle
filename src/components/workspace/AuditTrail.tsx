"use client";

import { motion } from "framer-motion";
import { Clock, User, Server, UserPlus, UserMinus, Settings } from "lucide-react";

interface AuditEntry {
  _id: string;
  action: string;
  userName: string;
  details?: Record<string, unknown>;
  createdAt: string;
}

interface AuditTrailProps {
  entries: AuditEntry[];
}

const actionIcons: Record<string, typeof Server> = {
  "vm.provision": Server,
  "vm.start": Server,
  "vm.stop": Server,
  "vm.destroy": Server,
  "member.add": UserPlus,
  "member.remove": UserMinus,
  "settings.update": Settings,
};

const actionLabels: Record<string, string> = {
  "vm.provision": "Provisioned VM",
  "vm.start": "Started VM",
  "vm.stop": "Stopped VM",
  "vm.destroy": "Destroyed VM",
  "member.add": "Added member",
  "member.remove": "Removed member",
  "settings.update": "Updated settings",
};

export default function AuditTrail({ entries }: AuditTrailProps) {
  return (
    <div className="space-y-3">
      {entries.length === 0 ? (
        <p
          className="text-sm text-[var(--text-muted)] text-center py-8"
          style={{ fontFamily: "var(--font-body)" }}
        >
          No activity yet
        </p>
      ) : (
        entries.map((entry, i) => {
          const Icon = actionIcons[entry.action] || User;
          const label = actionLabels[entry.action] || entry.action;

          return (
            <motion.div
              key={entry._id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className="flex items-start gap-3 text-sm"
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#06B6D4]/10 border border-[#06B6D4]/20 mt-0.5">
                <Icon size={12} className="text-[#06B6D4]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[var(--text-primary)]" style={{ fontFamily: "var(--font-body)" }}>
                  <span className="font-bold">{entry.userName}</span> {label}
                </p>
                <p
                  className="flex items-center gap-1 text-[10px] text-[var(--text-muted)] mt-0.5"
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  <Clock size={9} />
                  {new Date(entry.createdAt).toLocaleString()}
                </p>
              </div>
            </motion.div>
          );
        })
      )}
    </div>
  );
}
