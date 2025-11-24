// pages/admin/feedback.tsx
import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type React from "react";

// ✅ council util + type (CouncilHit includes optional region/country)
import { getCouncilAtPoint, type CouncilHit } from "../../lib/council";

/* ──────────────────────────────────────────────────────────────
   Client-only components (avoid SSR “window is not defined”)
   ────────────────────────────────────────────────────────────── */
const MapClient = dynamic(() => import("../../components/admin/MapClient"), {
  ssr: false,
});
const ChartsClient = dynamic(
  () => import("../../components/admin/ChartsClient"),
  { ssr: false }
);
const WorstStationsClient = dynamic(
  () => import("../../components/admin/WorstStations"),
  { ssr: false }
);

/* ──────────────────────────────────────────────────────────────
   Types (matches your API)
   ────────────────────────────────────────────────────────────── */
type Row = {
  ts: string | null;
  stationId: string | number | null;
  vote: string;
  comment: string;
  source: string;
  lat: number | null;
  lng: number | null;
  mlScore: number | null; // 0..1 (fraction)
  modelVersion: string;
  userAgent: string;
};

type ApiData = {
  ok: boolean;
  rows: Row[];
  stats: {
    total: number;
    good: number;
    bad: number;
    goodPct: number; // 0..1
    avgScore: number | null; // 0..1
    timeline: { day: string; count: number; avgScore: number | null }[];
  };
};

/* Lightweight point used for map/charts */
type FeedbackPoint = {
  id: string;
  stationName?: string;
  lat: number;
  lng: number;
  mlScore?: number; // 0..1
  sentiment?: "positive" | "neutral" | "negative";
  source?: string;
  createdAt?: string; // ISO
};

/* Filters/sort */
type Sentiment = "all" | "positive" | "neutral" | "negative";
type SortKey = "recent" | "oldest" | "scoreHigh" | "scoreLow";

/* ───────── ML badge (shows — if missing) ───────── */
function MlBadge({ score }: { score: number | null | undefined }) {
  const has = typeof score === "number" && Number.isFinite(score);
  if (!has) return <span style={{ opacity: 0.6 }}>—</span>;

  const pct = Math.round((score as number) * 100);
  const tone =
    pct >= 70
      ? { bg: "#dcfce7", text: "#166534", border: "#bbf7d0" }
      : pct >= 40
      ? { bg: "#fef9c3", text: "#854d0e", border: "#fde68a" }
      : { bg: "#fee2e2", text: "#991b1b", border: "#fecaca" };

  return (
    <span
      title={`Predicted reliability ${pct}%`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 8px",
        borderRadius: 999,
        border: `1px solid ${tone.border}`,
        background: tone.bg,
        color: tone.text,
        fontSize: 12,
        fontWeight: 700,
      }}
    >
      ML {pct}
    </span>
  );
}

/* Drawer helpers */
function gmapsUrl(lat: number, lng: number) {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}
async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    alert("Copied!");
  } catch {
    const ok = window.confirm(`Copy this:\n\n${text}`);
    if (ok) return;
  }
}
function isNumericId(id: unknown) {
  return typeof id === "number" || /^\d+$/.test(String(id ?? ""));
}

/* Relative time ("x minutes ago") */
function relativeTime(iso?: string | null) {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (!isFinite(t)) return "—";
  const diff = Date.now() - t;
  const s = Math.max(1, Math.round(diff / 1000));
  const m = Math.round(s / 60);
  const h = Math.round(m / 60);
  const d = Math.round(h / 24);
  if (s < 60) return `${s}s ago`;
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${d}d ago`;
}

/* ──────────────────────────────────────────────────────────────
   Page
   ────────────────────────────────────────────────────────────── */
export default function AdminFeedback() {
  const [data, setData] = useState<ApiData | null>(null);
  const [loading, setLoading] = useState(true);

  // filters
  const [sentiment, setSentiment] = useState<Sentiment>("all");
  const [scoreMin, setScoreMin] = useState<number>(0);
  const [scoreMax, setScoreMax] = useState<number>(100);
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [q, setQ] = useState<string>("");
  const [sort, setSort] = useState<SortKey>("recent");

  // ✅ NEW: model & source filters
  const [model, setModel] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");

  // drawer state
  const [selected, setSelected] = useState<Row | null>(null);

  // map fit trigger
  const [fitKey, setFitKey] = useState(0);

  // focus on the MAIN map (optional)
  const [focusPoint, setFocusPoint] = useState<
    { lat: number; lng: number; zoom?: number } | undefined
  >(undefined);
  const [focusKey, setFocusKey] = useState(0);

  // ✅ council state for the drawer
  const [council, setCouncil] = useState<CouncilHit | null>(null);
  const [councilLoading, setCouncilLoading] = useState(false);

  // table pagination
  const [page, setPage] = useState(1);
  const pageSize = 50;

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/feedback");
      const j = await r.json();
      setData(j);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // close on ESC
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSelected(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const rows = data?.rows || [];
  const stats = data?.stats;

  // ✅ NEW: distinct models & sources for dropdowns
  const modelOptions = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => r.modelVersion && s.add(r.modelVersion));
    return Array.from(s).sort();
  }, [rows]);

  const sourceOptions = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => r.source && s.add(r.source));
    return Array.from(s).sort();
  }, [rows]);

  // ✅ NEW: Today counters
  const today = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);

    let total = 0,
      good = 0,
      bad = 0,
      sumScore = 0,
      scoreN = 0;

    for (const r of rows) {
      const t = r.ts ? new Date(r.ts) : null;
      if (!t || t < start || t > end) continue;
      total++;
      const v = (r.vote || "").toLowerCase();
      if (v === "good" || v === "up" || v === "positive") good++;
      if (v === "bad" || v === "down" || v === "negative") bad++;
      if (typeof r.mlScore === "number" && isFinite(r.mlScore)) {
        sumScore += r.mlScore;
        scoreN++;
      }
    }
    const avgScore = scoreN ? sumScore / scoreN : null;
    return { total, good, bad, avgScore };
  }, [rows]);

  /* Adapt rows → points for map/charts */
  const points: FeedbackPoint[] = useMemo(() => {
    const toSentiment = (
      vote?: string | null
    ): FeedbackPoint["sentiment"] => {
      const v = (vote || "").toLowerCase();
      if (v === "good" || v === "up" || v === "positive") return "positive";
      if (v === "bad" || v === "down" || v === "negative") return "negative";
      return v ? "neutral" : undefined;
    };
    return rows
      .map((r, i) => {
        const lat = Number(r.lat);
        const lng = Number(r.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        return {
          id: String(r.stationId ?? i),
          stationName: r.stationId ? String(r.stationId) : undefined,
          lat,
          lng,
          mlScore: typeof r.mlScore === "number" ? r.mlScore : undefined,
          sentiment: toSentiment(r.vote),
          source: r.source || undefined,
          createdAt: r.ts || undefined,
        } as FeedbackPoint;
      })
      .filter(Boolean) as FeedbackPoint[];
  }, [rows]);

  /* Apply filters & sorting (table) */
  const filteredRows = useMemo(() => {
    const from = dateFrom ? new Date(dateFrom) : null;
    const to = dateTo ? new Date(dateTo) : null;
    const needle = q.trim().toLowerCase();

    let out = rows.filter((r) => {
      // sentiment
      if (sentiment !== "all") {
        const v = (r.vote || "").toLowerCase();
        const s =
          v === "good" || v === "up"
            ? "positive"
            : v === "bad" || v === "down"
            ? "negative"
            : "neutral";
        if (s !== sentiment) return false;
      }

      // score range (mlScore is 0..1; UI sliders are 0..100)
      if (Number.isFinite(r.mlScore ?? NaN)) {
        const s = (r.mlScore as number) * 100;
        if (s < scoreMin || s > scoreMax) return false;
      } else if (scoreMin > 0) return false;

      // date range
      if (from || to) {
        const t = r.ts ? new Date(r.ts) : null;
        if (from && (!t || t < from)) return false;
        if (to && (!t || t > to)) return false;
      }

      // ✅ NEW: model
      if (model !== "all") {
        if ((r.modelVersion || "") !== model) return false;
      }

      // ✅ NEW: source
      if (sourceFilter !== "all") {
        if ((r.source || "") !== sourceFilter) return false;
      }

      // search
      if (needle) {
        const hay = [
          r.comment ?? "",
          String(r.stationId ?? ""),
          r.source ?? "",
          r.vote ?? "",
          r.modelVersion ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(needle)) return false;
      }

      return true;
    });

    // sorting
    out.sort((a, b) => {
      if (sort === "recent")
        return (
          new Date(b.ts ?? 0).getTime() - new Date(a.ts ?? 0).getTime()
        );
      if (sort === "oldest")
        return (
          new Date(a.ts ?? 0).getTime() - new Date(b.ts ?? 0).getTime()
        );
      if (sort === "scoreHigh")
        return (b.mlScore ?? -Infinity) - (a.mlScore ?? -Infinity);
      if (sort === "scoreLow")
        return (a.mlScore ?? Infinity) - (b.mlScore ?? Infinity);
      return 0;
    });

    return out;
  }, [
    rows,
    sentiment,
    scoreMin,
    scoreMax,
    dateFrom,
    dateTo,
    q,
    sort,
    model,
    sourceFilter,
  ]);

  /* Keep map/charts in sync with filtered table */
  const filteredPoints: FeedbackPoint[] = useMemo(() => {
    if (!filteredRows.length) return points;
    const set = new Set(
      filteredRows.map((r, i) => `${r.stationId}|${r.ts ?? i}`)
    );
    return points.filter((p, i) =>
      set.has(`${p.stationName ?? ""}|${p.createdAt ?? i}`)
    );
  }, [points, filteredRows]);

  // bump fitKey whenever filteredPoints change (auto-fit)
  useEffect(() => {
    setFitKey((k) => k + 1);
  }, [filteredPoints]);

  // reset pagination when filters change
  useEffect(() => {
    setPage(1);
  }, [
    sentiment,
    scoreMin,
    scoreMax,
    dateFrom,
    dateTo,
    q,
    sort,
    model,
    sourceFilter,
    filteredRows.length,
  ]);

  /* ── CSV Export (filtered rows) ─────────────────────────────── */
  function escapeCSV(v: unknown): string {
    const s = v == null ? "" : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }
  function toISO(ts: string | null): string {
    try {
      return ts ? new Date(ts).toISOString() : "";
    } catch {
      return ts ?? "";
    }
  }
  function buildCSV(rowsIn: Row[]): string {
    const header = [
      "time_iso",
      "station",
      "vote",
      "mlScore",
      "comment",
      "source",
      "lat",
      "lng",
      "model",
      "userAgent",
    ];
    const body = rowsIn.map((r) => [
      toISO(r.ts),
      r.stationId ?? "",
      r.vote ?? "",
      r.mlScore ?? "",
      r.comment ?? "",
      r.source ?? "",
      Number.isFinite(r.lat ?? NaN) ? (r.lat as number).toFixed(6) : "",
      Number.isFinite(r.lng ?? NaN) ? (r.lng as number).toFixed(6) : "",
      r.modelVersion ?? "",
      r.userAgent ?? "",
    ]);
    const lines = [header, ...body]
      .map((arr) => arr.map(escapeCSV).join(","))
      .join("\n");
    return "\uFEFF" + lines; // Excel-friendly BOM
  }
  function downloadCSV() {
    const csv = buildCSV(filteredRows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    a.href = url;
    a.download = `feedback-export-${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // derived: selected row point
  const selectedPoint: FeedbackPoint | null = useMemo(() => {
    if (!selected) return null;
    const lat = Number(selected.lat);
    const lng = Number(selected.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return {
      id: String(selected.stationId ?? "sel"),
      stationName: selected.stationId
        ? String(selected.stationId)
        : undefined,
      lat,
      lng,
      mlScore:
        typeof selected.mlScore === "number"
          ? selected.mlScore
          : undefined,
      sentiment:
        (selected.vote || "").toLowerCase() === "good" ||
        (selected.vote || "").toLowerCase() === "up"
          ? "positive"
          : (selected.vote || "").toLowerCase() === "bad" ||
            (selected.vote || "").toLowerCase() === "down"
          ? "negative"
          : "neutral",
      source: selected.source || undefined,
      createdAt: selected.ts || undefined,
    };
  }, [selected]);

  // fetch council for the selected item
  useEffect(() => {
    let alive = true;
    (async () => {
      setCouncil(null);
      if (
        !selected ||
        !Number.isFinite(selected.lat ?? NaN) ||
        !Number.isFinite(selected.lng ?? NaN)
      )
        return;
      setCouncilLoading(true);
      const hit = await getCouncilAtPoint(
        Number(selected.lat),
        Number(selected.lng)
      );
      if (alive) {
        setCouncil(hit);
        setCouncilLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [selected?.lat, selected?.lng]);

  /* Pagination slice */
  const total = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const clampedPage = Math.min(page, totalPages);
  const startIdx = (clampedPage - 1) * pageSize;
  const endIdx = Math.min(startIdx + pageSize, total);
  const pageRows = filteredRows.slice(startIdx, endIdx);

  /* Search highlighter */
  function highlight(s: string | number | null | undefined) {
    const text = String(s ?? "");
    const needle = q.trim();
    if (!needle) return text;
    const parts = text.split(
      new RegExp(`(${escapeRegExp(needle)})`, "ig")
    );
    return (
      <>
        {parts.map((chunk, i) =>
          chunk.toLowerCase() === needle.toLowerCase() ? (
            <mark
              key={i}
              style={{
                background: "#fde68a",
                padding: "0 2px",
                borderRadius: 3,
              }}
            >
              {chunk}
            </mark>
          ) : (
            <span key={i}>{chunk}</span>
          )
        )}
      </>
    );
  }

  return (
    <div
      style={{
        padding: 18,
        maxWidth: 1100,
        margin: "0 auto",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>
        Autodun Admin · Feedback
      </h1>

      {/* KPIs */}
      <div
        style={{
          display: "flex",
          gap: 10,
          marginTop: 14,
          flexWrap: "wrap",
        }}
      >
        <StatCard label="Total" value={fmt(stats?.total)} />
        <StatCard label="Good" value={fmt(stats?.good)} />
        <StatCard label="Bad" value={fmt(stats?.bad)} />
        <StatCard label="% Good" value={pct(stats?.goodPct)} />
        <StatCard label="Avg ML Score" value={score(stats?.avgScore)} />
        {/* ✅ NEW: today counters */}
        <StatCard label="Today · Good" value={fmt(today.good)} />
        <StatCard label="Today · Bad" value={fmt(today.bad)} />
        <StatCard label="Today · Avg ML" value={score(today.avgScore)} />
        <button onClick={load} style={refreshBtn}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {/* Filters */}
      <div style={panel}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 12,
          }}
        >
          <div style={{ fontWeight: 800 }}>Filters</div>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={() => {
                setSentiment("all");
                setScoreMin(0);
                setScoreMax(100);
                setDateFrom("");
                setDateTo("");
                setQ("");
                setSort("recent");
                setModel("all"); // reset new filters
                setSourceFilter("all"); // reset new filters
              }}
              style={refreshBtn}
            >
              Reset
            </button>
            <a
              href="/api/admin/feedback-export"
              target="_blank"
              rel="noopener"
            >
              <button type="button" style={primaryBtn}>
                Export CSV
              </button>
            </a>
          </div>
        </div>

        {/* ✅ grid expanded to 8 columns */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(8, minmax(0,1fr))",
            gap: 10,
          }}
        >
          {/* Sentiment */}
          <div>
            <div style={label}>Sentiment</div>
            <select
              value={sentiment}
              onChange={(e) =>
                setSentiment(e.target.value as Sentiment)
              }
              style={input}
            >
              <option value="all">All</option>
              <option value="positive">Positive</option>
              <option value="neutral">Neutral</option>
              <option value="negative">Negative</option>
            </select>
          </div>

          {/* Score min */}
          <div>
            <div style={label}>Score ≥</div>
            <input
              type="number"
              min={0}
              max={100}
              value={scoreMin}
              onChange={(e) => setScoreMin(Number(e.target.value) || 0)}
              style={input}
            />
          </div>

          {/* Score max */}
          <div>
            <div style={label}>Score ≤</div>
            <input
              type="number"
              min={0}
              max={100}
              value={scoreMax}
              onChange={(e) => setScoreMax(Number(e.target.value) || 100)}
              style={input}
            />
          </div>

          {/* From */}
          <div>
            <div style={label}>From</div>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              style={input}
            />
          </div>

          {/* To */}
          <div>
            <div style={label}>To</div>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              style={input}
            />
          </div>

          {/* Search */}
          <div>
            <div style={label}>Search</div>
            <input
              placeholder="comment / station / source"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={input}
            />
          </div>

          {/* ✅ NEW: Model */}
          <div>
            <div style={label}>Model</div>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              style={input}
            >
              <option value="all">All</option>
              {modelOptions.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          {/* ✅ NEW: Source */}
          <div>
            <div style={label}>Source</div>
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              style={input}
            >
              <option value="all">All</option>
              {sourceOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 10,
            marginTop: 12,
            alignItems: "center",
          }}
        >
          <div>
            <div style={label}>Sort</div>
            <select
              value={sort}
              onChange={(e) =>
                setSort(e.target.value as SortKey)
              }
              style={input}
            >
              <option value="recent">Recent</option>
              <option value="oldest">Oldest</option>
              <option value="scoreHigh">Score: High → Low</option>
              <option value="scoreLow">Score: Low → High</option>
            </select>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div style={panel}>
        <div
          style={{ fontWeight: 800, marginBottom: 8 }}
        >
          Timeline (last {stats?.timeline?.length ?? 0} days)
        </div>
        {!stats || !stats.timeline.length ? (
          <div style={{ color: "#6b7280", fontSize: 14 }}>
            No data yet.
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "120px 1fr 120px",
              gap: 8,
            }}
          >
            <div style={{ fontSize: 12, color: "#6b7280" }}>
              Date
            </div>
            <div style={{ fontSize: 12, color: "#6b7280" }}>
              Bar (count)
            </div>
            <div style={{ fontSize: 12, color: "#6b7280" }}>
              Avg ML
            </div>
            {stats.timeline.map((d) => (
              <FragmentRow
                key={d.day}
                day={d.day}
                count={d.count}
                avg={d.avgScore}
              />
            ))}
          </div>
        )}
      </div>

      {/* Map */}
      <div style={panel}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 8,
          }}
        >
          <div style={{ fontWeight: 800 }}>Feedback Map</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              style={refreshBtn}
              onClick={() => setFitKey((k) => k + 1)}
              title="Fit map to current results"
            >
              Fit to results
            </button>
          </div>
        </div>
        <div
          style={{
            width: "100%",
            height: 420,
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          <MapClient
            points={filteredPoints}
            fitToPointsKey={fitKey}
            focusPoint={focusPoint}
            focusKey={focusKey}
          />
        </div>
      </div>

      {/* Charts */}
      <div style={panel}>
        <div
          style={{ fontWeight: 800, marginBottom: 8 }}
        >
          Analytics
        </div>
        <ChartsClient points={filteredPoints} />
      </div>

      {/* Worst stations */}
      <div style={panel}>
        <WorstStationsClient rows={filteredRows} />
      </div>

      {/* Table + Pagination */}
      <div style={panel}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 8,
          }}
        >
          <div style={{ fontWeight: 800 }}>Latest feedback</div>

          {/* Pagination controls */}
          <div
            style={{
              display: "flex",
              gap: 6,
              alignItems: "center",
            }}
          >
            <span
              style={{ fontSize: 12, color: "#6b7280" }}
            >
              {total === 0
                ? "0–0"
                : `${startIdx + 1}–${endIdx}`}{" "}
              of {total}
            </span>
            <button
              style={miniBtn}
              onClick={() => setPage(1)}
              disabled={clampedPage <= 1}
            >
              « First
            </button>
            <button
              style={miniBtn}
              onClick={() =>
                setPage((p) => Math.max(1, p - 1))
              }
              disabled={clampedPage <= 1}
            >
              ‹ Prev
            </button>
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                minWidth: 60,
                textAlign: "center",
              }}
            >
              Page {clampedPage}/{totalPages}
            </div>
            <button
              style={miniBtn}
              onClick={() =>
                setPage((p) =>
                  Math.min(totalPages, p + 1)
                )
              }
              disabled={clampedPage >= totalPages}
            >
              Next ›
            </button>
            <button
              style={miniBtn}
              onClick={() => setPage(totalPages)}
              disabled={clampedPage >= totalPages}
            >
              Last »
            </button>
          </div>
        </div>

        <div
          style={{
            overflowX: "auto",
            maxHeight: 520,
            position: "relative",
          }}
        >
          <table style={table}>
            <thead>
              <tr>
                <th style={thSticky}>Time</th>
                <th style={thSticky}>Station</th>
                <th style={thSticky}>Vote</th>
                <th style={thSticky}>mlScore</th>
                <th style={thSticky}>Comment</th>
                <th style={thSticky}>Source</th>
                <th style={thSticky}>Lat</th>
                <th style={thSticky}>Lng</th>
                <th style={thSticky}>Model</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r, i) => {
                const rowKey = `${startIdx + i}`;
                const latOk = Number.isFinite(r.lat ?? NaN);
                const lngOk = Number.isFinite(r.lng ?? NaN);
                const latStr = latOk
                  ? (r.lat as number).toFixed(6)
                  : "—";
                const lngStr = lngOk
                  ? (r.lng as number).toFixed(6)
                  : "—";
                const stationStr = r.stationId ?? "—";
                return (
                  <tr
                    key={rowKey}
                    onClick={() => setSelected(r)}
                    style={{ cursor: "pointer" }}
                  >
                    <td title={r.ts || ""}>
                      {r.ts
                        ? new Date(r.ts).toLocaleString()
                        : "—"}
                    </td>

                    {/* Station + copy */}
                    <td>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <code
                          style={{
                            fontFamily:
                              "ui-monospace, SFMono-Regular, Menlo, monospace",
                          }}
                        >
                          {highlight(stationStr)}
                        </code>
                        {r.stationId != null && (
                          <button
                            style={copyIconBtn}
                            onClick={(e) => {
                              e.stopPropagation();
                              copy(String(r.stationId));
                            }}
                            title="Copy Station ID"
                          >
                            ⧉
                          </button>
                        )}
                      </div>
                    </td>

                    {/* Vote */}
                    <td
                      style={{
                        fontWeight: 700,
                        color:
                          r.vote === "good" || r.vote === "up"
                            ? "#166534"
                            : "#991b1b",
                      }}
                    >
                      {r.vote || "—"}
                    </td>

                    {/* ML Score */}
                    <td>
                      <MlBadge score={r.mlScore} />
                    </td>

                    {/* Comment (ellipsized, highlight) */}
                    <td
                      style={{
                        maxWidth: 360,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                      title={r.comment || ""}
                    >
                      {highlight(r.comment || "—")}
                    </td>

                    {/* Source (highlight) */}
                    <td>{highlight(r.source || "—")}</td>

                    {/* Lat with copy */}
                    <td style={monoCell}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <span>{latStr}</span>
                        {latOk && (
                          <button
                            style={copyIconBtn}
                            onClick={(e) => {
                              e.stopPropagation();
                              copy(latStr);
                            }}
                            title="Copy latitude"
                          >
                            ⧉
                          </button>
                        )}
                      </div>
                    </td>

                    {/* Lng with copy */}
                    <td style={monoCell}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <span>{lngStr}</span>
                        {lngOk && (
                          <button
                            style={copyIconBtn}
                            onClick={(e) => {
                              e.stopPropagation();
                              copy(lngStr);
                            }}
                            title="Copy longitude"
                          >
                            ⧉
                          </button>
                        )}
                      </div>
                    </td>

                    <td>{r.modelVersion || "—"}</td>
                  </tr>
                );
              })}
              {pageRows.length === 0 && (
                <tr>
                  <td
                    colSpan={9}
                    style={{ color: "#6b7280", textAlign: "center" }}
                  >
                    No rows
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Drawer */}
      {selected && (
        <>
          <div
            style={backdrop}
            onClick={() => setSelected(null)}
          />
          <aside style={drawer}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div
                style={{ fontWeight: 800, fontSize: 16 }}
              >
                Station {selected.stationId ?? "—"}
              </div>
              <button
                onClick={() => setSelected(null)}
                style={iconBtn}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {/* Relative + absolute time */}
            <div
              style={{
                marginTop: 8,
                color: "#6b7280",
                fontSize: 13,
              }}
            >
              {relativeTime(selected.ts)} ·{" "}
              {selected.ts
                ? new Date(selected.ts).toLocaleString()
                : "—"}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 8,
                marginTop: 12,
              }}
            >
              <Info label="Vote" value={selected.vote || "—"} />
              <Info
                label="Source"
                value={selected.source || "—"}
              />
              <Info
                label="Model"
                value={selected.modelVersion || "—"}
              />
              <Info
                label="User Agent"
                value={selected.userAgent || "—"}
              />
              <Info
                label="Lat"
                value={
                  Number.isFinite(selected.lat ?? NaN)
                    ? (selected.lat as number).toFixed(6)
                    : "—"
                }
              />
              <Info
                label="Lng"
                value={
                  Number.isFinite(selected.lng ?? NaN)
                    ? (selected.lng as number).toFixed(6)
                    : "—"
                }
              />
            </div>

            {/* Copy Station ID / Zoom on main map */}
            <div
              style={{ display: "flex", gap: 8, marginTop: 8 }}
            >
              {selected.stationId != null && (
                <button
                  style={ghostBtn}
                  onClick={() =>
                    copy(String(selected.stationId))
                  }
                >
                  Copy Station ID
                </button>
              )}
              {Number.isFinite(selected.lat ?? NaN) &&
                Number.isFinite(selected.lng ?? NaN) && (
                  <button
                    style={ghostBtn}
                    onClick={() => {
                      setFocusPoint({
                        lat: Number(selected.lat),
                        lng: Number(selected.lng),
                        zoom: 14,
                      });
                      setFocusKey((k) => k + 1);
                    }}
                  >
                    Zoom on main map
                  </button>
                )}
            </div>

            {/* Council */}
            <div
              style={{
                marginTop: 12,
                border: "1px solid #e5e7eb",
                borderRadius: 12,
                padding: 10,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ fontWeight: 800 }}>Council</div>
                <div
                  style={{ display: "flex", gap: 6 }}
                >
                  <button
                    style={miniBtn}
                    onClick={() =>
                      council?.code && copy(council.code)
                    }
                    disabled={!council?.code}
                    title="Copy council code"
                  >
                    Copy code
                  </button>
                  {Number.isFinite(selected.lat ?? NaN) &&
                    Number.isFinite(selected.lng ?? NaN) && (
                      <button
                        style={miniBtn}
                        onClick={() => {
                          setFocusPoint({
                            lat: Number(selected.lat),
                            lng: Number(selected.lng),
                            zoom: 11,
                          });
                          setFocusKey((k) => k + 1);
                        }}
                        title="Zoom to council area"
                      >
                        Zoom
                      </button>
                    )}
                </div>
              </div>

              {!(
                Number.isFinite(selected.lat ?? NaN) &&
                Number.isFinite(selected.lng ?? NaN)
              ) ? (
                <div
                  style={{
                    marginTop: 6,
                    color: "#6b7280",
                    fontSize: 13,
                  }}
                >
                  No coordinates on this feedback.
                </div>
              ) : councilLoading ? (
                <div
                  style={{
                    marginTop: 6,
                    color: "#6b7280",
                    fontSize: 13,
                  }}
                >
                  Looking up council…
                </div>
              ) : council ? (
                <div
                  style={{ marginTop: 6, fontSize: 14 }}
                >
                  <div>
                    <span style={{ color: "#6b7280" }}>
                      Name:
                    </span>{" "}
                    {council.name}
                  </div>
                  {council.code && (
                    <div>
                      <span style={{ color: "#6b7280" }}>
                        Code:
                      </span>{" "}
                      {council.code}
                    </div>
                  )}
                  {council.region && (
                    <div>
                      <span style={{ color: "#6b7280" }}>
                        Region:
                      </span>{" "}
                      {council.region}
                    </div>
                  )}
                  {council.country && (
                    <div>
                      <span style={{ color: "#6b7280" }}>
                        Country:
                      </span>{" "}
                      {council.country}
                    </div>
                  )}
                </div>
              ) : (
                <div
                  style={{
                    marginTop: 6,
                    color: "#6b7280",
                    fontSize: 13,
                  }}
                >
                  No council found for this point.
                </div>
              )}
            </div>

            {/* Comment */}
            <div style={{ marginTop: 12 }}>
              <div
                style={{
                  fontSize: 12,
                  color: "#6b7280",
                  marginBottom: 4,
                }}
              >
                Comment
              </div>
              <div
                style={{
                  padding: 10,
                  border: "1px solid #e5e7eb",
                  borderRadius: 10,
                  whiteSpace: "pre-wrap",
                }}
              >
                {selected.comment || "—"}
              </div>
            </div>

            {/* ML Score */}
            <div style={{ marginTop: 12 }}>
              <div
                style={{
                  fontSize: 12,
                  color: "#6b7280",
                  marginBottom: 4,
                }}
              >
                ML Score
              </div>
              <div>
                <MlBadge score={selected.mlScore} />
              </div>
            </div>

            {/* Mini map + actions */}
            {selectedPoint && (
              <div style={{ marginTop: 12 }}>
                <div
                  style={{
                    fontSize: 12,
                    color: "#6b7280",
                    marginBottom: 4,
                  }}
                >
                  Location
                </div>
                <div
                  style={{
                    height: 240,
                    borderRadius: 12,
                    overflow: "hidden",
                    border: "1px solid #e5e7eb",
                  }}
                >
                  <MapClient points={[selectedPoint]} />
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    marginTop: 10,
                  }}
                >
                  <button
                    style={primaryBtn}
                    onClick={() =>
                      window.open(
                        gmapsUrl(
                          selectedPoint.lat,
                          selectedPoint.lng
                        ),
                        "_blank"
                      )
                    }
                  >
                    Directions
                  </button>
                  <button
                    style={ghostBtn}
                    onClick={() =>
                      copy(
                        `${selectedPoint.lat},${selectedPoint.lng}`
                      )
                    }
                  >
                    Copy coords
                  </button>
                  {isNumericId(selected?.stationId) && (
                    <button
                      style={ghostBtn}
                      onClick={() =>
                        window.open(
                          `https://openchargemap.org/site/poi/${selected!.stationId}`,
                          "_blank"
                        )
                      }
                    >
                      Open in OCM
                    </button>
                  )}
                </div>
              </div>
            )}
          </aside>
        </>
      )}
    </div>
  );
}

/* ─────────────── Small presentational pieces ─────────────── */
function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: "10px 12px",
        border: "1px solid #e5e7eb",
        background: "#fff",
        borderRadius: 12,
        minWidth: 140,
      }}
    >
      <div style={{ fontSize: 12, color: "#6b7280" }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800 }}>{value}</div>
    </div>
  );
}

function FragmentRow({
  day,
  count,
  avg,
}: {
  day: string;
  count: number;
  avg: number | null;
}) {
  const width = Math.min(360, 16 * count);
  return (
    <>
      <div style={{ fontSize: 13 }}>{day}</div>
      <div
        style={{
          height: 10,
          background: "#f3f4f6",
          borderRadius: 999,
        }}
      >
        <div
          style={{
            height: 10,
            width,
            background: "#2563eb",
            borderRadius: 999,
          }}
        />
      </div>
      <div style={{ fontSize: 13 }}>
        {avg == null ? "—" : avg.toFixed(3)}
      </div>
    </>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: "#6b7280" }}>{label}</div>
      <div style={{ fontWeight: 700 }}>{value}</div>
    </div>
  );
}

/* ─────────────── styles ─────────────── */
const panel: React.CSSProperties = {
  marginTop: 14,
  padding: 12,
  border: "1px solid #e5e7eb",
  background: "#fff",
  borderRadius: 12,
};

const table: React.CSSProperties = {
  width: "100%",
  borderCollapse: "separate",
  borderSpacing: 0,
};

const thSticky: React.CSSProperties = {
  position: "sticky",
  top: 0,
  background: "#fff",
  zIndex: 1,
  boxShadow: "inset 0 -1px 0 #e5e7eb",
  textAlign: "left",
  padding: "8px 6px",
};

const miniBtn: React.CSSProperties = {
  padding: "6px 8px",
  border: "1px solid #e5e7eb",
  background: "#fff",
  borderRadius: 8,
  fontWeight: 700,
  cursor: "pointer",
  fontSize: 12,
};

const copyIconBtn: React.CSSProperties = {
  width: 24,
  height: 24,
  borderRadius: 6,
  border: "1px solid #e5e7eb",
  background: "#fff",
  cursor: "pointer",
  fontSize: 12,
  lineHeight: "1",
};

const monoCell: React.CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
};

const refreshBtn: React.CSSProperties = {
  padding: "10px 12px",
  border: "1px solid #e5e7eb",
  background: "#fff",
  borderRadius: 12,
  fontWeight: 700,
  cursor: "pointer",
};

const primaryBtn: React.CSSProperties = {
  padding: "10px 12px",
  border: "1px solid #2563eb",
  background: "#2563eb",
  color: "#fff",
  borderRadius: 12,
  fontWeight: 700,
  cursor: "pointer",
};

const ghostBtn: React.CSSProperties = {
  padding: "10px 12px",
  border: "1px solid #e5e7eb",
  background: "#fff",
  color: "#111827",
  borderRadius: 12,
  fontWeight: 700,
  cursor: "pointer",
};

const label: React.CSSProperties = {
  fontSize: 12,
  color: "#6b7280",
  marginBottom: 4,
};

const input: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid #e5e7eb",
  borderRadius: 10,
  background: "#fff",
};

const backdrop: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.4)",
  zIndex: 50,
};

const drawer: React.CSSProperties = {
  position: "fixed",
  top: 0,
  right: 0,
  width: 420,
  maxWidth: "90vw",
  height: "100%",
  background: "#fff",
  borderLeft: "1px solid #e5e7eb",
  boxShadow: "-8px 0 24px rgba(0,0,0,0.08)",
  zIndex: 60,
  padding: 16,
  display: "flex",
  flexDirection: "column",
  overflowY: "auto",
};

const iconBtn: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 8,
  border: "1px solid #e5e7eb",
  background: "#fff",
  cursor: "pointer",
  fontSize: 16,
  lineHeight: "1",
};

/* tiny utils */
function fmt(n?: number | null) {
  return (n ?? 0).toLocaleString();
}
function pct(p?: number | null) {
  return p == null ? "—" : `${Math.round((p as number) * 100)}%`;
}
function score(s?: number | null) {
  return s == null ? "—" : (s as number).toFixed(3);
}
function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
