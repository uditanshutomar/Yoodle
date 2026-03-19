import {
  Calendar,
  Rocket,
  StickyNote,
  Sparkles,
  Activity,
  MessageCircle,
  Play,
  Rss,
  type LucideIcon,
} from "lucide-react";

export interface WidgetMeta {
  id: string;
  title: string;
  icon: LucideIcon;
  minW: number;
  minH: number;
  defaultW: number;
  defaultH: number;
  description: string;
}

export const WIDGET_REGISTRY: Record<string, WidgetMeta> = {
  "up-next": {
    id: "up-next",
    title: "Up Next",
    icon: Calendar,
    minW: 4,
    minH: 2,
    defaultW: 8,
    defaultH: 3,
    description: "Upcoming meetings at a glance",
  },
  launchpad: {
    id: "launchpad",
    title: "Launchpad",
    icon: Rocket,
    minW: 3,
    minH: 2,
    defaultW: 4,
    defaultH: 2,
    description: "Quick actions to start or join meetings",
  },
  "sticky-board": {
    id: "sticky-board",
    title: "Sticky Board",
    icon: StickyNote,
    minW: 3,
    minH: 2,
    defaultW: 4,
    defaultH: 3,
    description: "Compact view of your tasks",
  },
  "yoodler-says": {
    id: "yoodler-says",
    title: "Yoodler Says",
    icon: Sparkles,
    minW: 3,
    minH: 2,
    defaultW: 4,
    defaultH: 2,
    description: "AI-powered nudges and suggestions",
  },
  "pulse-check": {
    id: "pulse-check",
    title: "Pulse Check",
    icon: Activity,
    minW: 3,
    minH: 2,
    defaultW: 4,
    defaultH: 2,
    description: "Mini trends for your meetings",
  },
  buzz: {
    id: "buzz",
    title: "Buzz",
    icon: MessageCircle,
    minW: 3,
    minH: 2,
    defaultW: 6,
    defaultH: 2,
    description: "Unread messages and conversations",
  },
  replays: {
    id: "replays",
    title: "Replays",
    icon: Play,
    minW: 3,
    minH: 2,
    defaultW: 6,
    defaultH: 2,
    description: "Recent past meetings",
  },
  "the-feed": {
    id: "the-feed",
    title: "The Feed",
    icon: Rss,
    minW: 3,
    minH: 2,
    defaultW: 4,
    defaultH: 2,
    description: "Workspace activity stream",
  },
};

export const ALL_WIDGET_IDS = Object.keys(WIDGET_REGISTRY);

export interface LayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
}

export const DEFAULT_LAYOUT: LayoutItem[] = [
  { i: "up-next", x: 0, y: 0, w: 8, h: 3, minW: 4, minH: 2 },
  { i: "launchpad", x: 8, y: 0, w: 4, h: 2, minW: 3, minH: 2 },
  { i: "yoodler-says", x: 8, y: 2, w: 4, h: 2, minW: 3, minH: 2 },
  { i: "sticky-board", x: 0, y: 3, w: 4, h: 3, minW: 3, minH: 2 },
  { i: "pulse-check", x: 4, y: 3, w: 4, h: 2, minW: 3, minH: 2 },
  { i: "buzz", x: 0, y: 6, w: 6, h: 2, minW: 3, minH: 2 },
  { i: "replays", x: 6, y: 6, w: 6, h: 2, minW: 3, minH: 2 },
  { i: "the-feed", x: 8, y: 4, w: 4, h: 2, minW: 3, minH: 2 },
];
