"use client";

import { useState } from "react";
import { api } from "~/trpc/react";

interface ChatSidebarProps {
  surveyId: string;
  isPremium: boolean;
}

export function ChatSidebar({ surveyId, isPremium }: ChatSidebarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const sessions = api.ai.listSessions.useQuery(
    { surveyId },
    { enabled: isPremium && isOpen },
  );
  const session = api.ai.getSession.useQuery(
    { sessionId: activeSessionId! },
    { enabled: !!activeSessionId },
  );
  const createSession = api.ai.createSession.useMutation();
  const chat = api.ai.chat.useMutation();

  if (!isPremium) {
    return (
      <button
        disabled
        className="fixed right-4 top-20 rounded-lg bg-gray-200 px-3 py-2 text-sm text-gray-500"
        title="Chat with your survey data — available on Premium"
      >
        💬 Chat (Premium)
      </button>
    );
  }

  async function handleSend() {
    if (!input.trim() || isLoading) return;

    let sessionId = activeSessionId;
    if (!sessionId) {
      const newSession = await createSession.mutateAsync({ surveyId });
      sessionId = newSession.id;
      setActiveSessionId(sessionId);
    }

    setIsLoading(true);
    try {
      await chat.mutateAsync({ sessionId, message: input });
      setInput("");
      await session.refetch();
      await sessions.refetch();
    } finally {
      setIsLoading(false);
    }
  }

  const messages = (session.data?.messages as { role: string; content: string }[]) ?? [];

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed right-4 top-20 rounded-lg bg-blue-600 px-3 py-2 text-sm text-white"
      >
        💬 {isOpen ? "Close" : "Chat"}
      </button>

      {isOpen && (
        <div className="fixed right-0 top-16 flex h-[calc(100vh-4rem)] w-96 flex-col border-l bg-white shadow-lg">
          {/* Session picker */}
          <div className="border-b p-3">
            <select
              value={activeSessionId ?? ""}
              onChange={(e) => setActiveSessionId(e.target.value || null)}
              className="w-full rounded border px-2 py-1 text-sm"
            >
              <option value="">Select a session...</option>
              {sessions.data?.map((s) => (
                <option key={s.id} value={s.id}>{s.title}</option>
              ))}
            </select>
            <button
              onClick={async () => {
                const s = await createSession.mutateAsync({ surveyId });
                setActiveSessionId(s.id);
                await sessions.refetch();
              }}
              className="mt-1 text-xs text-blue-600 hover:underline"
            >
              + New session
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto space-y-3 p-3">
            {messages.map((m, i) => (
              <div key={i} className={`text-sm ${m.role === "user" ? "text-right" : ""}`}>
                <div className={`inline-block rounded-lg px-3 py-2 ${
                  m.role === "user" ? "bg-blue-600 text-white" : "bg-gray-100"
                }`}>
                  {m.content}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="text-sm text-gray-400">Thinking...</div>
            )}
          </div>

          {/* Input */}
          <div className="border-t p-3">
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && void handleSend()}
                placeholder="Ask about your data..."
                className="flex-1 rounded border px-3 py-2 text-sm"
              />
              <button
                onClick={() => void handleSend()}
                disabled={isLoading || !input.trim()}
                className="rounded bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-50"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
