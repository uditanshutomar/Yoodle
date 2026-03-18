"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import ConversationList from "@/components/chat/ConversationList";

const ChatThread = dynamic(() => import("@/components/chat/ChatThread"), {
  ssr: false,
  loading: () => (
    <div className="flex-1 animate-pulse bg-[var(--surface)]" />
  ),
});

const NewMessageModal = dynamic(() => import("@/components/chat/NewMessageModal"), {
  ssr: false,
});

export default function ConversationPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [showNewMessage, setShowNewMessage] = useState(false);

  return (
    <div className="flex h-full w-full">
      <ConversationList
        activeId={id}
        onSelect={(cid) => router.push(`/messages/${cid}`)}
        onNewMessage={() => setShowNewMessage(true)}
        className="hidden lg:flex lg:w-80 lg:shrink-0 lg:border-r-2 lg:border-[var(--border)]"
      />
      <ChatThread
        conversationId={id}
        onBack={() => router.push("/messages")}
        className="flex-1"
      />
      <NewMessageModal
        isOpen={showNewMessage}
        onClose={() => setShowNewMessage(false)}
        onConversationCreated={(cid) => {
          setShowNewMessage(false);
          router.push(`/messages/${cid}`);
        }}
      />
    </div>
  );
}
