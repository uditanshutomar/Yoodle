"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ConversationList from "@/components/chat/ConversationList";
import ChatThread from "@/components/chat/ChatThread";
import NewMessageModal from "@/components/chat/NewMessageModal";

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
