"use client";
import { useState } from "react";
import Card from "../../components/nexus/Card";

type AgentMsg = { role: "user" | "assistant"; text: string };

export default function AgentPage() {
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState<AgentMsg[]>([
    { role: "assistant", text: "Hi! Ask me: 'predict MOT AB12CDE' or 'nearest stations' (demo)." }
  ]);
  const [loading, setLoading] = useState(false);

  const send = async () => {
    if (!input.trim()) return;
    const user = input.trim();
    setInput("");
    setMsgs(m => [...m, { role: "user", text: user }]);
    setLoading(true);
    try {
      const res = await fetch("/api/agent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: user }) });
      const data = await res.json();
      setMsgs(m => [...m, { role: "assistant", text: data.reply }]);
    } catch {
      setMsgs(m => [...m, { role: "assistant", text: "Sorry, I hit an error." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="max-w-3xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-bold">Agent Console</h1>
      <Card title="Chat">
        <div className="space-y-2 max-h-[50vh] overflow-auto">
          {msgs.map((m, i) => (
            <div key={i} className={m.role === "assistant" ? "text-gray-900" : "text-blue-700"}>
              <b>{m.role === "assistant" ? "Agent:" : "You:"}</b> {m.text}
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-3">
          <input className="flex-1 border rounded-xl px-3 py-2"
                 placeholder="Try: predict MOT AB12CDE"
                 value={input}
                 onChange={(e) => setInput(e.target.value)}
                 onKeyDown={(e) => e.key === "Enter" && send()} />
          <button disabled={loading} onClick={send} className="rounded-xl px-4 py-2 bg-black text-white disabled:opacity-50">
            {loading ? "Working…" : "Send"}
          </button>
        </div>
      </Card>
    </main>
  );
}
