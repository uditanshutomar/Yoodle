export type MeetingRecord = {
    id: string;
    title: string;
    date: string;
    time: string;
    duration: string;
    roomType: string;
    avatars: { name: string; src: string; role?: string }[];
    hasRecording: boolean;
    hasTranscript: boolean;
    hasSummary: boolean;
    project?: string;
    projectColor?: string;
    // Detail data
    overview?: {
        purpose: string;
        outcome: string;
        nextMeeting?: string;
    };
    mom?: {
        keyDecisions: string[];
        discussionPoints: string[];
        actionItems: { task: string; owner: string; due: string }[];
        nextSteps: string[];
    };
    transcript?: { speaker: string; time: string; text: string }[];
    recordingUrl?: string;
    artifacts?: {
        momDocUrl?: string;
        momDocId?: string;
        presentationUrl?: string;
        presentationId?: string;
        folderUrl?: string;
        folderId?: string;
        analyticsSheetId?: string;
    };
    status?: string;
};

// ── API response types ────────────────────────────────────────────────

export interface APIMeetingParticipant {
    userId:
        | string
        | {
              _id: string;
              name?: string;
              displayName?: string;
              avatarUrl?: string;
              email?: string;
          };
    role: string;
    joinedAt?: string;
    leftAt?: string;
    status: string;
}

export interface APIMeetingMoM {
    summary: string;
    keyDecisions: string[];
    discussionPoints: string[];
    actionItems: { task: string; owner: string; due: string }[];
    nextSteps: string[];
    generatedAt?: string;
}

export interface APIMeeting {
    _id: string;
    code: string;
    title: string;
    description?: string;
    hostId:
        | string
        | {
              _id: string;
              name?: string;
              email?: string;
              displayName?: string;
              avatarUrl?: string;
          };
    participants: APIMeetingParticipant[];
    scheduledAt?: string;
    startedAt?: string;
    endedAt?: string;
    status: string;
    type: string;
    recordingId?: string;
    mom?: APIMeetingMoM;
    artifacts?: {
        momDocUrl?: string;
        momDocId?: string;
        presentationUrl?: string;
        presentationId?: string;
        folderUrl?: string;
        folderId?: string;
        analyticsSheetId?: string;
    };
    createdAt: string;
    updatedAt: string;
}

// ── Adapter: convert API meeting → MeetingRecord ──────────────────────

function resolveUser(u: APIMeetingParticipant["userId"]): {
    name: string;
    src: string;
} {
    if (typeof u === "string") {
        return { name: "User", src: `/api/avatar/${u}` };
    }
    return {
        name: u.displayName || u.name || "User",
        src: u.avatarUrl || `/api/avatar/${u._id}`,
    };
}

export function apiMeetingToRecord(m: APIMeeting): MeetingRecord {
    const start = m.startedAt || m.scheduledAt || m.createdAt;
    const end = m.endedAt;
    let duration = "";
    if (start && end) {
        const mins = Math.round(
            (new Date(end).getTime() - new Date(start).getTime()) / 60000
        );
        if (mins < 60) {
            duration = `${mins} min`;
        } else {
            const h = Math.floor(mins / 60);
            const rem = mins % 60;
            duration = rem > 0 ? `${h}h ${rem}m` : `${h}h`;
        }
    }

    const dateStr = new Date(start).toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
    });
    const timeStr = new Date(start).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
    });

    const projectColors: Record<string, string> = {
        ghost: "#7C3AED",
        regular: "#3B82F6",
    };

    return {
        id: m._id,
        title: m.title,
        date: dateStr,
        time: timeStr,
        duration,
        roomType: m.type === "ghost" ? "Ghost Room" : "Yoodle Room",
        avatars: m.participants.slice(0, 4).map((p) => {
            const resolved = resolveUser(p.userId);
            return {
                src: resolved.src,
                name: resolved.name,
                role: p.role === "host" ? "Host" : undefined,
            };
        }),
        hasSummary: !!m.description && m.description.length > 10,
        hasTranscript: false, // real transcript checked dynamically in MeetingDetail
        hasRecording: !!m.recordingId,
        project: m.type === "ghost" ? "Ghost" : undefined,
        projectColor: projectColors[m.type] || undefined,
        overview: m.description
            ? {
                  purpose: m.description,
                  outcome:
                      m.status === "ended"
                          ? "Meeting completed."
                          : "In progress.",
              }
            : undefined,
        mom: m.mom
            ? {
                  keyDecisions: m.mom.keyDecisions || [],
                  discussionPoints: m.mom.discussionPoints || [],
                  actionItems: (m.mom.actionItems || []).map((a) => ({
                      task: a.task,
                      owner: a.owner || "Unassigned",
                      due: a.due || "TBD",
                  })),
                  nextSteps: m.mom.nextSteps || [],
              }
            : undefined,
        artifacts: m.artifacts || undefined,
        status: m.status,
    };
}
