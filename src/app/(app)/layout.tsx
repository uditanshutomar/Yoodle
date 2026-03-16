"use client";

import AppSidebar from "@/components/layout/AppSidebar";
import AppTopbar from "@/components/layout/AppTopbar";
import MobileTabBar from "@/components/layout/MobileTabBar";
import { AIDrawerProvider } from "@/components/ai/AIDrawer";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AIDrawerProvider>
      <div className="flex h-screen bg-background">
        {/* Sidebar */}
        <AppSidebar />

        {/* Main area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Topbar */}
          <AppTopbar />

          {/* Content */}
          <main className="flex-1 overflow-y-auto pb-16 lg:pb-0">
            <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8">
              {children}
            </div>
          </main>
        </div>
      </div>
      <MobileTabBar />
    </AIDrawerProvider>
  );
}
