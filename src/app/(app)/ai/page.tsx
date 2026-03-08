"use client";

import { motion } from "framer-motion";
import { Bot } from "lucide-react";
import ChatWindow from "@/components/ai/ChatWindow";
import QuickActions from "@/components/ai/QuickActions";
import { useAIChat } from "@/hooks/useAIChat";

export default function AIAssistantPage() {
  const { messages, isStreaming, sendMessage, stopStreaming, clearMessages } = useAIChat();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="h-full"
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FFE600] border-2 border-[#0A0A0A]">
          <Bot size={20} className="text-[#0A0A0A]" />
        </div>
        <div>
          <h1
            className="text-2xl font-black text-[#0A0A0A]"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Doodle Poodle
          </h1>
          <p
            className="text-xs text-[#0A0A0A]/50"
            style={{ fontFamily: "var(--font-body)" }}
          >
            AI-powered meeting assistant — powered by Gemini
          </p>
        </div>
      </div>

      {/* Main layout */}
      <div
        className="grid grid-cols-1 lg:grid-cols-4 gap-4"
        style={{ height: "calc(100vh - 200px)" }}
      >
        {/* Chat */}
        <div className="lg:col-span-3 min-h-[500px]">
          <ChatWindow
            messages={messages}
            isStreaming={isStreaming}
            onSend={sendMessage}
            onStop={stopStreaming}
            onClear={clearMessages}
          />
        </div>

        {/* Sidebar */}
        <div className="space-y-4 overflow-y-auto">
          <div className="bg-white border-2 border-[#0A0A0A] rounded-2xl shadow-[4px_4px_0_#0A0A0A] p-4">
            <QuickActions onAction={sendMessage} />
          </div>

          {/* AI info card */}
          <div className="bg-[#FFE600]/10 border-2 border-[#FFE600] rounded-2xl p-4">
            <h3
              className="text-sm font-bold text-[#0A0A0A] mb-2"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              What can I do?
            </h3>
            <ul
              className="space-y-1.5 text-xs text-[#0A0A0A]/60"
              style={{ fontFamily: "var(--font-body)" }}
            >
              <li>📋 Prepare you for upcoming meetings</li>
              <li>📝 Summarize meeting notes & transcripts</li>
              <li>✅ Extract action items from discussions</li>
              <li>🧠 Remember your preferences</li>
              <li>📅 Help plan your schedule</li>
              <li>🔍 Proofread and improve your writing</li>
            </ul>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
