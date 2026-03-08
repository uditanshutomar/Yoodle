"use client";

import { useMemo } from "react";
import ParticipantBubble, { Participant } from "./ParticipantBubble";

interface BubbleLayoutProps {
    participants: Participant[];
    containerWidth: number;
    containerHeight: number;
    selfId: string;
}

export default function BubbleLayout({
    participants,
    containerWidth,
    containerHeight,
    selfId,
}: BubbleLayoutProps) {
    const positions = useMemo(() => {
        const centerX = containerWidth / 2;
        const centerY = containerHeight / 2;
        // If someone is speaking, feature them; otherwise default to first participant (self)
        let speakerIdx = participants.findIndex((p) => p.isSpeaking);
        if (speakerIdx === -1) speakerIdx = 0;
        const minDim = Math.min(containerWidth, containerHeight);

        // Speaker size scales with viewport
        const speakerSize = Math.max(180, Math.min(320, minDim * 0.38));
        const otherSize = Math.max(90, Math.min(140, minDim * 0.15));

        // Orbit radius
        const orbitRadius = Math.max(160, Math.min(320, minDim * 0.34));

        return participants.map((p, i) => {
            if (i === speakerIdx) {
                return {
                    participant: p,
                    x: centerX,
                    y: centerY - 10,
                    size: speakerSize,
                };
            }

            // Index among non-speakers
            const others = participants.filter((_, idx) => idx !== speakerIdx);
            const otherIdx = others.indexOf(p);
            const totalOthers = others.length;

            // Distribute around the circle, starting from top
            const angleOffset = -Math.PI / 2;
            const angle = angleOffset + (2 * Math.PI * otherIdx) / totalOthers;

            // Slight randomness to feel organic
            const jitterX = Math.sin(otherIdx * 7.3) * 8;
            const jitterY = Math.cos(otherIdx * 5.7) * 8;

            return {
                participant: p,
                x: centerX + Math.cos(angle) * orbitRadius + jitterX,
                y: centerY + Math.sin(angle) * orbitRadius + jitterY,
                size: otherSize,
            };
        });
    }, [participants, containerWidth, containerHeight]);

    return (
        <div className="relative w-full h-full">
            {positions.map(({ participant, x, y, size }) => (
                <ParticipantBubble
                    key={participant.id}
                    participant={participant}
                    x={x}
                    y={y}
                    size={size}
                    isSelf={participant.id === selfId}
                />
            ))}
        </div>
    );
}
