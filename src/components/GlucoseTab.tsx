import { useState, useMemo, useEffect } from "react";
import { useAppStore } from "../store";
import { AddGlucoseModal } from "./AddGlucoseModal";
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceArea,
  ReferenceLine,
} from "recharts";
import {
  subDays,
  subMonths,
  parseISO,
  isAfter,
  startOfDay,
  format,
  startOfWeek,
  subWeeks,
} from "date-fns";
import {
  Activity,
  CheckCircle2,
  Plus,
  Info,
  Trash2,
  Droplet,
  Check,
  AlertTriangle,
  AlertCircle,
  Hexagon,
  X,
  ChevronRight,
  TrendingUp,
} from "lucide-react";
import { MealTiming } from "../types";

import { cn, istToday, safeFormat } from "../lib/utils";
import { friendlyFirebaseError } from "../lib/friendlyFirebaseError";

export default function GlucoseTab() {
  const {
    glucoseReadings,
    addGlucoseReading,
    removeGlucoseReading,
    labReports,
  } = useAppStore();
  const [showAddModal, setShowAddModal] = useState(false);
  const [timeFilter, setTimeFilter] = useState<number>(30); // days
  const [selectedType, setSelectedType] = useState<MealTiming | "HbA1c">(
    "Fasting",
  );
  const [showAllTimeline, setShowAllTimeline] = useState(false);
  const [showHba1cInfo, setShowHba1cInfo] = useState(false);
  const [showCriteriaModal, setShowCriteriaModal] = useState(false);
  const [hasCalculated, setHasCalculated] = useState(false);

  const [showSugarHealth, setShowSugarHealth] = useState(false);
  const sugarInsights = useMemo(() => {
    if (!glucoseReadings) return null;

    const history = glucoseReadings.filter((h) => (h.timing as string) !== "HbA1c");

    const now = new Date();
    const thirtyDaysAgo = subDays(now, 30);
    const sixtyDaysAgo = subDays(now, 60);

    const recentLogs = history.filter((h) => {
      try {
        return parseISO(h.date) >= thirtyDaysAgo;
      } catch (e) {
        return false;
      }
    });
    const previousLogs = history.filter((h) => {
      try {
        const d = parseISO(h.date);
        return d >= sixtyDaysAgo && d < thirtyDaysAgo;
      } catch (e) {
        return false;
      }
    });

    const getStats = (logs: typeof history, type: string) => {
      const filtered = logs.filter((h) => h.timing === type);
      if (filtered.length === 0) return { avg: null, count: 0, items: [] };
      const avg =
        filtered.reduce((acc, cur) => acc + cur.value, 0) / filtered.length;
      return { avg: Math.round(avg), count: filtered.length, items: filtered };
    };

    const recentFasting = getStats(recentLogs, "Fasting");
    const prevFasting = getStats(previousLogs, "Fasting");

    const recentPP = getStats(recentLogs, "Post-Prandial");
    const prevPP = getStats(previousLogs, "Post-Prandial");

    const recentRandom = getStats(recentLogs, "Random");
    const prevRandom = getStats(previousLogs, "Random");
    const currentWeekStart = startOfWeek(now, { weekStartsOn: 1 });
    const previousWeekStart = subWeeks(currentWeekStart, 1);
    const previousWeekSameDay = subWeeks(now, 1);

    const currentWeekLogs = history.filter((h) => {
      try {
        const d = parseISO(h.date);
        return d >= currentWeekStart && d <= now;
      } catch (e) {
        return false;
      }
    });
    const previousWeekLogsWTD = history.filter((h) => {
      try {
        const d = parseISO(h.date);
        return d >= previousWeekStart && d <= previousWeekSameDay;
      } catch (e) {
        return false;
      }
    });
    const previousWeekLogsFull = history.filter((h) => {
      try {
        const d = parseISO(h.date);
        return d >= previousWeekStart && d < currentWeekStart;
      } catch (e) {
        return false;
      }
    });

    const currentWeekFasting = getStats(currentWeekLogs, "Fasting");
    const prevWeekFastingFull = getStats(previousWeekLogsFull, "Fasting");
    const currentWeekPP = getStats(currentWeekLogs, "Post-Prandial");
    const prevWeekPPFull = getStats(previousWeekLogsFull, "Post-Prandial");

    const trends: string[] = [];

    if (
      currentWeekFasting.count > 0 &&
      prevWeekFastingFull.count > 0 &&
      currentWeekFasting.avg !== null &&
      prevWeekFastingFull.avg !== null
    ) {
      const diff = Math.round(
        Math.abs(currentWeekFasting.avg - prevWeekFastingFull.avg),
      );
      if (currentWeekFasting.avg < prevWeekFastingFull.avg) {
        trends.push(
          `Fasting average decreased by ${diff} mg/dL compared to last week's average.`,
        );
      } else if (currentWeekFasting.avg > prevWeekFastingFull.avg) {
        trends.push(
          `Fasting average increased by ${diff} mg/dL compared to last week's average.`,
        );
      }
    }

    if (
      currentWeekPP.count > 0 &&
      prevWeekPPFull.count > 0 &&
      currentWeekPP.avg !== null &&
      prevWeekPPFull.avg !== null
    ) {
      const diff = Math.round(Math.abs(currentWeekPP.avg - prevWeekPPFull.avg));
      if (currentWeekPP.avg < prevWeekPPFull.avg) {
        trends.push(
          `Post-prandial average decreased by ${diff} mg/dL compared to last week's average.`,
        );
      } else if (currentWeekPP.avg > prevWeekPPFull.avg) {
        trends.push(
          `Post-prandial average increased by ${diff} mg/dL compared to last week's average.`,
        );
      }
    }

    const countDiff = currentWeekLogs.length - previousWeekLogsWTD.length;
    if (countDiff > 0) {
      trends.push(
        `You logged ${countDiff} more reading${countDiff > 1 ? "s" : ""} this week compared to the same time last week.`,
      );
    } else if (countDiff < 0) {
      trends.push(
        `You logged ${Math.abs(countDiff)} fewer reading${Math.abs(countDiff) > 1 ? "s" : ""} this week compared to the same time last week.`,
      );
    } else if (currentWeekLogs.length > 0 && previousWeekLogsWTD.length > 0) {
      trends.push(
        `You logged the same number of readings this week as you did by this time last week.`,
      );
    }

    const recentAvg =
      recentLogs.length > 0
        ? recentLogs.reduce((acc, cur) => acc + cur.value, 0) /
          recentLogs.length
        : 0;
    const previousAvg =
      previousLogs.length > 0
        ? previousLogs.reduce((acc, cur) => acc + cur.value, 0) /
          previousLogs.length
        : 0;

    const cards = {
      fasting: {
        avg: recentFasting.avg,
        diff:
          recentFasting.avg && prevFasting.avg
            ? recentFasting.avg - prevFasting.avg
            : null,
        pct:
          recentFasting.avg && prevFasting.avg
            ? Math.round(
                ((recentFasting.avg - prevFasting.avg) / prevFasting.avg) * 100,
              )
            : null,
      },
      pp: {
        avg: recentPP.avg,
        diff: recentPP.avg && prevPP.avg ? recentPP.avg - prevPP.avg : null,
        pct:
          recentPP.avg && prevPP.avg
            ? Math.round(((recentPP.avg - prevPP.avg) / prevPP.avg) * 100)
            : null,
      },
      random: {
        avg: recentRandom.avg,
        diff:
          recentRandom.avg && prevRandom.avg
            ? recentRandom.avg - prevRandom.avg
            : null,
        pct:
          recentRandom.avg && prevRandom.avg
            ? Math.round(
                ((recentRandom.avg - prevRandom.avg) / prevRandom.avg) * 100,
              )
            : null,
      },
    };

    const better: string[] = [];
    const attention: string[] = [];
    const recommendations: string[] = [];

    const fastingLimit = 99;
    const otherLimit = 140;

    const calcVar = (items: any[]) =>
      items.length > 1
        ? Math.max(...items.map((i) => i.value)) -
          Math.min(...items.map((i) => i.value))
        : 0;

    const recentVariability = Math.max(
      calcVar(recentFasting.items),
      calcVar(recentPP.items),
      calcVar(recentRandom.items),
    );
    const previousVariability = Math.max(
      calcVar(prevFasting.items),
      calcVar(prevPP.items),
      calcVar(prevRandom.items),
    );

    const hypoLogs = recentLogs.filter((h) => h.value < 70);
    const hyperLogs = recentLogs.filter((h) => h.value > 250);

    if (recentFasting.avg && prevFasting.avg) {
      if (recentFasting.avg < prevFasting.avg - 2) {
        const diff = prevFasting.avg - recentFasting.avg;
        const pct = Math.abs(cards.fasting.pct || 0);
        better.push(
          `Average fasting glucose improved by ${diff} mg/dL (${pct}%) compared to last month.`,
        );
      } else if (recentFasting.avg > prevFasting.avg + 2) {
        const diff = recentFasting.avg - prevFasting.avg;
        attention.push(
          `Average fasting glucose increased by ${diff} mg/dL since last month.`,
        );
      }
    }

    if (recentPP.avg && prevPP.avg) {
      if (recentPP.avg < prevPP.avg - 2) {
        const diff = prevPP.avg - recentPP.avg;
        better.push(
          `Average post-prandial glucose improved by ${diff} mg/dL compared to last month.`,
        );
      } else if (recentPP.avg > prevPP.avg + 2) {
        const diff = recentPP.avg - prevPP.avg;
        attention.push(
          `Average post-prandial glucose increased by ${diff} mg/dL since last month.`,
        );
      }
    }

    if (recentRandom.avg && prevRandom.avg) {
      if (recentRandom.avg < prevRandom.avg - 2) {
        const diff = prevRandom.avg - recentRandom.avg;
        better.push(
          `Average random glucose improved by ${diff} mg/dL compared to last month.`,
        );
      }
    }

    if (
      recentAvg &&
      previousAvg &&
      better.length === 0 &&
      attention.length === 0
    ) {
      if (recentAvg < previousAvg - 2) {
        const pct = Math.round(((previousAvg - recentAvg) / previousAvg) * 100);
        better.push(
          `Overall average glucose improved by ${pct}% compared to last month.`,
        );
      }
    }

    if (recentFasting.avg) {
      if (recentFasting.avg > fastingLimit) {
        const pct = Math.round(
          ((recentFasting.avg - fastingLimit) / fastingLimit) * 100,
        );
        attention.push(`Average fasting glucose remains ${pct}% above target.`);
      } else if (recentFasting.avg <= fastingLimit) {
        better.push("Average fasting glucose is within target range.");
      }
    }

    const highFastingRecent =
      recentFasting.items?.filter((h) => h.value > fastingLimit) || [];
    if (
      recentFasting.count >= 3 &&
      highFastingRecent.length / recentFasting.count > 0.6
    ) {
      attention.push("Persistent fasting hyperglycaemia detected.");
    }

    const highPPRecent =
      recentPP.items?.filter((h) => h.value > otherLimit) || [];
    if (recentPP.count >= 3 && highPPRecent.length / recentPP.count > 0.5) {
      attention.push("Frequent post-meal spikes are present.");
    }

    if (
      recentVariability > 60 &&
      recentVariability > previousVariability + 10
    ) {
      attention.push("High glucose variability detected this month.");
    } else if (
      recentVariability > 0 &&
      previousVariability > 0 &&
      recentVariability < previousVariability - 15
    ) {
      better.push("Glucose variability decreased compared to last month.");
    }

    if (recentLogs.length > 5 && hypoLogs.length === 0) {
      better.push("No hypoglycaemic episodes (<70 mg/dL) detected this month.");
    } else if (hypoLogs.length > 0) {
      attention.push(`${hypoLogs.length} hypoglycaemic episodes detected.`);
    }

    if (hyperLogs.length > 0) {
      attention.push(
        `${hyperLogs.length} severe hyperglycaemic episodes (>250 mg/dL) detected.`,
      );
    }

    const weekendLogs = recentLogs.filter((h) => {
      try {
        const day = parseISO(h.date).getDay();
        return day === 0 || day === 6;
      } catch {
        return false;
      }
    });
    const weekdayLogs = recentLogs.filter((h) => {
      try {
        const day = parseISO(h.date).getDay();
        return day > 0 && day < 6;
      } catch {
        return false;
      }
    });
    const weekendAvg = weekendLogs.length
      ? weekendLogs.reduce((acc, cur) => acc + cur.value, 0) /
        weekendLogs.length
      : 0;
    const weekdayAvg = weekdayLogs.length
      ? weekdayLogs.reduce((acc, cur) => acc + cur.value, 0) /
        weekdayLogs.length
      : 0;

    if (weekendAvg > 0 && weekdayAvg > 0) {
      if (weekendAvg > weekdayAvg + 15) {
        attention.push(
          "Weekend glucose remains significantly higher than weekdays.",
        );
      } else if (weekendAvg < weekdayAvg - 5) {
        better.push("Weekend glucose has improved compared to weekdays.");
      }
    }

    if (
      recentLogs.length >= 20 &&
      previousLogs.length > 0 &&
      recentLogs.length > previousLogs.length * 1.2
    ) {
      better.push("Logging consistency improved compared to last month.");
    } else if (
      recentLogs.length > 0 &&
      previousLogs.length > 0 &&
      recentLogs.length < previousLogs.length * 0.5
    ) {
      attention.push(
        "Logging consistency has declined compared to last month.",
      );
    }

    if (recentLogs.length === 0) {
      attention.push("No glucose readings logged in the past 30 days.");
    } else if (recentLogs.length < 5) {
      attention.push("Long gaps exist between readings.");
    }

    if (recentLogs.length > 5) {
      if (recentFasting.count < 3) {
        attention.push("Too few fasting readings are available.");
      }
      if (recentPP.count < 3) {
        attention.push("Too few post-prandial readings are available.");
      }
      if (recentRandom.count > recentFasting.count + recentPP.count) {
        attention.push("Majority of your readings are random glucose values.");
      }
    }

    const needsQuality = attention.some(
      (a) =>
        a.includes("Too few") ||
        a.includes("random") ||
        a.includes("Long gaps") ||
        a.includes("consistency has declined") ||
        a.includes("No glucose readings"),
    );

    const hasRecentHbA1c =
      glucoseReadings.some(
        (h) =>
          (h.timing as string) === "HbA1c" &&
          (() => {
            try {
              return parseISO(h.date) >= subMonths(now, 4);
            } catch {
              return false;
            }
          })(),
      ) ||
      (labReports &&
        labReports.some(
          (report) =>
            report.biomarkers?.some(
              (b) =>
                b.name.toLowerCase().includes("hba1c") ||
                b.name.toLowerCase().includes("a1c"),
            ) &&
            (() => {
              try {
                return parseISO(report.date) >= subMonths(now, 4);
              } catch {
                return false;
              }
            })(),
        ));

    if (needsQuality) {
      if (recentFasting.count < 4)
        recommendations.push(
          "Record fasting glucose before breakfast on at least 4 mornings each week.",
        );
      if (recentPP.count < 4)
        recommendations.push(
          "Record post-prandial glucose 2 hours after dinner at least 3 times per week.",
        );
      if (recentLogs.length === 0)
        recommendations.push(
          "Start logging your glucose regularly to unlock insights.",
        );
      else if (recentLogs.length < 5)
        recommendations.push("Avoid long gaps between glucose recordings.");
      if (recentRandom.count > recentFasting.count + recentPP.count)
        recommendations.push(
          "Replace random glucose readings with fasting or post-meal readings whenever possible.",
        );
    }

    if (!hasRecentHbA1c && recommendations.length < 3) {
      recommendations.push(
        "Your HbA1c was last measured over 4 months ago. Consider repeating the test.",
      );
    }

    if (recentFasting.count < 5 && recommendations.length < 3) {
      recommendations.push(
        "Additional fasting readings are required before Expected HbA1c can be estimated.",
      );
    }

    if (recentPP.count < 5 && recommendations.length < 3) {
      recommendations.push(
        "Increase post-prandial readings to improve future analysis.",
      );
    }

    if (
      recommendations.length < 3 &&
      recentFasting.avg &&
      recentFasting.avg > fastingLimit
    ) {
      if (recentFasting.avg > 125) {
        recommendations.push(
          "Discuss persistently elevated fasting glucose with your healthcare provider if it continues.",
        );
      } else {
        recommendations.push(
          "Continue monitoring fasting glucose until it reaches the target range.",
        );
      }
    }

    if (
      recommendations.length < 3 &&
      recentPP.avg &&
      recentPP.avg > otherLimit
    ) {
      recommendations.push("Monitor post-dinner glucose over the next week.");
    }

    if (recommendations.length < 3 && recentVariability > 60) {
      recommendations.push(
        "Measure glucose at approximately the same time each day to help identify patterns.",
      );
    }

    // De-duplicate better array simply
    const uniqueBetter = Array.from(new Set(better));
    const uniqueAttention = Array.from(new Set(attention));

    return {
      cards,
      better: uniqueBetter.slice(0, 4),
      attention: uniqueAttention.slice(0, 4),
      recommendations: recommendations.slice(0, 3),
      trends,
      currentWeekTotal: currentWeekLogs.length,
    };
  }, [glucoseReadings, labReports]);

  const expectedHba1cData = useMemo(() => {
    const today = startOfDay(new Date());

    const readingsByDate = {};
    glucoseReadings.forEach((r) => {
      try {
        const d = r.date.split("T")[0];
        if (!readingsByDate[d]) readingsByDate[d] = [];
        readingsByDate[d].push(r);
      } catch (e) {}
    });

    const allDates = Object.keys(readingsByDate).sort();
    const mostRecentDateStr =
      allDates.length > 0 ? allDates[allDates.length - 1] : null;

    let maxScore = -9999;
    let eligibleWindow = null;
    let bestWindowProgress = null;

    if (mostRecentDateStr) {
      const mostRecentDate = new Date(mostRecentDateStr + "T00:00:00");
      let currentI = 0;
      let currentJ = 0;
      let missed = 0;
      let valid = 0;

      while (currentJ < 90) {
        // Search up to 90 days backwards
        const dateJ = subDays(mostRecentDate, currentJ);
        const dateStrJ = format(dateJ, "yyyy-MM-dd");

        if (readingsByDate[dateStrJ] && readingsByDate[dateStrJ].length > 0) {
          valid++;
        } else {
          missed++;
        }

        // Slide window forward (drop recent days) if missed days exceed 4
        while (missed > 4 && currentI <= currentJ) {
          const dateI = subDays(mostRecentDate, currentI);
          const dateStrI = format(dateI, "yyyy-MM-dd");
          if (readingsByDate[dateStrI] && readingsByDate[dateStrI].length > 0) {
            valid--;
          } else {
            missed--;
          }
          currentI++;
        }

        const windowReadings = [];
        for (let k = currentI; k <= currentJ; k++) {
          const dateK = subDays(mostRecentDate, k);
          const dateStrK = format(dateK, "yyyy-MM-dd");
          if (readingsByDate[dateStrK]) {
            windowReadings.push(...readingsByDate[dateStrK]);
          }
        }

        const daysTracked = valid;
        const missedDays = missed;
        const totalReadings = windowReadings.length;
        const fastingCount = windowReadings.filter(
          (r) => r.timing === "Fasting",
        ).length;
        const postPrandialCount = windowReadings.filter(
          (r) => r.timing === "Post-Prandial",
        ).length;

        const isEligible =
          daysTracked >= 28 &&
          totalReadings >= 32 &&
          fastingCount >= 12 &&
          postPrandialCount >= 12;

        let expectedHba1c = 0;
        if (isEligible && totalReadings > 0) {
          const avgGlucose =
            windowReadings.reduce((sum, r) => sum + r.value, 0) / totalReadings;
          expectedHba1c = (avgGlucose + 46.7) / 28.7;
        }

        const currentData = {
          isEligible,
          daysTracked,
          missedDays,
          totalReadings,
          fastingCount,
          postPrandialCount,
          expectedHba1c,
          neededDays: Math.max(0, 28 - daysTracked),
          neededTotal: Math.max(0, 32 - totalReadings),
          neededFasting: Math.max(0, 12 - fastingCount),
          neededPP: Math.max(0, 12 - postPrandialCount),
        };

        if (isEligible) {
          if (!eligibleWindow) {
            eligibleWindow = currentData;
            break; // Found the most recent eligible window
          }
        }

        const score =
          Math.min(28, valid) * 100 -
          missed * 10 +
          Math.min(32, totalReadings) * 2 +
          Math.min(12, fastingCount) +
          Math.min(12, postPrandialCount);

        if (score > maxScore) {
          maxScore = score;
          bestWindowProgress = currentData;
        }

        currentJ++;
      }
    }

    return (
      eligibleWindow ||
      bestWindowProgress || {
        isEligible: false,
        daysTracked: 0,
        missedDays: 0,
        totalReadings: 0,
        fastingCount: 0,
        postPrandialCount: 0,
        expectedHba1c: 0,
        neededDays: 28,
        neededTotal: 32,
        neededFasting: 12,
        neededPP: 12,
      }
    );
  }, [glucoseReadings, labReports]);

  useEffect(() => {
    if (selectedType === "HbA1c" && timeFilter < 90) {
      setTimeFilter(90);
    } else if (selectedType !== "HbA1c" && timeFilter === 180) {
      setTimeFilter(90);
    }
  }, [selectedType, timeFilter]);

  const hba1cReadings = useMemo(() => {
    return [...labReports]
      .filter((r) =>
        r.biomarkers.some(
          (b) =>
            b.name.toLowerCase().includes("hba1c") ||
            b.name.toLowerCase().includes("a1c"),
        ),
      )
      .map((r) => {
        const b = r.biomarkers.find(
          (x) =>
            x.name.toLowerCase().includes("hba1c") ||
            x.name.toLowerCase().includes("a1c"),
        );
        return {
          id: r.id,
          date: r.date,
          time: "00:00",
          value: b!.value,
          timing: "HbA1c" as any,
        };
      })
      .sort((a, b) => {
        try {
          return parseISO(a.date).getTime() - parseISO(b.date).getTime();
        } catch {
          return 0;
        }
      });
  }, [labReports]);

  const latestHba1c =
    hba1cReadings.length > 0 ? hba1cReadings[hba1cReadings.length - 1] : null;

  const uniqueGlucoseReadings = useMemo(() => {
    const sorted = [...glucoseReadings].sort(
      (a, b) => b.createdAt - a.createdAt,
    );
    const seen = new Set();
    const unique = [];
    for (const r of sorted) {
      const key = `${r.date}-${r.timing}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(r);
      }
    }
    return unique;
  }, [glucoseReadings, labReports]);

  const todayUniqueReadings = useMemo(() => {
    const todayStr = istToday();
    return uniqueGlucoseReadings.filter((r) => r.date === todayStr);
  }, [uniqueGlucoseReadings]);

  // Chart data preparation
  const filteredReadings = useMemo(() => {
    let rawReadings: any[] = [];
    if (selectedType === "HbA1c") {
      rawReadings = hba1cReadings;
    } else {
      rawReadings = uniqueGlucoseReadings.filter(
        (r) => r.timing === selectedType,
      );
    }

    const filtered = rawReadings.filter((r) => {
      try {
        return r.date
          ? isAfter(parseISO(r.date), subDays(new Date(), timeFilter))
          : false;
      } catch {
        return false;
      }
    });

    const grouped = new Map<string, any>();
    filtered.forEach((r) => {
      const ts = new Date(`${r.date}T${r.time || "00:00"}`).getTime();
      const existing = grouped.get(r.date);
      if (!existing || ts > existing.timestamp) {
        grouped.set(r.date, { ...r, timestamp: ts });
      }
    });

    return Array.from(grouped.values()).sort(
      (a, b) => a.timestamp - b.timestamp,
    );
  }, [glucoseReadings, hba1cReadings, timeFilter, selectedType]);

  const allFilteredForTimeline = useMemo(() => {
    return [...glucoseReadings].sort((a, b) => {
      try {
        const timeA = new Date(`${a.date}T${a.time || "00:00"}`).getTime();
        const timeB = new Date(`${b.date}T${b.time || "00:00"}`).getTime();
        return (isNaN(timeB) ? 0 : timeB) - (isNaN(timeA) ? 0 : timeA);
      } catch {
        return 0;
      }
    });
  }, [glucoseReadings, labReports]);

  // Statistics for selected type
  const stats = useMemo(() => {
    if (filteredReadings.length === 0)
      return { avg: "--", max: "--", min: "--", count: 0 };
    const values = filteredReadings.map((r) => r.value);
    const sum = values.reduce((a, b) => a + b, 0);
    return {
      avg: Math.round((sum / values.length) * 10) / 10,
      max: Math.max(...values),
      min: Math.min(...values),
      count: values.length,
    };
  }, [filteredReadings]);

  const getChartColor = (type: string) => {
    switch (type) {
      case "Fasting":
        return "#10b981";
      case "Post-Prandial":
        return "#ef4444";
      case "Random":
        return "#3b82f6";
      case "HbA1c":
        return "#9333ea";
      default:
        return "#888";
    }
  };

  const chartColor = getChartColor(selectedType);

  const getIdealRange = (type: string) => {
    switch (type) {
      case "Fasting":
        return { min: 70, max: 99, text: "70 - 99 mg/dL" };
      case "Post-Prandial":
        return { min: 0, max: 140, text: "< 140 mg/dL" };
      case "Random":
        return { min: 0, max: 140, text: "< 140 mg/dL" };
      case "HbA1c":
        return { min: 0, max: 5.6, text: "< 5.7 %" };
      default:
        return null;
    }
  };

  const idealRange = getIdealRange(selectedType);

  const targetStats = useMemo(() => {
    if (!idealRange || filteredReadings.length === 0) {
      return { count: 0, percent: null };
    }
    const inside = filteredReadings.filter(
      (r) => r.value >= idealRange.min && r.value <= idealRange.max,
    ).length;
    return {
      count: inside,
      percent: Math.round((inside / filteredReadings.length) * 100),
    };
  }, [filteredReadings, idealRange]);

  const dateRangeText = useMemo(() => {
    if (filteredReadings.length === 0) return "";
    const firstDate = filteredReadings[0].date;
    const lastDate = filteredReadings[filteredReadings.length - 1].date;
    if (firstDate === lastDate) {
      return safeFormat(firstDate, "MMMM d, yyyy");
    }
    return `${safeFormat(firstDate, "MMM d")} – ${safeFormat(lastDate, "MMM d, yyyy")}`;
  }, [filteredReadings]);

  const timeRangeOptions = useMemo(() => {
    if (selectedType === "HbA1c") {
      return [
        { label: "3M", days: 90, title: "90 Days" },
        { label: "6M", days: 180, title: "180 Days" },
        { label: "1Y", days: 365, title: "1 Year" },
        { label: "All", days: 9999, title: "Lifetime" },
      ];
    }
    return [
      { label: "7D", days: 7, title: "7 Days" },
      { label: "30D", days: 30, title: "30 Days" },
      { label: "90D", days: 90, title: "90 Days" },
      { label: "1Y", days: 365, title: "1 Year" },
      { label: "All", days: 9999, title: "Lifetime" },
    ];
  }, [selectedType]);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500 mt-4 md:-mt-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-4xl font-display font-medium text-theme-text tracking-tight">
          Glucose
        </h2>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button
            onClick={() => setShowAddModal(true)}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-linear-to-r from-theme-accent to-theme-accent/80 hover:opacity-90 text-white px-5 py-3 rounded-2xl text-sm font-bold transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5"
          >
            <Plus size={18} />
            Add Reading
          </button>
          <button
            onClick={() => setShowSugarHealth(true)}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-linear-to-r from-purple-500 to-violet-600 hover:opacity-90 text-white px-5 py-3 rounded-2xl text-sm font-bold transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5"
          >
            <Hexagon
              size={18}
              className="animate-[spin_4s_linear_infinite] opacity-80"
            />
            Sugar Health
          </button>
        </div>
      </div>

      {/* Premium Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Today's Glucose */}
        <div className="bg-theme-card rounded-4xl p-6 sm:p-8 border border-theme-border shadow-lg relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-8 opacity-5">
            <Droplet size={100} fill="currentColor" />
          </div>
          <div className="relative z-10 flex flex-col h-full justify-between gap-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-theme-text-sec mb-1">
                  Today's Reading
                </p>
                <h3 className="text-2xl font-display font-medium text-theme-text">
                  Blood Glucose
                </h3>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-linear-to-br from-theme-accent/20 to-theme-accent/5 border border-theme-accent/20 flex items-center justify-center">
                <Droplet
                  className="text-theme-accent"
                  size={24}
                  fill="currentColor"
                  fillOpacity={0.2}
                />
              </div>
            </div>

            <div className="flex flex-col gap-4">
              {todayUniqueReadings.length > 0 ? (
                todayUniqueReadings.map((reading) => {
                  const range = getIdealRange(reading.timing);
                  let isNormal = true;
                  if (range) {
                    if (range.min && reading.value < range.min)
                      isNormal = false;
                    if (range.max && reading.value > range.max)
                      isNormal = false;
                  }

                  return (
                    <div
                      key={reading.id}
                      className="flex flex-col xl:flex-row xl:items-center justify-between border-t border-theme-border/50 pt-5 first:border-0 first:pt-0 gap-4"
                    >
                      <div className="flex items-baseline gap-2">
                        <span className="text-5xl font-black tracking-tighter text-theme-text">
                          {reading.value}
                        </span>
                        <span className="text-sm font-bold text-theme-text-sec">
                          mg/dL
                        </span>
                        <div
                          className="ml-2 flex items-center justify-center bg-theme-bg/50 rounded-full p-1"
                          title={isNormal ? "Normal" : "Out of range"}
                        >
                          {isNormal ? (
                            <Check
                              className="text-theme-success"
                              size={16}
                              strokeWidth={3.5}
                            />
                          ) : (
                            <AlertTriangle
                              className="text-amber-500"
                              size={14}
                              strokeWidth={3}
                            />
                          )}
                        </div>
                      </div>
                      <div className="flex flex-row xl:flex-col items-center xl:items-end gap-3 xl:gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5 bg-theme-bg px-2.5 py-1 rounded-full border border-theme-border/50">
                          <div
                            className={cn(
                              "w-2 h-2 rounded-full shrink-0",
                              reading.timing === "Fasting"
                                ? "bg-green-500"
                                : reading.timing === "Random"
                                  ? "bg-blue-500"
                                  : "bg-red-500",
                            )}
                          />
                          <span className="text-[10px] font-bold text-theme-text">
                            {reading.timing}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs font-medium text-theme-text-sec">
                          {reading.hoursAfterEating !== undefined && (
                            <span>{reading.hoursAfterEating}h post-meal</span>
                          )}
                          <span className="font-bold bg-theme-bg px-2 py-1 rounded-md border border-theme-border/30">
                            {reading.time}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="flex flex-col gap-6">
                  <div className="flex items-baseline gap-2">
                    <span className="text-5xl lg:text-6xl font-black tracking-tighter text-theme-text opacity-20">
                      --
                    </span>
                    <span className="text-base lg:text-lg font-bold text-theme-text-sec opacity-20">
                      mg/dL
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-t border-theme-border/50 pt-4">
                    <span className="text-sm font-medium text-theme-text-sec">
                      No reading logged today
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Latest HbA1c Wrapper */}
        <div className="flex flex-col gap-6">
          {/* Latest HbA1c */}

          <div className="bg-theme-card rounded-4xl p-6 sm:p-8 border border-theme-border shadow-lg relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-8 opacity-5">
              <Hexagon size={100} />
            </div>
            <div className="relative z-10 flex flex-col h-full justify-between gap-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-theme-text-sec mb-1">
                    Laboratory
                  </p>
                  <h3 className="text-2xl font-display font-medium text-theme-text">
                    Latest HbA1c
                  </h3>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-linear-to-br from-purple-500/20 to-purple-500/5 border border-purple-500/20 flex items-center justify-center">
                  <Hexagon className="text-purple-500" size={24} />
                </div>
              </div>

              <div>
                {latestHba1c ? (
                  <div className="flex items-baseline gap-2">
                    <span className="text-5xl lg:text-6xl font-black tracking-tighter text-theme-text">
                      {latestHba1c.value}
                    </span>
                    <span className="text-base lg:text-lg font-bold text-theme-text-sec">
                      %
                    </span>
                  </div>
                ) : (
                  <div className="flex items-baseline gap-2">
                    <span className="text-5xl lg:text-6xl font-black tracking-tighter text-theme-text opacity-20">
                      --
                    </span>
                    <span className="text-base lg:text-lg font-bold text-theme-text-sec opacity-20">
                      %
                    </span>
                  </div>
                )}
              </div>

              <div className="flex flex-col xl:flex-row xl:items-center justify-between border-t border-theme-border/50 pt-4 gap-3">
                {latestHba1c ? (
                  <>
                    <span className="text-sm font-medium text-theme-text-sec">
                      Tested on {safeFormat(latestHba1c.date, "MMM d, yyyy")}
                    </span>
                    <span
                      className={cn(
                        "px-3 py-1 rounded-xl text-xs font-bold w-fit",
                        latestHba1c.value < 5.7
                          ? "bg-theme-success/10 text-theme-success"
                          : latestHba1c.value < 6.5
                            ? "bg-amber-500/10 text-amber-500"
                            : "bg-theme-critical/10 text-theme-critical",
                      )}
                    >
                      {latestHba1c.value < 5.7
                        ? "Normal"
                        : latestHba1c.value < 6.5
                          ? "Prediabetes"
                          : "Diabetes"}
                    </span>
                  </>
                ) : (
                  <span className="text-sm font-medium text-theme-text-sec">
                    Upload a lab report to track HbA1c
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Expected HbA1c Entry Card */}
          <div
            onClick={() => {
              if (!hasCalculated) {
                if (expectedHba1cData.isEligible) {
                  setHasCalculated(true);
                } else {
                  setShowCriteriaModal(true);
                }
              }
            }}
            className="mx-auto sm:mx-0 w-[85%] sm:w-[75%] lg:w-[70%] bg-theme-card rounded-2xl px-5 py-3.5 border border-theme-border shadow-sm flex items-center justify-between group cursor-pointer hover:shadow-md transition-shadow"
          >
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5">
                <h3 className="text-[15px] sm:text-base font-bold text-theme-text leading-none">
                  Expected HbA1c
                </h3>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowHba1cInfo(true);
                  }}
                  className="text-theme-text-sec hover:text-theme-text transition-colors"
                  title="Learn more"
                >
                  <Info size={14} />
                </button>
              </div>
              <p className="text-[13px] font-medium text-theme-text-sec leading-none">
                Estimate from glucose readings
              </p>
            </div>

            <div className="flex justify-end shrink-0 pl-4">
              {hasCalculated && expectedHba1cData.isEligible ? (
                <div className="flex items-baseline gap-0.5">
                  <span className="text-xl font-black tracking-tight text-theme-text">
                    {expectedHba1cData.expectedHba1c.toFixed(1)}
                  </span>
                  <span className="text-xs font-bold text-theme-text-sec">
                    %
                  </span>
                </div>
              ) : (
                <div className="text-theme-text-sec flex items-center justify-center transition-colors">
                  <div className="transform group-hover:translate-x-1 transition-all duration-300">
                    <ChevronRight size={18} strokeWidth={2.5} />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Chart Section (Apple Health Design) */}
      <div className="bg-theme-card p-5 sm:p-7 rounded-3xl border border-theme-border/60 shadow-xs relative">
        {/* Top Header: Metric + Time Range Selector */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-theme-text-sec uppercase tracking-wider">
                Average
              </span>
              {idealRange && (
                <span className="text-[11px] text-theme-text-sec font-medium">
                  · Target {idealRange.text}
                </span>
              )}
            </div>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-3xl sm:text-4xl font-display font-semibold tracking-tight text-theme-text tabular-nums">
                {stats.avg !== "--" ? stats.avg : "—"}
              </span>
              <span className="text-sm font-medium text-theme-text-sec">
                {selectedType === "HbA1c" ? "%" : "mg/dL"}
              </span>
            </div>
            <p className="text-xs text-theme-text-sec mt-1 font-medium">
              {dateRangeText || "No readings in this period"}
            </p>
          </div>

          {/* Apple Health Segmented Time Filter */}
          <div className="inline-flex p-1 rounded-xl bg-theme-bg/80 border border-theme-border/60 self-start sm:self-auto">
            {timeRangeOptions.map((opt) => (
              <button
                key={opt.days}
                onClick={() => setTimeFilter(opt.days)}
                title={opt.title}
                className={cn(
                  "px-3 py-1 text-xs font-semibold rounded-lg transition-all",
                  timeFilter === opt.days
                    ? "bg-theme-card text-theme-text shadow-xs"
                    : "text-theme-text-sec hover:text-theme-text",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Timing Tabs: Clean Segmented Control */}
        <div className="flex items-center gap-1.5 p-1 bg-theme-bg/60 rounded-xl border border-theme-border/40 mb-3 overflow-x-auto w-full sm:w-fit">
          {(["Fasting", "Post-Prandial", "Random", "HbA1c"] as const).map(
            (type) => (
              <button
                key={type}
                onClick={() => setSelectedType(type)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded-lg transition-all shrink-0",
                  selectedType === type
                    ? "bg-theme-card text-theme-text shadow-xs font-semibold"
                    : "text-theme-text-sec hover:text-theme-text",
                )}
              >
                {type}
              </button>
            ),
          )}
        </div>

        {/* Graph Canvas */}
        <div className="h-64 sm:h-72 w-full relative">
          {filteredReadings.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={filteredReadings}
                margin={{ top: 12, right: 12, left: -24, bottom: 0 }}
              >
                <defs>
                  <linearGradient
                    id="appleHealthGradient"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="0%"
                      stopColor={chartColor}
                      stopOpacity={0.16}
                    />
                    <stop
                      offset="100%"
                      stopColor={chartColor}
                      stopOpacity={0.0}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="2 3"
                  vertical={false}
                  stroke="var(--color-theme-border)"
                  opacity={0.35}
                />

                {idealRange && (
                  <ReferenceArea
                    y1={idealRange.min}
                    y2={idealRange.max}
                    fill="#10b981"
                    fillOpacity={0.06}
                  />
                )}
                {idealRange && idealRange.max && (
                  <ReferenceLine
                    y={idealRange.max}
                    stroke="#10b981"
                    strokeDasharray="2 3"
                    strokeOpacity={0.4}
                    strokeWidth={1}
                  />
                )}
                {idealRange && idealRange.min && idealRange.min > 0 && (
                  <ReferenceLine
                    y={idealRange.min}
                    stroke="#10b981"
                    strokeDasharray="2 3"
                    strokeOpacity={0.4}
                    strokeWidth={1}
                  />
                )}

                <XAxis
                  type="number"
                  scale="time"
                  domain={["auto", new Date().getTime()]}
                  dataKey="timestamp"
                  tickFormatter={(tick) =>
                    safeFormat(
                      new Date(tick),
                      timeFilter <= 7 ? "EEE" : timeFilter <= 90 ? "MMM d" : "MMM yy",
                    )
                  }
                  axisLine={false}
                  tickLine={false}
                  tick={{
                    fontSize: 11,
                    fill: "var(--color-theme-text-sec)",
                    fontWeight: 500,
                  }}
                  dy={4}
                  height={22}
                  minTickGap={timeFilter <= 7 ? 20 : 35}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{
                    fontSize: 11,
                    fill: "var(--color-theme-text-sec)",
                    fontWeight: 500,
                  }}
                  dx={-4}
                />
                <Tooltip
                  content={
                    <CustomTooltip
                      chartColor={chartColor}
                      unit={selectedType === "HbA1c" ? "%" : "mg/dL"}
                      idealRange={idealRange}
                    />
                  }
                />

                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="none"
                  fill="url(#appleHealthGradient)"
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={chartColor}
                  strokeWidth={2.5}
                  dot={
                    <CustomDot
                      chartColor={chartColor}
                      idealRange={idealRange}
                      timeFilter={timeFilter}
                    />
                  }
                  activeDot={{
                    r: 5,
                    strokeWidth: 2,
                    fill: "var(--color-theme-card)",
                    stroke: chartColor,
                  }}
                  connectNulls
                />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-theme-text-sec space-y-2">
              <Activity size={28} className="opacity-25" />
              <p className="text-sm font-medium">No readings for this period.</p>
            </div>
          )}
        </div>

        {/* Apple Health Summary Row (Seamlessly connected, no large gaps) */}
        <div className="pt-3.5 mt-1 border-t border-theme-border/50 grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-theme-text-sec">
              Average
            </p>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-xl font-bold font-display text-theme-text tabular-nums">
                {stats.avg}
              </span>
              <span className="text-xs text-theme-text-sec font-medium">
                {selectedType === "HbA1c" ? "%" : "mg/dL"}
              </span>
            </div>
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-theme-text-sec">
              Range
            </p>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-xl font-bold font-display text-theme-text tabular-nums">
                {stats.min !== "--" ? `${stats.min} – ${stats.max}` : "—"}
              </span>
              <span className="text-xs text-theme-text-sec font-medium">
                {selectedType === "HbA1c" ? "%" : "mg/dL"}
              </span>
            </div>
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-theme-text-sec">
              In Target
            </p>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-xl font-bold font-display text-theme-text tabular-nums">
                {targetStats.percent !== null ? `${targetStats.percent}%` : "—"}
              </span>
              <span className="text-xs text-theme-text-sec font-medium">
                {targetStats.count}/{stats.count}
              </span>
            </div>
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-theme-text-sec">
              Total Logs
            </p>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-xl font-bold font-display text-theme-text tabular-nums">
                {stats.count}
              </span>
              <span className="text-xs text-theme-text-sec font-medium">
                entries
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Reading Timeline */}
      <div className="bg-theme-card p-6 sm:p-8 rounded-4xl border border-theme-border shadow-md">
        <h3 className="text-xl font-display font-medium text-theme-text mb-4 flex items-center gap-2">
          Reading Timeline
        </h3>
        {allFilteredForTimeline.length === 0 ? (
          <p className="text-sm text-theme-text-sec py-4 text-center">
            No readings logged yet.
          </p>
        ) : (
          <div className="space-y-3">
            {(showAllTimeline
              ? allFilteredForTimeline
              : allFilteredForTimeline.slice(0, 7)
            ).map((reading) => (
              <div
                key={reading.id}
                className="flex items-center justify-between p-5 rounded-3xl border border-theme-border/50 bg-theme-bg hover:bg-theme-card-sec transition-all shadow-sm hover:shadow-md group"
              >
                <div className="flex items-center gap-5">
                  <div className="w-16 h-16 rounded-3xl bg-theme-card border border-theme-border/60 flex items-center justify-center text-theme-text font-black text-2xl shadow-sm">
                    {reading.value}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <div
                          className={cn(
                            "w-2 h-2 rounded-full",
                            reading.timing === "Fasting"
                              ? "bg-green-500"
                              : reading.timing === "Random"
                                ? "bg-blue-500"
                                : "bg-red-500",
                          )}
                        />
                        <span className="text-[11px] font-bold text-theme-text">
                          {reading.timing}
                        </span>
                      </div>
                      {reading.source === "OCR" && (
                        <span className="text-[9px] px-2 py-1 rounded-lg bg-purple-500/10 text-purple-500 font-bold ">
                          AI Read
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-bold text-theme-text flex items-center gap-1.5">
                      {safeFormat(reading.date, "MMM d, yyyy")}{" "}
                      <span className="text-theme-text-sec font-medium">
                        at
                      </span>{" "}
                      {reading.time}
                    </p>
                    {reading.hoursAfterEating !== undefined && (
                      <p className="text-xs text-theme-text-sec mt-1 font-medium">
                        {reading.hoursAfterEating}h after eating
                      </p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => removeGlucoseReading(reading.id)}
                  className="p-3 text-theme-text-sec hover:text-theme-critical hover:bg-theme-critical/10 rounded-2xl transition-all opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                  title="Delete reading"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))}

            {allFilteredForTimeline.length > 7 && (
              <button
                onClick={() => setShowAllTimeline(!showAllTimeline)}
                className="w-full mt-4 py-3 border border-theme-border rounded-xl text-theme-text-sec text-sm font-bold hover:bg-theme-card-sec transition-colors"
              >
                {showAllTimeline
                  ? "Show Less"
                  : `View All ${allFilteredForTimeline.length} Readings`}
              </button>
            )}
          </div>
        )}
      </div>

      {showAddModal && (
        <AddGlucoseModal
          onClose={() => setShowAddModal(false)}
          onAdd={async (r) => {
            try {
              await addGlucoseReading(r);
              setShowAddModal(false);
            } catch (e: any) {
              alert(friendlyFirebaseError(e, "Failed to add reading"));
            }
          }}
        />
      )}

      {showCriteriaModal && (
        <div
          className="fixed inset-0 z-70 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm transition-opacity"
          onClick={() => setShowCriteriaModal(false)}
        >
          <div
            className="bg-theme-card dark:bg-[#0f172a] w-full sm:w-112.5 max-h-[90vh] overflow-y-auto rounded-t-4xl sm:rounded-4xl shadow-2xl animate-in slide-in-from-bottom-full sm:zoom-in-95 duration-300 border border-theme-border dark:border-indigo-900/50"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-theme-card/90 dark:bg-[#0f172a]/90 backdrop-blur-md z-10 flex items-center justify-between p-6 border-b border-theme-border dark:border-indigo-900/50">
              <h3 className="text-xl font-display font-medium text-theme-text dark:text-white">
                Unlock Expected HbA1c
              </h3>
              <button
                onClick={() => setShowCriteriaModal(false)}
                className="w-8 h-8 rounded-full bg-theme-bg dark:bg-indigo-900/30 flex items-center justify-center text-theme-text-sec dark:text-indigo-300 hover:text-theme-text dark:hover:text-white transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-5 sm:p-6">
              <p className="text-theme-text-sec dark:text-indigo-100 font-medium mb-8">
                Keep logging glucose to unlock your Expected HbA1c.
              </p>
              <div className="space-y-4">
                <p className="text-sm font-sans font-bold capitalize tracking-normal text-theme-text dark:text-white mb-2">
                  Progress so far:
                </p>

                <div className="space-y-5">
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <div className="flex items-center gap-2">
                        {expectedHba1cData.daysTracked >= 28 ? (
                          <CheckCircle2
                            size={16}
                            className="text-emerald-500"
                          />
                        ) : (
                          <div className="w-4 h-4 rounded-full border-2 border-theme-border/50"></div>
                        )}
                        <span className="text-sm text-theme-text-sec dark:text-indigo-200 font-medium">
                          28 days of tracking
                        </span>
                      </div>
                      <span
                        className={`text-sm font-bold ${expectedHba1cData.daysTracked >= 28 ? "text-emerald-500" : "text-theme-text dark:text-white"}`}
                      >
                        {expectedHba1cData.daysTracked} / 28
                      </span>
                    </div>
                    <div className="w-full bg-theme-bg dark:bg-indigo-900/50 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${expectedHba1cData.daysTracked >= 28 ? "bg-emerald-500" : "bg-theme-accent dark:bg-indigo-500"}`}
                        style={{
                          width: `${Math.min(100, (expectedHba1cData.daysTracked / 28) * 100)}%`,
                        }}
                      ></div>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <div className="flex items-center gap-2">
                        {expectedHba1cData.totalReadings >= 32 ? (
                          <CheckCircle2
                            size={16}
                            className="text-emerald-500"
                          />
                        ) : (
                          <div className="w-4 h-4 rounded-full border-2 border-theme-border/50"></div>
                        )}
                        <span className="text-sm text-theme-text-sec dark:text-indigo-200 font-medium">
                          32 total readings
                        </span>
                      </div>
                      <span
                        className={`text-sm font-bold ${expectedHba1cData.totalReadings >= 32 ? "text-emerald-500" : "text-theme-text dark:text-white"}`}
                      >
                        {expectedHba1cData.totalReadings} / 32
                      </span>
                    </div>
                    <div className="w-full bg-theme-bg dark:bg-indigo-900/50 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${expectedHba1cData.totalReadings >= 32 ? "bg-emerald-500" : "bg-theme-accent dark:bg-indigo-500"}`}
                        style={{
                          width: `${Math.min(100, (expectedHba1cData.totalReadings / 32) * 100)}%`,
                        }}
                      ></div>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <div className="flex items-center gap-2">
                        {expectedHba1cData.fastingCount >= 12 ? (
                          <CheckCircle2
                            size={16}
                            className="text-emerald-500"
                          />
                        ) : (
                          <div className="w-4 h-4 rounded-full border-2 border-theme-border/50"></div>
                        )}
                        <span className="text-sm text-theme-text-sec dark:text-indigo-200 font-medium">
                          12 fasting readings
                        </span>
                      </div>
                      <span
                        className={`text-sm font-bold ${expectedHba1cData.fastingCount >= 12 ? "text-emerald-500" : "text-theme-text dark:text-white"}`}
                      >
                        {expectedHba1cData.fastingCount} / 12
                      </span>
                    </div>
                    <div className="w-full bg-theme-bg dark:bg-indigo-900/50 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${expectedHba1cData.fastingCount >= 12 ? "bg-emerald-500" : "bg-theme-accent dark:bg-indigo-500"}`}
                        style={{
                          width: `${Math.min(100, (expectedHba1cData.fastingCount / 12) * 100)}%`,
                        }}
                      ></div>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <div className="flex items-center gap-2">
                        {expectedHba1cData.postPrandialCount >= 12 ? (
                          <CheckCircle2
                            size={16}
                            className="text-emerald-500"
                          />
                        ) : (
                          <div className="w-4 h-4 rounded-full border-2 border-theme-border/50"></div>
                        )}
                        <span className="text-sm text-theme-text-sec dark:text-indigo-200 font-medium">
                          12 post-prandial readings
                        </span>
                      </div>
                      <span
                        className={`text-sm font-bold ${expectedHba1cData.postPrandialCount >= 12 ? "text-emerald-500" : "text-theme-text dark:text-white"}`}
                      >
                        {expectedHba1cData.postPrandialCount} / 12
                      </span>
                    </div>
                    <div className="w-full bg-theme-bg dark:bg-indigo-900/50 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${expectedHba1cData.postPrandialCount >= 12 ? "bg-emerald-500" : "bg-theme-accent dark:bg-indigo-500"}`}
                        style={{
                          width: `${Math.min(100, (expectedHba1cData.postPrandialCount / 12) * 100)}%`,
                        }}
                      ></div>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <div className="flex items-center gap-2">
                        {expectedHba1cData.missedDays <= 4 ? (
                          <CheckCircle2
                            size={16}
                            className="text-emerald-500"
                          />
                        ) : (
                          <div className="w-4 h-4 rounded-full border-2 border-theme-border/50"></div>
                        )}
                        <span className="text-sm text-theme-text-sec dark:text-indigo-200 font-medium">
                          Maximum 4 missed days
                        </span>
                      </div>
                      <span
                        className={`text-sm font-bold ${expectedHba1cData.missedDays <= 4 ? "text-emerald-500" : "text-theme-text dark:text-white"}`}
                      >
                        {expectedHba1cData.missedDays} / 4
                      </span>
                    </div>
                    <div className="w-full bg-theme-bg dark:bg-indigo-900/50 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${expectedHba1cData.missedDays > 4 ? "bg-red-500" : expectedHba1cData.missedDays === 0 ? "bg-emerald-500 w-full" : "bg-amber-500"}`}
                        style={{
                          width:
                            expectedHba1cData.missedDays === 0
                              ? "100%"
                              : `${Math.min(100, (expectedHba1cData.missedDays / 4) * 100)}%`,
                        }}
                      ></div>
                    </div>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setShowCriteriaModal(false)}
                className="w-full mt-10 py-3.5 rounded-2xl bg-theme-text text-theme-bg hover:opacity-90 dark:bg-white dark:text-[#0f172a] font-bold transition-all shadow-md"
              >
                Continue Logging
              </button>
            </div>
          </div>
        </div>
      )}

      {showHba1cInfo && (
        <div
          className="fixed inset-0 z-70 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm transition-opacity"
          onClick={() => setShowHba1cInfo(false)}
        >
          <div
            className="bg-theme-card w-full sm:w-125 max-h-[90vh] overflow-y-auto rounded-t-4xl sm:rounded-4xl shadow-2xl animate-in slide-in-from-bottom-full sm:zoom-in-95 duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-theme-card/90 backdrop-blur-md z-10 flex items-center justify-between p-6 border-b border-theme-border">
              <h3 className="text-xl font-display font-medium text-theme-text">
                Expected HbA1c
              </h3>
              <button
                onClick={() => setShowHba1cInfo(false)}
                className="w-8 h-8 rounded-full bg-theme-bg flex items-center justify-center text-theme-text-sec hover:text-theme-text transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-theme-text font-medium">
                Expected HbA1c provides an approximation of your laboratory
                HbA1c using your logged glucose readings.
              </p>
              <div className="p-4 bg-theme-accent/10 text-theme-accent font-medium rounded-2xl text-sm border border-theme-accent/20">
                It is not a replacement for a laboratory HbA1c test.
              </div>

              <div>
                <h4 className="text-sm font-bold text-theme-text-sec mb-3">
                  How is it calculated?
                </h4>
                <p className="text-theme-text text-sm mb-3">
                  We calculate your average glucose from your logged readings
                  and estimate your HbA1c using the internationally published
                  ADAG equation.
                </p>
                <div className="p-4 bg-theme-bg rounded-2xl font-mono text-xs text-theme-text-sec border border-theme-border/50 text-center">
                  HbA1c (%) = (Average Glucose + 46.7) / 28.7
                </div>
                <p className="text-xs text-theme-text-sec mt-3 italic">
                  Source: A1c-Derived Average Glucose (ADAG) Study.
                </p>
              </div>

              <div className="pt-6 border-t border-theme-border/50">
                <h4 className="text-sm font-bold text-theme-text-sec mb-3">
                  When is an estimate available?
                </h4>
                <p className="text-theme-text text-sm mb-4">
                  To improve reliability, Bluepin generates an estimate only
                  after you have:
                </p>
                <ul className="space-y-3">
                  <li className="flex items-center gap-3 text-sm text-theme-text font-medium">
                    <div className="w-1.5 h-1.5 rounded-full bg-theme-accent" />{" "}
                    At least 28 continuous days of DAILY tracking
                  </li>
                  <li className="flex items-center gap-3 text-sm text-theme-text font-medium">
                    <div className="w-1.5 h-1.5 rounded-full bg-theme-accent" />{" "}
                    At least 32 total readings in this period
                  </li>
                  <li className="flex items-center gap-3 text-sm text-theme-text font-medium">
                    <div className="w-1.5 h-1.5 rounded-full bg-theme-accent" />{" "}
                    ≥12 fasting readings in this period
                  </li>
                  <li className="flex items-center gap-3 text-sm text-theme-text font-medium">
                    <div className="w-1.5 h-1.5 rounded-full bg-theme-accent" />{" "}
                    ≥12 post-prandial readings
                  </li>
                  <li className="flex items-center gap-3 text-sm text-theme-text font-medium">
                    <div className="w-1.5 h-1.5 rounded-full bg-theme-accent" />{" "}
                    Maximum of 4 missed days
                  </li>
                </ul>
                <p className="text-theme-text-sec text-sm mt-4">
                  If these requirements are not met, we'll guide you on what's
                  still needed.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {showSugarHealth && (
        <div className="fixed inset-0 z-200 flex items-center justify-center p-4 bg-theme-bg/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-theme-card border border-theme-border rounded-4xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200">
            <div className="sticky top-0 bg-theme-card/90 backdrop-blur-md z-10 flex items-center justify-between p-6 sm:p-8 border-b border-theme-border">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center border border-purple-500/30 text-purple-500">
                  <Hexagon
                    size={20}
                    className="animate-[spin_4s_linear_infinite]"
                  />
                </div>
                <h3 className="text-2xl font-bold text-theme-text font-sans tracking-tight">
                  Sugar Health
                </h3>
              </div>
              <button
                onClick={() => setShowSugarHealth(false)}
                className="w-10 h-10 rounded-full bg-theme-bg flex items-center justify-center text-theme-text-sec hover:text-theme-text transition-colors border border-theme-border"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6 sm:p-8 space-y-8">
              {sugarInsights ? (
                <div className="space-y-8">
                  <div className="flex flex-col mb-4">
                    <div className="flex justify-center mb-6">
                      <div className="bg-black text-white dark:bg-white dark:text-black px-4 py-1.5 rounded-full text-xs font-bold shadow-sm">
                        {sugarInsights.currentWeekTotal} reading
                        {sugarInsights.currentWeekTotal !== 1 ? "s" : ""} this
                        week
                      </div>
                    </div>
                    <div className="w-full text-left">
                      <span className="text-sm font-medium text-black dark:text-white">
                        averages this month
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      {
                        label: "Fasting",
                        data: sugarInsights.cards.fasting,
                        color: "text-green-500",
                        bg: "bg-green-500/10",
                      },
                      {
                        label: "Post-Meal",
                        data: sugarInsights.cards.pp,
                        color: "text-red-500",
                        bg: "bg-red-500/10",
                      },
                      {
                        label: "Random",
                        data: sugarInsights.cards.random,
                        color: "text-blue-500",
                        bg: "bg-blue-500/10",
                      },
                    ].map((card, i) => (
                      <div
                        key={i}
                        className="p-4 rounded-2xl bg-theme-bg border border-theme-border flex flex-col justify-center items-center text-center"
                      >
                        <span className="text-[10px] sm:text-xs font-bold text-theme-text-sec mb-2">
                          {card.label}
                        </span>
                        {card.data.avg ? (
                          <>
                            <span className="text-xl sm:text-2xl font-black text-theme-text">
                              {card.data.avg}{" "}
                              <span className="text-[10px] sm:text-xs text-theme-text-sec font-medium">
                                mg/dL
                              </span>
                            </span>
                            {card.data.diff !== null && (
                              <span
                                className={`text-[10px] sm:text-xs font-bold mt-1 ${card.data.diff > 0 ? "text-amber-500" : "text-green-500"}`}
                              >
                                {card.data.diff > 0 ? "↑" : "↓"}{" "}
                                {Math.abs(card.data.diff)} mg/dL
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-sm font-medium text-theme-text-sec">
                            Not enough data
                          </span>
                        )}
                      </div>
                    ))}
                  </div>

                  {sugarInsights.better.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="text-lg font-bold text-theme-text tracking-tight flex items-center gap-2">
                        <Check className="text-green-500" size={18} /> What's
                        Better
                      </h4>
                      <ul className="space-y-2 text-theme-text-sec text-sm list-disc list-inside marker:text-green-500/50">
                        {sugarInsights.better.map((item, i) => (
                          <li key={i} className="pl-1">
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {sugarInsights.attention.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="text-lg font-bold text-theme-text tracking-tight flex items-center gap-2">
                        <AlertCircle className="text-amber-500" size={18} />{" "}
                        Needs Attention
                      </h4>
                      <ul className="space-y-2 text-theme-text-sec text-sm list-disc list-inside marker:text-amber-500/50">
                        {sugarInsights.attention.map((item, i) => (
                          <li key={i} className="pl-1">
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {sugarInsights.trends && sugarInsights.trends.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="text-lg font-bold text-theme-text tracking-tight flex items-center gap-2">
                        <TrendingUp className="text-blue-500" size={18} />{" "}
                        Trends
                      </h4>
                      <ul className="space-y-2 text-theme-text-sec text-sm list-disc list-inside marker:text-blue-500/50">
                        {sugarInsights.trends.map((item, i) => (
                          <li key={i} className="pl-1">
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {sugarInsights.recommendations.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="text-lg font-bold text-theme-text tracking-tight flex items-center gap-2">
                        💡 Recommendations
                      </h4>
                      <ul className="space-y-2 text-theme-text-sec text-sm list-disc list-inside marker:text-theme-accent/50">
                        {sugarInsights.recommendations.map((item, i) => (
                          <li key={i} className="pl-1">
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="w-16 h-16 rounded-full bg-theme-bg mx-auto flex items-center justify-center mb-4">
                    <Activity className="text-theme-text-sec" size={24} />
                  </div>
                  <p className="font-bold text-theme-text">Not enough data</p>
                  <p className="text-sm text-theme-text-sec mt-2">
                    Log more glucose readings to unlock your Sugar Health.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export { AddGlucoseModal };

const CustomTooltip = ({ active, payload, label, chartColor, unit, idealRange }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const isNormal =
      idealRange && data.value >= idealRange.min && data.value <= idealRange.max;

    return (
      <div className="bg-theme-card/95 backdrop-blur-md border border-theme-border/70 p-3 rounded-2xl shadow-xl min-w-32 z-50">
        <div className="flex items-center justify-between gap-3 mb-1">
          <p className="text-xs font-semibold text-theme-text-sec">
            {safeFormat(data.date, "MMM d, yyyy")}
          </p>
          {idealRange && (
            <span
              className={cn(
                "text-[10px] font-bold",
                isNormal ? "text-theme-success" : "text-amber-500",
              )}
            >
              {isNormal ? "Target" : "Elevated"}
            </span>
          )}
        </div>
        <div className="flex items-baseline gap-1.5">
          <span
            className="text-2xl font-black tracking-tight font-display tabular-nums"
            style={{ color: chartColor }}
          >
            {data.value}
          </span>
          <span className="text-xs font-bold text-theme-text-sec">{unit}</span>
        </div>
        <div className="flex items-center justify-between text-[11px] text-theme-text-sec mt-1.5 pt-1.5 border-t border-theme-border/40 font-medium">
          <span>{data.timing}</span>
          {data.time && <span>{data.time}</span>}
        </div>
      </div>
    );
  }
  return null;
};

const CustomDot = (props: any) => {
  const { cx, cy, payload, value, chartColor, idealRange, timeFilter } = props;

  if (value === null || value === undefined) return null;

  const isNormal =
    idealRange && value >= idealRange.min && value <= idealRange.max;
  const isOutside =
    idealRange && (value < idealRange.min || value > idealRange.max);
  const showStatus = timeFilter <= 90;

  return (
    <g className="overflow-visible pointer-events-none">
      <circle
        cx={cx}
        cy={cy}
        r={3.5}
        fill="var(--color-theme-card)"
        stroke={chartColor}
        strokeWidth={2}
      />

      {showStatus && isOutside && (
        <g transform={`translate(${cx + 4}, ${cy - 12})`}>
          <circle cx="5" cy="5" r="5" fill="#f59e0b" />
          <path
            d="M5 2.6v3M5 7.4v.01"
            fill="none"
            stroke="#ffffff"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </g>
      )}
    </g>
  );
};
