import React, { useState } from "react";
import { useAppStore } from "../store";
import { calculateBMI, getBMICategory, safeFormat } from "../lib/utils";
import { friendlyFirebaseError } from "../lib/friendlyFirebaseError";
import { Pin, Plus, ChevronDown, ChevronUp } from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { AddWeightModal } from "./AddWeightModal";
import { cn } from "../lib/utils";
import { parseISO, subDays } from "date-fns";

export function WeightCard({
  isPinned,
  onPin,
}: {
  isPinned?: boolean;
  onPin?: () => void;
}) {
  const { profile, weightEntries, addWeightEntry } = useAppStore();
  const [showAddWeight, setShowAddWeight] = useState(false);
  const [timeFilter, setTimeFilter] = useState<"30d" | "90d" | "all">("30d");
  const [isExpanded, setIsExpanded] = useState(false);
  const [showAllLogs, setShowAllLogs] = useState(false);

  const sortedEntries = [...weightEntries].sort((a, b) => {
    return new Date(a.date).getTime() - new Date(b.date).getTime();
  });

  const latestEntry = sortedEntries[sortedEntries.length - 1];
  const hasEntries = !!latestEntry;

  let bmi = 0;
  let bmiCategory = "";
  let badgeColor = "";

  if (hasEntries && profile.heightCm) {
    bmi = calculateBMI(latestEntry.weight, profile.heightCm);
    bmiCategory = getBMICategory(bmi);

    if (bmiCategory === "Normal weight")
      badgeColor =
        "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20";
    else if (bmiCategory === "Underweight")
      badgeColor =
        "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20";
    else if (bmiCategory === "Overweight")
      badgeColor =
        "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20";
    else
      badgeColor =
        "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20";
  }

  const now = new Date();
  const filteredEntries = sortedEntries.filter((e) => {
    if (timeFilter === "all") return true;
    const entryDate = parseISO(e.date);
    if (timeFilter === "30d") return entryDate >= subDays(now, 30);
    if (timeFilter === "90d") return entryDate >= subDays(now, 90);
    return true;
  });

  const weights = filteredEntries.map((e) => e.weight);
  const minWeight = weights.length ? Math.min(...weights) : 0;
  const maxWeight = weights.length ? Math.max(...weights) : 0;
  const yDomain = [
    Math.max(0, Math.floor(minWeight - 5)),
    Math.ceil(maxWeight + 5),
  ];

  const handleAddWeight = async (weight: number, date: string) => {
    const existingEntry = weightEntries.find((w) => w.date === date);
    try {
      await addWeightEntry({
        id: existingEntry ? existingEntry.id : crypto.randomUUID(),
        weight,
        date,
        createdAt: Date.now(),
      });
      setShowAddWeight(false);
    } catch (e: any) {
      alert(friendlyFirebaseError(e, "Failed to add weight"));
    }
  };

  const reverseSortedEntries = [...sortedEntries].reverse();
  const recentLogs = reverseSortedEntries.slice(0, 5);
  console.log("recentLogs", recentLogs);

  return (
    <section className="bg-theme-card p-5 sm:p-6 rounded-[28px] border border-theme-border/50 shadow-sm flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[17px] font-bold text-theme-text">Weight</h2>
        <div className="flex items-center gap-2">
          {onPin && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onPin();
              }}
              className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center transition-colors",
                isPinned
                  ? "text-blue-500 bg-blue-500/10"
                  : "text-theme-text-sec hover:text-theme-text hover:bg-theme-bg",
              )}
              title="Pin to top"
            >
              <Pin size={16} className={isPinned ? "fill-current" : ""} />
            </button>
          )}
          <button
            onClick={() => setShowAddWeight(true)}
            className="w-8 h-8 rounded-full bg-theme-bg flex items-center justify-center border border-theme-border hover:bg-theme-bg-hover transition-colors text-theme-text"
          >
            <Plus size={16} />
          </button>
        </div>
      </div>

      {hasEntries ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between">
            <div className="flex flex-col">
              <span className="text-[14px] font-semibold text-theme-text-sec mb-1">
                Latest Weight
              </span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-4xl font-display font-medium text-theme-text tracking-tight">
                  {latestEntry.weight}
                </span>
                <span className="text-sm font-bold text-theme-text-sec">
                  kg
                </span>
              </div>
              <span className="text-[11px] font-medium text-theme-text-sec mt-1">
                Logged {safeFormat(latestEntry.date, "MMM d, yyyy")}
              </span>
            </div>

            {profile.heightCm ? (
              <div className="flex flex-col items-end text-right">
                <span className="text-[14px] font-semibold text-theme-text-sec mb-1">
                  BMI
                </span>
                <span className="text-2xl font-display font-medium text-theme-text">
                  {bmi}
                </span>
                <div
                  className={cn(
                    "mt-1.5 px-2.5 py-0.5 rounded-full border text-[11px] font-bold whitespace-nowrap",
                    badgeColor,
                  )}
                >
                  {bmiCategory}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-end text-right">
                <span className="text-[14px] font-semibold text-theme-text-sec mb-1">
                  BMI
                </span>
                <span className="text-sm text-theme-text-sec">
                  Height required
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 mt-2">
            {(["30d", "90d", "all"] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => setTimeFilter(filter)}
                className={cn(
                  "px-3 py-1 text-xs font-bold rounded-full transition-colors",
                  timeFilter === filter
                    ? "bg-theme-text text-theme-bg"
                    : "bg-theme-bg text-theme-text-sec hover:bg-theme-bg-hover",
                )}
              >
                {filter === "30d"
                  ? "30 Days"
                  : filter === "90d"
                    ? "90 Days"
                    : "Lifetime"}
              </button>
            ))}
          </div>

          {filteredEntries.length > 0 && (
            <div className="h-40 w-full mt-2 -ml-3">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={filteredEntries}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <defs>
                    <linearGradient
                      id="weightGradient"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-theme-card border border-theme-border rounded-xl p-3 shadow-lg">
                            <div className="text-theme-text-sec text-xs font-medium mb-1">
                              {safeFormat(data.date, "MMM d, yyyy")}
                              {data.createdAt &&
                              typeof data.createdAt === "number"
                                ? ` • ${safeFormat(new Date(data.createdAt), "h:mm a")}`
                                : ""}
                            </div>
                            <div className="text-theme-text font-bold text-sm">
                              {data.weight} kg
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="weight"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#weightGradient)"
                    activeDot={{ r: 5, strokeWidth: 0, fill: "#3b82f6" }}
                    dot={{ r: 3, fill: "#3b82f6", strokeWidth: 0 }}
                  />
                  <YAxis
                    domain={yDomain}
                    axisLine={false}
                    tickLine={false}
                    tick={{
                      fontSize: 11,
                      fill: "var(--color-theme-text-sec)",
                      fontWeight: 500,
                    }}
                    tickCount={5}
                  />
                  <XAxis
                    dataKey="date"
                    axisLine={false}
                    tickLine={false}
                    tick={{
                      fontSize: 11,
                      fill: "var(--color-theme-text-sec)",
                      fontWeight: 500,
                    }}
                    tickFormatter={(val) => safeFormat(val, "MMM d")}
                    minTickGap={20}
                    dy={4}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Expandable History */}
          <div className="mt-2 border-t border-theme-border/50 pt-4">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="w-full flex items-center justify-between text-[14px] font-bold text-theme-text-sec hover:text-theme-text transition-colors"
            >
              <span>Recent Logs</span>
              {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>

            {isExpanded && (
              <div className="mt-4 flex flex-col gap-3 animate-in slide-in-from-top-2 fade-in duration-200">
                {recentLogs.map((log) => (
                  <div
                    key={log.id}
                    className="flex justify-between items-center text-[14px] py-1"
                  >
                    <span className="text-theme-text font-medium">
                      {log.weight} kg
                    </span>
                    <div className="flex flex-col items-end">
                      <span className="text-theme-text-sec">
                        {safeFormat(log.date, "MMM d, yyyy")}
                      </span>
                      {log.createdAt && typeof log.createdAt === "number" && (
                        <span className="text-[11px] text-theme-text-sec/60">
                          {safeFormat(new Date(log.createdAt), "h:mm a")}
                        </span>
                      )}
                    </div>
                  </div>
                ))}

                {sortedEntries.length > 5 && (
                  <button
                    onClick={() => setShowAllLogs(true)}
                    className="text-[13px] font-bold text-blue-500 hover:text-blue-600 mt-2 text-center"
                  >
                    See all history
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="py-6 flex flex-col items-center justify-center text-center">
          <p className="text-[14px] font-medium text-theme-text">
            No weight logged
          </p>
          <p className="text-[12px] text-theme-text-sec mt-1 max-w-50">
            Start tracking your weight to calculate BMI and see your trends.
          </p>
        </div>
      )}

      {showAddWeight && (
        <AddWeightModal
          onClose={() => setShowAddWeight(false)}
          onAdd={handleAddWeight}
        />
      )}

      {showAllLogs && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm animate-in fade-in"
          onClick={() => setShowAllLogs(false)}
        >
          <div
            className="bg-theme-card rounded-3xl w-full max-w-sm shadow-xl overflow-hidden animate-in zoom-in-95 flex flex-col max-h-[80vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-theme-border flex justify-between items-center bg-theme-bg shrink-0">
              <h3 className="font-bold text-theme-text">Weight History</h3>
              <button
                onClick={() => setShowAllLogs(false)}
                className="text-theme-text-sec hover:text-theme-text"
              >
                ✕
              </button>
            </div>
            <div className="overflow-y-auto p-4 flex flex-col gap-3">
              {reverseSortedEntries.map((log) => (
                <div
                  key={log.id}
                  className="flex justify-between items-center text-[14px] border-b border-theme-border/30 pb-3 last:border-0 last:pb-0"
                >
                  <span className="text-theme-text font-medium text-[15px]">
                    {log.weight} kg
                  </span>
                  <div className="flex flex-col items-end">
                    <span className="text-theme-text-sec text-[13px]">
                      {safeFormat(log.date, "MMM d, yyyy")}
                    </span>
                    {log.createdAt && typeof log.createdAt === "number" && (
                      <span className="text-[11px] text-theme-text-sec/60">
                        {safeFormat(new Date(log.createdAt), "h:mm a")}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
