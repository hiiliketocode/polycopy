"use client";

import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type ChartPoint = {
  date: string;
  totalRealized: number;
  cumulativeRealized: number;
};

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

const formatFullDate = (value: string) => {
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
};

const formatTooltipCurrency = (value: number) => {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${tooltipCurrencyFormatter.format(Math.abs(value))}`;
};

interface RealizedIndexChartProps {
  data: ChartPoint[];
}

export default function RealizedIndexChart({ data }: RealizedIndexChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-sm text-slate-500">
        <p>No index data available yet.</p>
        <p className="mt-1 text-xs text-slate-400">Try again once the leaderboard populates.</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 16, right: 28, bottom: 4, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b33" />
        <XAxis
          dataKey="date"
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
          tick={{ fontSize: 11, fill: "#cbd5f5" }}
          tickMargin={10}
          tickFormatter={(value) => formatShortDate(String(value))}
          minTickGap={32}
        />
        <YAxis
          axisLine={false}
          tickLine={false}
          tickMargin={10}
          tick={{ fontSize: 11, fill: "#cbd5f5" }}
          tickFormatter={(value) => formatTooltipCurrency(Number(value))}
          domain={["auto", "auto"]}
        />
        <Tooltip
          labelFormatter={(label) => formatFullDate(String(label))}
          formatter={(value: any, name: string) => {
            if (name === "totalRealized") {
              return [formatTooltipCurrency(Number(value)), "Daily aggregate"];
            }
            return [formatTooltipCurrency(Number(value)), "Cumulative"];
          }}
          contentStyle={{
            borderRadius: 12,
            borderColor: "#1e293b33",
            fontSize: "0.85rem",
            backgroundColor: "#0f172a",
            color: "white",
          }}
        />
        <ReferenceLine y={0} stroke="#334155" strokeDasharray="3 3" />
        <Bar dataKey="totalRealized" barSize={16} radius={[6, 6, 0, 0]}>
          {data.map((entry, index) => (
            <Cell
              key={`daily-${entry.date}-${index}`}
              fill={entry.totalRealized >= 0 ? "#34d399" : "#f87171"}
            />
          ))}
        </Bar>
        <Line
          type="monotone"
          dataKey="cumulativeRealized"
          stroke="#3b82f6"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: "#3b82f6", fill: "white" }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
