"use client";

import { useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
} from "recharts";

type Top30WindowChartRow = {
  date: string;
  dailyValue: number;
  cumulativeValue: number;
};

type ChartMode = "daily" | "cumulative";

const tooltipCurrencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const formatShortDate = (value: string) => {
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
};

const formatTooltipCurrency = (value: number) => {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${tooltipCurrencyFormatter.format(Math.abs(value))}`;
};

interface RealizedIndexChartProps {
  rows: Top30WindowChartRow[];
  mode: ChartMode;
  gradientIdSuffix: string;
}

export default function Top30WindowChart({ rows, mode, gradientIdSuffix }: RealizedIndexChartProps) {
  const dataset = useMemo(
    () =>
      rows
        .map((row) => ({
          date: row.date,
          value: mode === "daily" ? row.dailyValue : row.cumulativeValue,
        }))
        .filter((entry) => entry.date && Number.isFinite(entry.value)),
    [mode, rows]
  );

  if (dataset.length === 0) {
    return <div className="text-sm text-slate-500">No realized P&L data available.</div>;
  }

  const areaGradientId = `top30-${gradientIdSuffix}-area`;

  return (
    <div className="h-72 w-full sm:h-80">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={dataset} barSize={12} barCategoryGap="20%">
          <defs>
            <linearGradient id={areaGradientId} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#10b981" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#10b981" stopOpacity={0.03} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey="date"
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
            tick={{ fontSize: 11, fill: "#475569" }}
            tickMargin={10}
            tickFormatter={(value) => formatShortDate(String(value))}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tickMargin={6}
            tick={{ fontSize: 11, fill: "#475569" }}
            tickFormatter={(value) => formatTooltipCurrency(Number(value))}
            domain={["auto", "auto"]}
          />
          <Tooltip
            formatter={(value: any) => formatTooltipCurrency(Number(value))}
            contentStyle={{ borderRadius: 12, borderColor: "#e2e8f0", fontSize: "0.85rem" }}
          />
          <ReferenceLine y={0} stroke="#cbd5e1" />
          <Bar dataKey="value" fill={`url(#${areaGradientId})`} isAnimationActive />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
