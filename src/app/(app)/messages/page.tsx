"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare } from "lucide-react";
import ConversationList from "@/components/chat/ConversationList";
import NewMessageModal from "@/components/chat/NewMessageModal";

export default function MessagesPage() {
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
        <div className="text-center">
          <MessageSquare size={48} className="mx-auto mb-3 opacity-30" />
          <p className="text-lg font-bold" style={{ fontFamily: "var(--font-heading)" }}>
            Select a conversation
          </p>
          <p className="text-sm mt-1">Or start a new one</p>
        </div>
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
