"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import Image from "next/image";

type TaskCard = {
    id: string;
    title: string;
    project: string;
    projectColor: string;
    status: "in-progress" | "review" | "blocked" | "todo";
    deadline: string;
    collaborators: { name: string; avatar: string }[];
    day: "yesterday" | "today" | "tomorrow";
};

const TASKS: TaskCard[] = [
    // Today
    {
        id: "1", title: "Finalize branding deck", project: "Rebrand v3", projectColor: "#3B82F6",
        status: "in-progress", deadline: "Today, 4 PM",
        collaborators: [{ name: "Maya", avatar: "/avatars/maya.png" }, { name: "Kai", avatar: "/avatars/kai.png" }],
        day: "today",
    },
    {
        id: "2", title: "Review API auth flow", project: "Backend", projectColor: "#22C55E",
        status: "review", deadline: "Today, 6 PM",
        collaborators: [{ name: "Kenji", avatar: "/avatars/kenji.png" }],
        day: "today",
    },
    {
        id: "3", title: "Ship onboarding modal", project: "Onboarding", projectColor: "#F59E0B",
        status: "blocked", deadline: "Today, EOD",
        collaborators: [{ name: "Fara", avatar: "/avatars/fara.png" }, { name: "Mila", avatar: "/avatars/mila.png" }],
        day: "today",
    },
    // Tomorrow
    {
        id: "4", title: "Write release notes", project: "Rebrand v3", projectColor: "#3B82F6",
        status: "todo", deadline: "Sat, 12 PM",
        collaborators: [{ name: "Kai", avatar: "/avatars/kai.png" }],
        day: "tomorrow",
    },
    {
        id: "5", title: "Design system tokens", project: "Design System", projectColor: "#A855F7",
        status: "todo", deadline: "Sat, 3 PM",
        collaborators: [{ name: "Maya", avatar: "/avatars/maya.png" }, { name: "Eaia", avatar: "/avatars/eaia.png" }],
        day: "tomorrow",
    },
    // Yesterday
    {
        id: "6", title: "Client demo prep", project: "Onboarding", projectColor: "#F59E0B",
        status: "in-progress", deadline: "Thu, 10 AM",
        collaborators: [{ name: "Fara", avatar: "/avatars/fara.png" }],
        day: "yesterday",
    },
    {
        id: "7", title: "Sprint retro doc", project: "Backend", projectColor: "#22C55E",
        status: "review", deadline: "Thu, 2 PM",
        collaborators: [{ name: "Kenji", avatar: "/avatars/kenji.png" }, { name: "Kai", avatar: "/avatars/kai.png" }],
        day: "yesterday",
    },
];

const STATUS_CONFIG = {
    "in-progress": { label: "In progress", color: "#3B82F6", bg: "#DBEAFE" },
    review: { label: "In review", color: "#A855F7", bg: "#F3E8FF" },
    blocked: { label: "Blocked", color: "#EF4444", bg: "#FEE2E2" },
    todo: { label: "To do", color: "#6B7280", bg: "#F3F4F6" },
};

const DAY_LABELS = {
    yesterday: "Yesterday",
    today: "Today",
    tomorrow: "Tomorrow",
};

export default function ProjectTracker() {
    const [expanded, setExpanded] = useState(false);
    const todayTasks = TASKS.filter((t) => t.day === "today");
    const allDays = ["yesterday", "today", "tomorrow"] as const;

    return (
        <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.35, type: "spring", stiffness: 200, damping: 25 }}
            layout
            className={`rounded-2xl border-2 border-[var(--border-strong)] bg-[var(--surface)] shadow-[var(--shadow-card)] overflow-hidden ${expanded ? "p-5" : "p-4"}`}
            style={expanded ? {} : { maxWidth: 340, marginLeft: "auto" }}
        >
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
                <h2
                    className={`font-bold text-[var(--text-primary)] flex items-center gap-2 ${expanded ? "text-base" : "text-sm"}`}
                    style={{ fontFamily: "var(--font-heading)" }}
                >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#EC4899" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="inline -mt-0.5 mr-1"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><rect x="8" y="2" width="8" height="4" rx="1" ry="1" /></svg>
                    Projects
                </h2>
                <div className="flex items-center gap-2">
                    <span
                        className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider"
                        style={{ fontFamily: "var(--font-heading)" }}
                    >
                        {todayTasks.length} today
                    </span>
                    <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => setExpanded(!expanded)}
                        className="flex h-6 w-6 items-center justify-center rounded-full border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-hover)] transition-colors"
                        title={expanded ? "Collapse" : "Expand"}
                    >
                        {expanded ? (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 14 10 14 10 20" /><polyline points="20 10 14 10 14 4" /><line x1="14" y1="10" x2="21" y2="3" /><line x1="3" y1="21" x2="10" y2="14" /></svg>
                        ) : (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" /></svg>
                        )}
                    </motion.button>
                </div>
            </div>

            {/* Task cards */}
            {expanded ? (
                /* ── Expanded: 3-column grid ── */
                <div className="grid grid-cols-3 gap-4">
                    {allDays.map((day) => {
                        const dayTasks = TASKS.filter((t) => t.day === day);
                        return (
                            <div key={day}>
                                <p
                                    className={`text-xs font-bold uppercase tracking-wider mb-3 pb-2 border-b border-[var(--border)] ${day === "today" ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]"
                                        }`}
                                    style={{ fontFamily: "var(--font-heading)" }}
                                >
                                    {DAY_LABELS[day]}
                                    <span className="ml-1.5 text-[10px] font-normal text-[var(--text-muted)]">{dayTasks.length}</span>
                                </p>
                                <div className="space-y-2">
                                    {dayTasks.map((task, i) => (
                                        <TaskCardItem key={task.id} task={task} delay={i * 0.05} />
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                /* ── Collapsed: today only, stacked ── */
                <div className="space-y-2">
                    {TASKS.filter((t) => t.day === "today").map((task, i) => (
                        <TaskCardItem key={task.id} task={task} delay={i * 0.05} />
                    ))}
                </div>
            )}
        </motion.div>
    );
}

/* ─── Task Card Sub-component ─── */
function TaskCardItem({ task, delay }: { task: TaskCard; delay: number }) {
    const st = STATUS_CONFIG[task.status];
    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay }}
            whileHover={{ x: 2 }}
            className="rounded-xl border-[1.5px] border-[var(--border)] p-3 cursor-pointer hover:border-[var(--text-secondary)] hover:shadow-[2px_2px_0_rgba(10,10,10,0.08)] transition-all bg-[var(--surface)]"
        >
            {/* Top row: project tag + status */}
            <div className="flex items-center justify-between mb-1.5">
                <span
                    className="rounded-full px-2 py-0.5 text-[9px] font-bold"
                    style={{
                        backgroundColor: `${task.projectColor}15`,
                        color: task.projectColor,
                        fontFamily: "var(--font-heading)",
                    }}
                >
                    {task.project}
                </span>
                <span
                    className="rounded-full px-2 py-0.5 text-[9px] font-bold"
                    style={{
                        backgroundColor: st.bg,
                        color: st.color,
                        fontFamily: "var(--font-heading)",
                    }}
                >
                    {st.label}
                </span>
            </div>

            {/* Title */}
            <p className="text-sm font-semibold text-[var(--text-primary)] leading-snug mb-2">
                {task.title}
            </p>

            {/* Bottom: avatars + deadline */}
            <div className="flex items-center justify-between">
                <div className="flex -space-x-1.5">
                    {task.collaborators.map((c, idx) => (
                        <div
                            key={idx}
                            className="relative h-5 w-5 rounded-full overflow-hidden border-2 border-[var(--surface)]"
                            title={c.name}
                        >
                            <Image src={c.avatar} alt={c.name} fill className="object-cover" sizes="20px" />
                        </div>
                    ))}
                </div>
                <span className="text-[10px] text-[var(--text-secondary)] flex items-center gap-1">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                    {task.deadline}
                </span>
            </div>
        </motion.div>
    );
}
