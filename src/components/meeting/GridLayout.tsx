"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import ParticipantBubble, { Participant } from "./ParticipantBubble";

interface GridLayoutProps {
  participants: Participant[];
  containerWidth: number;
  containerHeight: number;
  selfId: string;
}

const MAX_PER_PAGE = 25;

/**
 * Determines grid columns based on participant count.
 * 1 = full, 2 = 1x2, 3-4 = 2x2, 5-9 = 3x3, 10-16 = 4x4, 17+ = 5x5
 */
function getGridColumns(count: number): number {
  if (count <= 1) return 1;
  if (count <= 2) return 2;
  if (count <= 4) return 2;
  if (count <= 9) return 3;
  if (count <= 16) return 4;
  return 5;
}

export default function GridLayout({
  participants,
  containerWidth,
  containerHeight,
  selfId,
}: GridLayoutProps) {
  const [page, setPage] = useState(0);

  const totalPages = Math.max(1, Math.ceil(participants.length / MAX_PER_PAGE));
  const clampedPage = Math.min(page, totalPages - 1);

  const pageParticipants = useMemo(() => {
    const start = clampedPage * MAX_PER_PAGE;
    return participants.slice(start, start + MAX_PER_PAGE);
  }, [participants, clampedPage]);

  const columns = getGridColumns(pageParticipants.length);
  const rows = Math.ceil(pageParticipants.length / columns);

  const cellWidth = containerWidth / columns;
  const cellHeight = containerHeight / rows;
  const cellSize = Math.max(200, Math.min(cellWidth, cellHeight) - 16);

  // Center positions within each grid cell
  const positions = useMemo(() => {
    return pageParticipants.map((participant, index) => {
      const col = index % columns;
      const row = Math.floor(index / columns);

      const centerX = col * cellWidth + cellWidth / 2;
      const centerY = row * cellHeight + cellHeight / 2;

      return { participant, x: centerX, y: centerY, size: cellSize };
    });
  }, [pageParticipants, columns, cellWidth, cellHeight, cellSize]);

  const needsPagination = participants.length > MAX_PER_PAGE;

  return (
    <motion.div
      layoutId="grid-layout-wrapper"
      className="relative w-full h-full"
    >
      {positions.map(({ participant, x, y, size }) => (
        <div
          key={participant.id}
          style={{
            position: "absolute",
            left: x - size / 2,
            top: y - size / 2,
            width: size,
            height: size + 36,
          }}
        >
          <ParticipantBubble
            participant={participant}
            x={size / 2}
            y={size / 2}
            size={size}
            isSelf={participant.id === selfId}
          />
        </div>
      ))}

      {/* Active speaker highlight overlay */}
      {positions.map(({ participant, x, y, size }) =>
        participant.isSpeaking ? (
          <motion.div
            key={`speaker-${participant.id}`}
            className="pointer-events-none absolute rounded-full"
            style={{
              left: x - size / 2 - 4,
              top: y - size / 2 - 4,
              width: size + 8,
              height: size + 8,
              border: "3px solid #FFE600",
              zIndex: 0,
            }}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
          />
        ) : null,
      )}

      {needsPagination && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={clampedPage === 0}
            aria-label="Previous page of participants"
            className="rounded-lg border-2 border-[var(--border-strong)] bg-[var(--surface)] px-3 py-1 text-sm font-bold shadow-[2px_2px_0_var(--border-strong)] transition-shadow hover:shadow-[4px_4px_0_var(--border-strong)] disabled:opacity-40"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Prev
          </button>
          <span
            className="text-sm font-bold text-[#0A0A0A]"
            style={{ fontFamily: "var(--font-heading)" }}
            aria-live="polite"
            aria-atomic="true"
          >
            {clampedPage + 1} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={clampedPage >= totalPages - 1}
            aria-label="Next page of participants"
            className="rounded-lg border-2 border-[var(--border-strong)] bg-[var(--surface)] px-3 py-1 text-sm font-bold shadow-[2px_2px_0_var(--border-strong)] transition-shadow hover:shadow-[4px_4px_0_var(--border-strong)] disabled:opacity-40"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Next
          </button>
        </div>
      )}
    </motion.div>
  );
}
