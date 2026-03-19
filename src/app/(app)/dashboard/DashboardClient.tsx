"use client";

import dynamic from "next/dynamic";

const DeskPage = dynamic(() => import("@/components/desk/DeskPage"), {
  ssr: false,
});

export default function DashboardClient() {
  return <DeskPage />;
}
