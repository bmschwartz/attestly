"use client";

import { useState } from "react";
import { api } from "~/trpc/react";

export default function CrossSurveyInsightsPage() {
  const [selectedSurveyIds, setSelectedSurveyIds] = useState<string[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const surveys = api.survey.listMine.useQuery({ status: "CLOSED", limit: 100 });
  const closedSurveys = surveys.data?.surveys ?? [];

  const createSession = api.ai.createSession.useMutation();
  const sessions = api.ai.listSessions.useQuery({ surveyId: null });
  const session = api.ai.getSession.useQuery(
    { sessionId: activeSessionId! },
    { enabled: !!activeSessionId },
  );
  const chat = api.ai.chat.useMutation();

  function toggleSurvey(id: string) {
    setSelectedSurveyIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : prev.length < 5 ? [...prev, id] : prev,
    );
  }

  async function handleSend() {
    if (!input.trim() || isLoading || selectedSurveyIds.length < 2) return;

    let sessionId = activeSessionId;
    if (!sessionId) {
      const s = await createSession.mutateAsync({
        surveyId: null,
        surveyIds: selectedSurveyIds,
      });
      sessionId = s.id;
      setActiveSessionId(sessionId);
    }

    setIsLoading(true);
    try {
      await chat.mutateAsync({ sessionId, message: input });
      setInput("");
      await session.refetch();
    } finally {
      setIsLoading(false);
    }
  }

  const messages = (session.data?.messages as { role: string; content: string }[]) ?? [];

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-bold">Cross-Survey Insights</h1>

      {/* Session picker */}
      {sessions.data && sessions.data.length > 0 && (
        <div className="mt-4">
          <label className="text-sm font-medium text-gray-700">Past sessions</label>
          <select
            value={activeSessionId ?? ""}
            onChange={(e) => setActiveSessionId(e.target.value || null)}
            className="ml-2 rounded border px-2 py-1 text-sm"
          >
            <option value="">New session</option>
            {sessions.data.map((s) => (
              <option key={s.id} value={s.id}>{s.title}</option>
            ))}
          </select>
        </div>
      )}

      <div className="mt-6 grid grid-cols-3 gap-6">
        {/* Survey selector */}
        <div className="col-span-1 rounded-lg border p-4">
          <h2 className="font-medium">Select surveys (2-5)</h2>
          <div className="mt-3 space-y-2">
            {closedSurveys.map((s) => (
              <label key={s.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selectedSurveyIds.includes(s.id)}
                  onChange={() => toggleSurvey(s.id)}
                />
                {s.title}
              </label>
            ))}
            {closedSurveys.length === 0 && !surveys.isLoading && (
              <p className="text-sm text-gray-400">No closed surveys yet.</p>
            )}
          </div>
        </div>

        {/* Chat area */}
        <div className="col-span-2 flex flex-col rounded-lg border">
          <div className="flex-1 overflow-y-auto space-y-3 p-4" style={{ minHeight: "400px" }}>
            {messages.map((m, i) => (
              <div key={i} className={`text-sm ${m.role === "user" ? "text-right" : ""}`}>
                <div className={`inline-block rounded-lg px-3 py-2 ${
                  m.role === "user" ? "bg-blue-600 text-white" : "bg-gray-100"
                }`}>
                  {m.content}
                </div>
              </div>
            ))}
            {isLoading && <div className="text-sm text-gray-400">Analyzing...</div>}
            {selectedSurveyIds.length < 2 && messages.length === 0 && (
              <p className="text-center text-sm text-gray-400">Select at least 2 surveys to start</p>
            )}
          </div>
          <div className="border-t p-3">
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && void handleSend()}
                placeholder="Compare your surveys..."
                className="flex-1 rounded border px-3 py-2 text-sm"
                disabled={selectedSurveyIds.length < 2}
              />
              <button
                onClick={() => void handleSend()}
                disabled={isLoading || !input.trim() || selectedSurveyIds.length < 2}
                className="rounded bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-50"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
