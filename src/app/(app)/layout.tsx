"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import AppSidebar from "@/components/layout/AppSidebar";
import AppTopbar from "@/components/layout/AppTopbar";
import MobileTabBar from "@/components/layout/MobileTabBar";
import { AIDrawerProvider } from "@/components/ai/AIDrawer";
import { MotionProvider } from "@/components/ui/MotionProvider";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <MotionProvider>
    <AIDrawerProvider>
      <div className="flex h-screen bg-background">
        {/* Desktop sidebar */}
        <AppSidebar />

        {/* Mobile sidebar drawer */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <>
              {/* Overlay */}
              <motion.div
                className="fixed inset-0 z-50 bg-black/40 lg:hidden"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setMobileMenuOpen(false)}
              />
              {/* Drawer */}
              <motion.div
                className="fixed inset-y-0 left-0 z-50 w-64 bg-[var(--surface)] border-r-2 border-[var(--border)] lg:hidden"
                initial={{ x: "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                transition={{ type: "spring", stiffness: 400, damping: 35 }}
              >
                <AppSidebar mobile />
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Main area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Topbar */}
          <AppTopbar
            onMenuToggle={() => setMobileMenuOpen((prev) => !prev)}
            menuOpen={mobileMenuOpen}
          />

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
    </MotionProvider>
  );
}
