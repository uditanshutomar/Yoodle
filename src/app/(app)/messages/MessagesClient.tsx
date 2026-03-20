"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import ConversationList from "@/components/chat/ConversationList";
import NewMessageModal from "@/components/chat/NewMessageModal";
import { YoodleMascotSmall } from "@/components/YoodleMascot";

export default function MessagesClient() {
  const router = useRouter();
  const [showNewMessage, setShowNewMessage] = useState(false);

  return (
    <div className="flex h-full w-full">
      <ConversationList
        onSelect={(id) => router.push(`/messages/${id}`)}
        onNewMessage={() => setShowNewMessage(true)}
        className="w-full lg:w-80 lg:border-r-2 lg:border-[var(--border)] lg:shrink-0"
      />
      {/* Desktop empty state */}
      <div className="hidden lg:flex flex-1 items-center justify-center text-[var(--text-muted)]">
        <motion.div
          className="text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <motion.div
            animate={{ y: [0, -6, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            className="mb-4"
          >
            <div className="flex h-20 w-20 mx-auto items-center justify-center rounded-full bg-[#FFE600]/20 border-2 border-dashed border-[var(--border)]">
              <YoodleMascotSmall className="h-12 w-12" />
            </div>
          </motion.div>
          <p className="text-lg font-bold text-[var(--text-primary)] font-heading">
            Select a conversation
          </p>
          <p className="text-sm text-[var(--text-secondary)] mt-1 font-body">
            Or start a new one
          </p>
        </motion.div>
      </div>
      <NewMessageModal
        isOpen={showNewMessage}
        onClose={() => setShowNewMessage(false)}
        onConversationCreated={(id) => {
          setShowNewMessage(false);
          router.push(`/messages/${id}`);
        }}
      />
    </div>
  );
}
