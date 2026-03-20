"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
}

export default function Modal({ open, onOpenChange, title, description, children }: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild>
              <motion.div
                className="fixed inset-0 z-[150] bg-black/50"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              />
            </Dialog.Overlay>
            <Dialog.Content asChild>
              <motion.div
                className="fixed left-1/2 top-1/2 z-[151] w-full max-w-lg bg-[var(--surface)] border-2 border-[var(--border-strong)] rounded-2xl shadow-[var(--shadow-card)] p-6"
                initial={{ opacity: 0, scale: 0.95, x: "-50%", y: "-50%" }}
                animate={{ opacity: 1, scale: 1, x: "-50%", y: "-50%" }}
                exit={{ opacity: 0, scale: 0.95, x: "-50%", y: "-50%" }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    {title && (
                      <Dialog.Title
                        className="text-xl font-bold text-[var(--text-primary)] font-heading"
                      >
                        {title}
                      </Dialog.Title>
                    )}
                    {description && (
                      <Dialog.Description
                        className="mt-1 text-sm text-[var(--text-secondary)] font-body"
                      >
                        {description}
                      </Dialog.Description>
                    )}
                  </div>
                  <Dialog.Close asChild>
                    <button
                      className="rounded-lg p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-[#FFE600] focus-visible:outline-none"
                      aria-label="Close"
                    >
                      <X size={18} />
                    </button>
                  </Dialog.Close>
                </div>
                {children}
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
