import dynamic from "next/dynamic";
import type { ComponentType } from "react";

const stub = () => null;

export const WIDGET_COMPONENTS: Record<string, ComponentType> = {
  "up-next": dynamic(() => import("./UpNextWidget"), {
    ssr: false,
    loading: stub,
  }),
  launchpad: dynamic(() => import("./LaunchpadWidget"), {
    ssr: false,
    loading: stub,
  }),
  "sticky-board": dynamic(() => import("./StickyBoardWidget"), {
    ssr: false,
    loading: stub,
  }),
  "yoodler-says": dynamic(() => import("./YoodlerSaysWidget"), {
    ssr: false,
    loading: stub,
  }),
  buzz: dynamic(() => import("./BuzzWidget"), {
    ssr: false,
    loading: stub,
  }),
  replays: dynamic(() => import("./ReplaysWidget"), {
    ssr: false,
    loading: stub,
  }),
  "my-calendar": dynamic(() => import("./CalendarWidget"), {
    ssr: false,
    loading: stub,
  }),
  map: dynamic(() => import("./MapWidget"), {
    ssr: false,
    loading: stub,
  }),
};
