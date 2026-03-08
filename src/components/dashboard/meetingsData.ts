import { StaticImageData } from "next/image";

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
};

export const MEETINGS_DATA: MeetingRecord[] = [
    {
        id: "1", title: "Design Sync", date: "Fri, Mar 7", time: "10:00 AM", duration: "45 min",
        roomType: "Yoodle Room", project: "Rebrand v3", projectColor: "#3B82F6",
        avatars: [
            { name: "Maya", src: "/avatars/maya.png", role: "Design Lead" },
            { name: "Kai", src: "/avatars/kai.png", role: "Frontend" },
            { name: "Fara", src: "/avatars/fara.png", role: "PM" },
        ],
        hasRecording: true, hasTranscript: true, hasSummary: true,
        overview: {
            purpose: "Review new brand direction and finalize color palette for the rebrand launch.",
            outcome: "Approved primary palette. Deferred typography decision to next sync.",
            nextMeeting: "Mon, Mar 10 at 10:00 AM",
        },
        mom: {
            keyDecisions: [
                "Primary palette approved: Midnight, Cream, Accent Yellow, Soft Lavender",
                "Logo refresh will use the simplified mark, not the full wordmark",
                "Typography decision deferred — Maya to present 3 options next week",
            ],
            discussionPoints: [
                "Reviewed competitor analysis deck from Fara — strong differentiation opportunity in warm tones",
                "Debated whether Accent Yellow is too close to existing brand — consensus: different enough",
                "Kai raised accessibility concerns on lavender contrast — Maya to run WCAG checks",
            ],
            actionItems: [
                { task: "Run WCAG contrast checks on lavender", owner: "Maya", due: "Mon, Mar 10" },
                { task: "Prepare 3 typography options", owner: "Maya", due: "Mon, Mar 10" },
                { task: "Update brand guidelines doc", owner: "Fara", due: "Wed, Mar 12" },
                { task: "Build color token PR", owner: "Kai", due: "Tue, Mar 11" },
            ],
            nextSteps: [
                "Maya presents typography options at next Design Sync",
                "Kai ships color tokens to staging by Tuesday",
                "Team reviews brand guidelines draft by end of week",
            ],
        },
        transcript: [
            { speaker: "Maya", time: "0:00", text: "Hey everyone, let's dive in. Today we're reviewing the final palette options for the rebrand." },
            { speaker: "Fara", time: "0:45", text: "Before we start, I shared the competitor analysis in Notion. Quick summary: everyone's going dark and moody, so warm and bright could be our edge." },
            { speaker: "Kai", time: "1:30", text: "Yeah I looked at it — love the direction. One thing though, the lavender might have contrast issues on light backgrounds." },
            { speaker: "Maya", time: "2:15", text: "Good catch. I'll run the WCAG checks this weekend. Let's not block on that though." },
            { speaker: "Fara", time: "3:00", text: "Agreed. So are we locking in the four-color palette? Midnight, Cream, Yellow, Lavender?" },
            { speaker: "Maya", time: "3:30", text: "I think so. The yellow gives us energy, the lavender gives us softness. It's a good balance." },
            { speaker: "Kai", time: "4:10", text: "Works for me. I can start building the design tokens once it's confirmed." },
            { speaker: "Maya", time: "5:00", text: "Let's call it confirmed then. For typography, I need more time. I'll bring three options to the next sync." },
            { speaker: "Fara", time: "5:30", text: "Perfect. I'll update the brand guidelines doc with today's decisions. Should be ready for review by Wednesday." },
            { speaker: "Maya", time: "6:00", text: "Great. Anything else? No? Cool, see you all Monday." },
        ],
        recordingUrl: "/mock-screen-share.png",
    },
    {
        id: "2", title: "Product Standup", date: "Fri, Mar 7", time: "9:00 AM", duration: "15 min",
        roomType: "Quick Sync", project: "Backend", projectColor: "#22C55E",
        avatars: [
            { name: "Kenji", src: "/avatars/kenji.png", role: "Backend Lead" },
            { name: "Fara", src: "/avatars/fara.png", role: "PM" },
        ],
        hasRecording: false, hasTranscript: true, hasSummary: true,
        overview: {
            purpose: "Daily standup to sync on backend blockers and sprint progress.",
            outcome: "Auth flow blocker resolved. On track for Friday deploy.",
        },
        mom: {
            keyDecisions: ["Deploy auth changes Friday afternoon", "Skip load testing for this sprint — out of scope"],
            discussionPoints: ["Auth token rotation bug fixed by Kenji overnight", "Rate limiter ready for code review"],
            actionItems: [
                { task: "Code review rate limiter PR", owner: "Fara", due: "Today" },
                { task: "Prep deploy checklist", owner: "Kenji", due: "Fri PM" },
            ],
            nextSteps: ["Kenji deploys after Fara's review", "Retro next Monday"],
        },
        transcript: [
            { speaker: "Kenji", time: "0:00", text: "Morning. Quick update — I fixed the auth token rotation bug last night. PR is up." },
            { speaker: "Fara", time: "0:20", text: "Nice. I'll review it right after this. Rate limiter status?" },
            { speaker: "Kenji", time: "0:35", text: "Ready for review too. Want to deploy both together Friday afternoon." },
            { speaker: "Fara", time: "0:50", text: "Makes sense. I'll do both reviews this morning. Let's skip load testing this sprint." },
        ],
    },
    {
        id: "3", title: "Sprint Planning", date: "Thu, Mar 6", time: "11:00 AM", duration: "1h",
        roomType: "Yoodle Room", project: "Backend", projectColor: "#22C55E",
        avatars: [
            { name: "Kai", src: "/avatars/kai.png", role: "Frontend" },
            { name: "Fara", src: "/avatars/fara.png", role: "PM" },
            { name: "Mila", src: "/avatars/mila.png", role: "Designer" },
        ],
        hasRecording: true, hasTranscript: true, hasSummary: true,
        overview: {
            purpose: "Plan Sprint 14 scope and assign stories.",
            outcome: "12 stories committed. Stretch goal: onboarding redesign.",
        },
        mom: {
            keyDecisions: ["Sprint 14 goal: ship auth + onboarding MVP", "Carry over 2 bugs from Sprint 13"],
            discussionPoints: ["Velocity slightly down due to holiday week", "Onboarding redesign scope debated"],
            actionItems: [
                { task: "Break down onboarding stories", owner: "Mila", due: "Fri" },
                { task: "Assign bug tickets", owner: "Fara", due: "Today" },
            ],
            nextSteps: ["Dev starts Monday", "Mila shares onboarding wireframes by Friday"],
        },
        transcript: [
            { speaker: "Fara", time: "0:00", text: "Alright, Sprint 14. Let's look at what's rolling over from last sprint." },
            { speaker: "Kai", time: "0:30", text: "We have two bugs that didn't get fixed — the input validation one and the session timeout." },
            { speaker: "Mila", time: "1:00", text: "For the onboarding redesign, I have wireframes almost ready. Can share by Friday." },
        ],
    },
    {
        id: "4", title: "Client Onboarding", date: "Thu, Mar 6", time: "2:00 PM", duration: "30 min",
        roomType: "Zoom Bridge", project: "Onboarding", projectColor: "#F59E0B",
        avatars: [
            { name: "Fara", src: "/avatars/fara.png", role: "PM" },
            { name: "Maya", src: "/avatars/maya.png", role: "Design" },
        ],
        hasRecording: true, hasTranscript: false, hasSummary: false,
        overview: {
            purpose: "Walk new client through Yoodle workspace setup.",
            outcome: "Client onboarded successfully. Follow-up scheduled for next week.",
        },
    },
    {
        id: "5", title: "Design Review", date: "Wed, Mar 5", time: "3:00 PM", duration: "1h 15 min",
        roomType: "Yoodle Room", project: "Rebrand v3", projectColor: "#3B82F6",
        avatars: [
            { name: "Maya", src: "/avatars/maya.png", role: "Design Lead" },
            { name: "Mila", src: "/avatars/mila.png", role: "Designer" },
            { name: "Kai", src: "/avatars/kai.png", role: "Frontend" },
        ],
        hasRecording: true, hasTranscript: true, hasSummary: true,
    },
    {
        id: "6", title: "Team Retro", date: "Tue, Mar 4", time: "4:00 PM", duration: "50 min",
        roomType: "Yoodle Room",
        avatars: [
            { name: "Kenji", src: "/avatars/kenji.png", role: "Backend" },
            { name: "Fara", src: "/avatars/fara.png", role: "PM" },
        ],
        hasRecording: false, hasTranscript: true, hasSummary: true,
    },
    {
        id: "7", title: "Hiring Panel", date: "Mon, Mar 3", time: "10:00 AM", duration: "1h",
        roomType: "Meeting Room B", project: "Hiring", projectColor: "#A855F7",
        avatars: [
            { name: "Kenji", src: "/avatars/kenji.png", role: "Interviewer" },
            { name: "Maya", src: "/avatars/maya.png", role: "Interviewer" },
        ],
        hasRecording: true, hasTranscript: true, hasSummary: false,
    },
    {
        id: "8", title: "All Hands", date: "Sat, Mar 1", time: "11:00 AM", duration: "45 min",
        roomType: "Company-wide",
        avatars: [
            { name: "Kai", src: "/avatars/kai.png" },
            { name: "Fara", src: "/avatars/fara.png" },
            { name: "Mila", src: "/avatars/mila.png" },
        ],
        hasRecording: true, hasTranscript: true, hasSummary: true,
    },
];
