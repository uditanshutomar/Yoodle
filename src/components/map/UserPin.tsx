"use client";

import { AdvancedMarker } from "@vis.gl/react-google-maps";
import { motion } from "framer-motion";
import Image from "next/image";
import type { NearbyUser } from "@/hooks/useNearbyUsers";

interface UserPinProps {
  user: NearbyUser;
  isCurrentUser?: boolean;
  onClick?: (user: NearbyUser) => void;
}

export default function UserPin({ user, isCurrentUser, onClick }: UserPinProps) {
  const isLockin = user.mode === "lockin";
  // Current user always uses exact coordinates; other lockin users use blurred
  const coords = isCurrentUser
    ? user.location?.coordinates
    : isLockin
      ? user.location?.blurredCoordinates
      : user.location?.coordinates;

  if (!coords) return null;

  const [lng, lat] = coords;

  return (
    <AdvancedMarker
      position={{ lat, lng }}
      onClick={() => onClick?.(user)}
    >
      <motion.div
        className="relative cursor-pointer"
        initial={{ scale: 0, y: -20 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: "spring", bounce: 0.4, duration: 0.6 }}
      >
        {/* Pulse ring */}
        <div
          className={`absolute inset-0 -m-1.5 rounded-full animate-ping ${
            isLockin ? "bg-blue-400/30" : "bg-green-400/30"
          }`}
          style={{ animationDuration: "2s" }}
        />

        {/* Pin circle */}
        <div
          className={`relative flex h-11 w-11 items-center justify-center rounded-full border-2 ${
            isCurrentUser
              ? "border-blue-400 bg-blue-400/20"
              : isLockin
                ? "border-dashed border-blue-400 bg-[var(--surface)]"
                : "border-[#FFE600] bg-[var(--surface)]"
          } shadow-[2px_2px_0_rgba(0,0,0,0.5)]`}
        >
          {user.avatarUrl ? (
            <Image
              src={user.avatarUrl}
              alt={user.displayName || user.name}
              width={36}
              height={36}
              className="rounded-full object-cover"
            />
          ) : (
            <span className="text-sm font-bold text-[var(--text-primary)] font-heading">
              {(user.displayName || user.name || "?").charAt(0).toUpperCase()}
            </span>
          )}
        </div>

        {/* Mode badge */}
        {isLockin && (
          <div className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 border border-white text-[10px]">
            🎧
          </div>
        )}

        {/* Status bubble */}
        {user.status && (
          <div className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg border-2 border-[var(--border-strong)] bg-[var(--surface)] px-2 py-0.5 shadow-[2px_2px_0_rgba(0,0,0,0.4)]">
            <span className="text-[10px] text-[var(--text-primary)] font-body">
              {user.status}
            </span>
          </div>
        )}

        {/* "You" label */}
        {isCurrentUser && (
          <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-blue-500 px-1.5 py-0.5 text-[10px] font-bold text-white font-heading">
            You
          </div>
        )}
      </motion.div>
    </AdvancedMarker>
  );
}
