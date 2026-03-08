"use client";

import { motion } from "framer-motion";
import { CheckSquare, Square, Clock } from "lucide-react";

interface Task {
  id: string;
  title: string;
  completed: boolean;
  dueDate?: string;
  source?: string;
}

interface TaskListProps {
  tasks: Task[];
  onToggle?: (taskId: string) => void;
}

export default function TaskList({ tasks, onToggle }: TaskListProps) {
  return (
    <div className="space-y-2">
      {tasks.length === 0 ? (
        <p className="text-sm text-[#0A0A0A]/40 text-center py-4" style={{ fontFamily: "var(--font-body)" }}>
          No tasks extracted yet
        </p>
      ) : (
        tasks.map((task, i) => (
          <motion.div
            key={task.id}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className={`flex items-start gap-3 px-3 py-2.5 rounded-xl border-2 transition-colors ${
              task.completed
                ? "border-[#10B981]/20 bg-[#10B981]/5"
                : "border-[#0A0A0A]/10 bg-white hover:border-[#FFE600]"
            }`}
          >
            <button
              onClick={() => onToggle?.(task.id)}
              className="mt-0.5 shrink-0"
            >
              {task.completed ? (
                <CheckSquare size={16} className="text-[#10B981]" />
              ) : (
                <Square size={16} className="text-[#0A0A0A]/30" />
              )}
            </button>

            <div className="flex-1 min-w-0">
              <p
                className={`text-sm ${
                  task.completed
                    ? "text-[#0A0A0A]/40 line-through"
                    : "text-[#0A0A0A]"
                }`}
                style={{ fontFamily: "var(--font-body)" }}
              >
                {task.title}
              </p>
              <div className="flex items-center gap-3 mt-1">
                {task.dueDate && (
                  <span className="flex items-center gap-1 text-[10px] text-[#0A0A0A]/40">
                    <Clock size={9} /> {new Date(task.dueDate).toLocaleDateString()}
                  </span>
                )}
                {task.source && (
                  <span className="text-[10px] text-[#0A0A0A]/30" style={{ fontFamily: "var(--font-body)" }}>
                    from: {task.source}
                  </span>
                )}
              </div>
            </div>
          </motion.div>
        ))
      )}
    </div>
  );
}
