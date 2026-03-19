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
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[200] focus:rounded-xl focus:border-2 focus:border-[var(--border-strong)] focus:bg-[#FFE600] focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-[#0A0A0A] focus:shadow-[4px_4px_0_var(--border-strong)]"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          Skip to content
        </a>

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
          <main id="main-content" className="flex-1 overflow-y-auto pb-16 lg:pb-0">
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
