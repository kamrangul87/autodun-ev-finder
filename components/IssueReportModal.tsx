"use client";

import { useState } from "react";

type IssueReportModalProps = {
  open: boolean;
  onClose: () => void;
  station: {
    id: string | number;
    title?: string;
    lat?: number;
    lng?: number;
    source?: string;
    // Accept any extra fields but don’t depend on them
    [k: string]: any;
  };
};

export default function IssueReportModal({ open, onClose, station }: IssueReportModalProps) {
  const [category, setCategory] = useState("Data mismatch");
  const [message, setMessage] = useState("");

  if (!open) return null;

  const submit = async () => {
    const payload = {
      type: "issue",
      category,
      message,
      stationId: station?.id ?? null,
      title: station?.title ?? "",
      lat: station?.lat ?? station?.latitude ?? null,
      lng: station?.lng ?? station?.longitude ?? null,
      source: station?.source ?? "drawer",
      // keep a tiny snapshot for triage (do not exceed size)
      snapshot: {
        id: station?.id,
        title: station?.title,
        lat: station?.lat ?? station?.latitude,
        lng: station?.lng ?? station?.longitude,
      },
      createdAt: new Date().toISOString(),
    };

    try {
      // Reuse your existing feedback endpoint (already live per MVP)
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      alert("Thanks! Your issue was reported.");
      onClose();
      setMessage("");
    } catch (e) {
      console.error(e);
      alert("Could not submit right now. Please try again.");
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center">
      {/* backdrop */}
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      {/* card */}
      <div className="relative w-full max-w-lg rounded-2xl bg-white p-4 shadow-xl">
        <div className="mb-2 text-lg font-semibold">Report an issue</div>
        <div className="text-xs text-gray-500 mb-3">
          Station: <span className="font-medium">{station?.title ?? station?.id}</span>
        </div>

        <label className="block text-sm font-medium mb-1">Category</label>
        <select
          className="mb-3 w-full rounded-xl border px-3 py-2"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option>Data mismatch</option>
          <option>Connector info wrong</option>
          <option>Station not found/closed</option>
          <option>Location inaccurate</option>
          <option>Other</option>
        </select>

        <label className="block text-sm font-medium mb-1">Details</label>
        <textarea
          className="mb-4 h-28 w-full rounded-xl border px-3 py-2"
          placeholder="What’s wrong? (e.g., connector types, access, pricing, address)"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />

        <div className="flex items-center gap-2 justify-end">
          <button
            onClick={onClose}
            className="rounded-xl border px-3 py-2 text-sm hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            className="rounded-xl bg-black px-4 py-2 text-sm text-white hover:opacity-90"
          >
            Submit
          </button>
        </div>
      </div>
    </div>
  );
}
