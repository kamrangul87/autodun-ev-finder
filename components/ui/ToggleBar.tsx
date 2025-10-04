import { useState } from 'react';

export default function ToggleBar({ toggles, active, onToggle }: { toggles: { label: string; value: string; }[]; onToggle: (value: string) => void; active: string; }) {
  return (
    <div className="flex gap-2">
      {toggles.map(t => (
        <button
          key={t.value}
          className={`px-3 py-1 rounded ${t.value === active ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
          onClick={() => onToggle(t.value)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
