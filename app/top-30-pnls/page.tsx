"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Navigation } from "@/components/polycopy/navigation";
import Top30WindowChart from "@/components/top30/Top30WindowChart";
import type { RealizedIndexSeriesEntry, RealizedIndexWindow } from "@/lib/realized-pnl-index";

const WINDOW_OPTIONS = [
  { key: "7D", label: "Last 7 Days" },
  { key: "30D", label: "30 Days" },
  { key: "90D", label: "3 Months" },
  { key: "180D", label: "6 Months" },
  { key: "365D", label: "Past Year" },
  { key: "ALL", label: "All Time" },
] as const;

type WindowKey = typeof WINDOW_OPTIONS[number]["key"];
type ChartMode = "daily" | "cumulative";

function parseNumber(value: any) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

function formatCurrency(value: number) {
  return `${value >= 0 ? "+" : "-"}${currencyFormatter.format(Math.abs(value))}`;
}

function formatShortDate(value: string | null | undefined) {
  if (!value) return "Unknown date";
  const parsed = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

const formatRangeLabel = (start: string | null | undefined, end: string | null | undefined) => {
  if (!start || !end) return "Date range unavailable";
  return `${formatShortDate(start)} – ${formatShortDate(end)}`;
};

export default function Top30PnlsPage() {
  const [dailyRows, setDailyRows] = useState<RealizedIndexSeriesEntry[]>([]);
  const [windows, setWindows] = useState<Record<string, RealizedIndexWindow>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedWindowKey, setSelectedWindowKey] = useState<WindowKey>("30D");
  const [averageChartMode, setAverageChartMode] = useState<ChartMode>("daily");
  const [aggregateChartMode, setAggregateChartMode] = useState<ChartMode>("daily");
  const [asOf, setAsOf] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/realized-pnl/index", { cache: "no-store" });
        if (!response.ok) {
          throw new Error("Failed to load Top 30 windows");
        }
        const payload: {
          series?: RealizedIndexSeriesEntry[];
          windows?: RealizedIndexWindow[];
          latestAsOf?: string;
          error?: string;
        } = await response.json();
        if (cancelled) return;
        setDailyRows(payload.series ?? []);
        setAsOf(payload.latestAsOf ?? null);
        const windowsPayload = payload.windows ?? [];
        const windowsMap = windowsPayload.reduce<Record<string, RealizedIndexWindow>>((acc, window) => {
          if (window?.window_key) {
            acc[window.window_key] = window;
          }
          return acc;
        }, {});
        setWindows(windowsMap);
        if (payload.error) {
          setError(payload.error);
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load window data");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  const normalizedRows = useMemo(
    () =>
      dailyRows
        .map((row) => ({
          date: row.date,
          totalRealized: parseNumber(row.total_realized_pnl),
          averageRealized: parseNumber(row.average_realized_pnl),
          cumulativeRealized: parseNumber(row.cumulative_realized_pnl),
          cumulativeAverage: parseNumber(row.cumulative_average_pnl),
        }))
        .filter((row) => typeof row.date === "string" && row.date.length > 0)
        .sort((a, b) => a.date.localeCompare(b.date)),
    [dailyRows]
  );

  const selectedWindow = windows[selectedWindowKey];

  const windowRows = useMemo(() => {
    if (!selectedWindow) return normalizedRows;
    const startDate = selectedWindow.start_date;
    const endDate = selectedWindow.as_of;
    return normalizedRows.filter((row) => {
      if (startDate && row.date < startDate) return false;
      if (endDate && row.date > endDate) return false;
      return true;
    });
  }, [normalizedRows, selectedWindow]);

  const averageChartRows = useMemo(
    () =>
      windowRows.map((row) => ({
        date: row.date,
        dailyValue: row.averageRealized,
        cumulativeValue: row.cumulativeAverage,
      })),
    [windowRows]
  );

  const aggregateChartRows = useMemo(
    () =>
      windowRows.map((row) => ({
        date: row.date,
        dailyValue: row.totalRealized,
        cumulativeValue: row.cumulativeRealized,
      })),
    [windowRows]
  );

  const latestRow = normalizedRows[normalizedRows.length - 1];
  const cumulativeLabel = latestRow ? formatCurrency(latestRow.cumulativeRealized) : "$0";

  const windowRangeLabel = selectedWindow
    ? formatRangeLabel(selectedWindow.start_date, selectedWindow.as_of)
    : "Date range unavailable";

  return (
    <main className="min-h-screen bg-slate-50">
      <Navigation />
      <div className="bg-slate-50 py-10">
        <div className="mx-auto max-w-6xl space-y-6 px-4">
          <section className="rounded-[28px] border border-slate-200 bg-white/80 p-6 shadow-lg shadow-slate-900/10">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Top 30 Windows</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-900">Top 30 Realized P&amp;L</h1>
            <p className="mt-3 text-base text-slate-500">
              View the aggregated daily and cumulative realized P&amp;L for the Top 30 ranked wallets across the
              most common lookback windows.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {WINDOW_OPTIONS.map((option) => (
                <button
                  key={option.key}
                  onClick={() => setSelectedWindowKey(option.key)}
                  className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold transition ${
                    selectedWindowKey === option.key
                      ? "border-slate-900 bg-slate-900 text-white shadow-sm"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </section>

          {error && (
            <section className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
              {error}
            </section>
          )}

          <section className="rounded-[28px] border border-slate-200 bg-white shadow-lg shadow-slate-900/10">
            <div className="px-6 py-5 border-b border-slate-100">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Average Realized P&amp;L</p>
                  <p className="text-sm text-slate-500">{windowRangeLabel}</p>
                </div>
                <div className="flex items-center gap-3 text-sm text-slate-500">
                  <span className="text-xs uppercase tracking-[0.3em] text-slate-400">Mode</span>
                  {(["daily", "cumulative"] as ChartMode[]).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setAverageChartMode(mode)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                        averageChartMode === mode
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      {mode === "daily" ? "Daily Change" : "Accumulated"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="px-6 py-6">
              {loading && !windowRows.length ? (
                <div className="flex h-48 items-center justify-center text-sm text-slate-500">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading average chart...
                </div>
              ) : (
                <Top30WindowChart
                  rows={averageChartRows}
                  mode={averageChartMode}
                  gradientIdSuffix="average"
                />
              )}
            </div>
          </section>

          <section className="rounded-[28px] border border-slate-200 bg-white shadow-lg shadow-slate-900/10">
            <div className="px-6 py-5 border-b border-slate-100">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Aggregate Realized P&amp;L</p>
                  <p className="text-sm text-slate-500">{windowRangeLabel}</p>
                </div>
                <div className="flex items-center gap-3 text-sm text-slate-500">
                  <span className="text-xs uppercase tracking-[0.3em] text-slate-400">Mode</span>
                  {(["daily", "cumulative"] as ChartMode[]).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setAggregateChartMode(mode)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                        aggregateChartMode === mode
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      {mode === "daily" ? "Daily Change" : "Accumulated"}
                    </button>
                  ))}
                </div>
                <div className="rounded-full border border-slate-200 px-3 py-1 text-xs uppercase tracking-[0.3em] text-slate-500">
                  Latest cumulative {cumulativeLabel}
                </div>
              </div>
            </div>
            <div className="px-6 py-6">
              {loading && !windowRows.length ? (
                <div className="flex h-48 items-center justify-center text-sm text-slate-500">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading aggregate chart...
                </div>
              ) : (
                <Top30WindowChart
                  rows={aggregateChartRows}
                  mode={aggregateChartMode}
                  gradientIdSuffix="aggregate"
                />
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
