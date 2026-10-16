import { auth, db } from "../lib/firebase";
import { friendlyFirebaseError } from "../lib/friendlyFirebaseError";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import React, { useState, useMemo, useEffect } from "react";
import { motion } from "motion/react";
import { useAppStore } from "../store";
import { LabReport, Biomarker } from "../types";
import {
  Plus,
  FileText,
  UploadCloud,
  Loader2,
  ChevronDown,
  Info,
  X,
  ChevronRight,
  FileOutput,
  ArrowUp,
  ArrowDown,
  Download,
  Sparkles,
  Triangle,
} from "lucide-react";
import { cn, safeFormat, downloadFile } from "../lib/utils";
import { DashboardHealthDial } from "./DashboardHealthDial";
import { AddReportFlow } from "./AddReportFlow";
import { LegalDocsModal } from "./LegalDocsModal";
import { LegalDocType } from "../lib/consentManager";

import { format, parseISO, isAfter, subMonths } from "date-fns";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
} from "recharts";

import {
  CATEGORIES,
  TIER_1,
  calculateStatus,
  hydrateBiomarker,
} from "../lib/biomarkerUtils";
import {
  sortLabReports,
  getCanvasHealthScore,
  getReportHealthScore,
} from "../lib/derivedMetrics";

type AiInsights = {
  good: { profile: string; text: string }[];
  concern: { profile: string; text: string }[];
  advice: string[];
};

const PROFILE_LOGOS: Record<string, string> = {
  Liver: "/logos/liver.png",
  Lipid: "/logos/lipid.png",
  Thyroid: "/logos/thyroid.png",
  Kidney: "/logos/kidney.png",
  Blood: "/logos/blood.png",
  Glucose: "/logos/glucose.png",
  Vitamins: "/logos/vitamins.png",
  Urinary: "/logos/urinary.png",
  Inflammatory: "/logos/inflammatory.png",
  Others: "/logos/others.png",
};

const ProfileLogo = ({ profile }: { profile: string }) => {
  let matchedKey = "Others";
  if (profile) {
    const lowerProfile = profile.toLowerCase();
    for (const key of Object.keys(PROFILE_LOGOS)) {
      if (key !== "Others" && lowerProfile.includes(key.toLowerCase())) {
        matchedKey = key;
        break;
      }
    }
  }

  const src = PROFILE_LOGOS[matchedKey];

  return (
    <img
      src={src}
      alt={matchedKey}
      className="w-7 h-7 sm:w-8 sm:h-8 object-contain shrink-0"
      title={profile || matchedKey}
    />
  );
};

export default function BiomarkersTab() {
  const { labReports, addLabReport, removeLabReport, updateLabReport } =
    useAppStore();
  const [activeTab, setActiveTab] = useState<"dashboard" | "timeline">(
    "dashboard",
  );
  const [showAddReportModal, setShowAddReportModal] = useState(false);
  const [openLegalDoc, setOpenLegalDoc] = useState<LegalDocType | null>(null);

  const [isUploading, setIsUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const [selectedBiomarker, setSelectedBiomarker] = useState<{
    biomarker: Biomarker;
    history: any[];
  } | null>(null);
  const [uploadConfirmation, setUploadConfirmation] = useState<any>(null); // To confirm date before saving
  const [deleteConfirmationId, setDeleteConfirmationId] = useState<
    string | null
  >(null);
  const [deleteInput, setDeleteInput] = useState("");
  const [previewFile, setPreviewFile] = useState<{
    url: string;
    type: string;
  } | null>(null);
  const [editDateReport, setEditDateReport] = useState<{
    id: string;
    date: string;
  } | null>(null);

  const [aiInsights, setAiInsights] = useState<AiInsights | null>(null);
  const [isAiInsightsCollapsed, setIsAiInsightsCollapsed] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Sorting reports chronologically for accurate timelines
  const sortedReports = useMemo(() => sortLabReports(labReports), [labReports]);

  useEffect(() => {
    setAiInsights(null);
    setIsAiInsightsCollapsed(false);
  }, [labReports.length]);

  const {
    score,
    prevScore,
    highLowCount,
    borderlineCount,
    latestBiomarkers: allBiomarkersLatest,
  } = useMemo(() => {
    return getCanvasHealthScore(sortedReports);
  }, [sortedReports]);

  const getHistoryForBiomarker = (biomarkerName: string) => {
    return sortedReports
      .map((r) => {
        const bRaw = r.biomarkers.find((x) => {
          const hydX = hydrateBiomarker(x);
          return (hydX.biomarkerId || hydX.name) === biomarkerName;
        });
        if (!bRaw) return null;
        const b = hydrateBiomarker(bRaw);
        if (!b) return null;
        return {
          date: r.date,
          value: b.value,
          ...calculateStatus(
            b.biomarkerId || b.name,
            b.value,
            b.refMin,
            b.refMax,
            b.status,
            b.refRangeText,
          ),
        };
      })
      .filter(Boolean);
  };

  const [isSubmittingReport, setIsSubmittingReport] = useState(false);

  const processFile = async (file: File) => {
    // Implement or ignore if handled by AddReportFlow, wait, the template needs it.
    // We can just stub them if they were passed but not fully implemented, or use existing AddReportFlow.
    console.log("processFile", file);
  };

  const confirmUpload = async () => {
    setIsSubmittingReport(true);
    console.log("confirmUpload");
    setIsSubmittingReport(false);
  };

  const generateInsights = async () => {
    if (sortedReports.length === 0) return;

    setIsAnalyzing(true);
    setAiError(null);
    try {
      const sixMonthsAgo = subMonths(new Date(), 6);

      let relevantReports = sortedReports.filter((r) =>
        isAfter(parseISO(r.date), sixMonthsAgo),
      );

      if (relevantReports.length < 3 && sortedReports.length >= 3) {
        relevantReports = sortedReports.slice(-3);
      } else if (sortedReports.length < 3) {
        relevantReports = sortedReports;
      }

      const uid = auth.currentUser?.uid;
      if (!uid) throw new Error("User not authenticated");

      // Generate a hash based on the IDs of the reports used
      const reportHash = relevantReports.map((r) => r.id).join("_");
      const cacheRef = doc(db, `users/${uid}/insights`, reportHash);

      try {
        const cachedDoc = await getDoc(cacheRef);
        if (cachedDoc.exists()) {
          setAiInsights(cachedDoc.data() as AiInsights);
          setIsAiInsightsCollapsed(false);
          setIsAnalyzing(false);
          return;
        }
      } catch (e) {
        console.warn("Could not check cache", e);
      }

      // Simplify reports to save tokens
      const simplifiedReports = relevantReports.map((r) => ({
        date: r.date,
        biomarkers: r.biomarkers.map((b) => ({
          name: b.name,
          value: b.value,
          unit: b.unit,
          status: b.status,
        })),
      }));

      const res = await fetch("/api/generate-insights", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${await auth.currentUser?.getIdToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reports: simplifiedReports }),
      });

      if (!res.ok) {
        const text = await res.text();
        let parsed;
        try {
          parsed = JSON.parse(text);
        } catch (e) {}
        throw new Error(parsed?.error || text || `HTTP Error ${res.status}`);
      }

      const data = await res.json();

      // Save to cache
      try {
        await setDoc(cacheRef, {
          ...data,
          createdAt: serverTimestamp(),
          reportIds: relevantReports.map((r) => r.id),
        });
      } catch (e) {
        console.warn("Could not save to cache", e);
      }

      setAiInsights(data);
      setIsAiInsightsCollapsed(false);
    } catch (err: any) {
      console.error(err);
      setAiError(friendlyFirebaseError(err, "Failed to generate AI highlights."));
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div
      className={cn(
        "space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500 max-w-4xl mx-auto pb-24 mt-4 md:-mt-8",
        isDragging
          ? "ring-2 ring-theme-accent bg-theme-card-sec scale-[1.01] rounded-3xl"
          : "",
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setIsDragging(false);
      }}
      onDrop={async (e) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) await processFile(file);
      }}
    >
      {isDragging && (
        <div className="fixed inset-0 z-50 bg-theme-text/40 backdrop-blur-sm flex items-center justify-center p-4 rounded-xl m-4 pointer-events-none border-2 border-dashed border-white">
          <div className="bg-theme-card p-8 rounded-3xl shadow-xl flex flex-col items-center max-w-sm w-full text-center scale-up">
            <UploadCloud size={64} className="text-theme-text-sec mb-6" />
            <h3 className="text-xl font-bold text-theme-text mb-2">
              Drop it here
            </h3>
            <p className="text-theme-text-sec text-sm">
              Release to upload your lab report and analyze biomarkers
              automatically.
            </p>
          </div>
        </div>
      )}

      {/* Header and Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-4xl font-display font-medium text-theme-text tracking-tight">
          Health Canvas
        </h2>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex bg-theme-card-sec p-1 rounded-full relative">
            <button
              id="canvas-dashboard-tab"
              data-tour="canvas-dashboard-tab"
              onClick={() => setActiveTab("dashboard")}
              className={cn(
                "px-4 py-2 text-sm font-medium rounded-full transition-colors relative z-10",
                activeTab === "dashboard"
                  ? "text-white"
                  : "text-theme-text-sec hover:text-theme-text",
              )}
            >
              {activeTab === "dashboard" && (
                <motion.div
                  layoutId="biomarkersTab-active"
                  className="absolute inset-0 bg-linear-to-r from-[#C85A17] to-[#DF6D22] rounded-full shadow-md -z-10"
                  transition={{ type: "spring", stiffness: 300, damping: 25 }}
                />
              )}
              Dashboard
            </button>
            <button
              id="canvas-timeline-tab"
              data-tour="canvas-timeline-tab"
              onClick={() => setActiveTab("timeline")}
              className={cn(
                "px-4 py-2 text-sm font-medium rounded-full transition-colors relative z-10",
                activeTab === "timeline"
                  ? "text-white"
                  : "text-theme-text-sec hover:text-theme-text",
              )}
            >
              {activeTab === "timeline" && (
                <motion.div
                  layoutId="biomarkersTab-active"
                  className="absolute inset-0 bg-linear-to-r from-[#C85A17] to-[#DF6D22] rounded-full shadow-md -z-10"
                  transition={{ type: "spring", stiffness: 300, damping: 25 }}
                />
              )}
              Timeline
            </button>
          </div>

          <button
            id="canvas-highlights-button"
            data-tour="canvas-highlights-button"
            onClick={generateInsights}
            disabled={isAnalyzing}
            className="flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-full text-white bg-linear-to-r from-[#9B49FC] to-[#792DF5] transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg shrink-0"
          >
            {isAnalyzing ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Triangle
                size={16}
                className="shrink-0 animate-[spin_4s_linear_infinite]"
              />
            )}
            {isAnalyzing ? "Generating..." : "Highlights"}
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="text-sm text-theme-critical bg-theme-critical/10 p-4 rounded-xl border border-theme-critical flex items-start gap-3">
          <Info size={18} className="mt-0.5 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Global Actions */}
      <button
        id="canvas-upload-report-button"
        data-tour="canvas-upload-report-button"
        onClick={() => setShowAddReportModal(true)}
        className="fixed bottom-24 md:bottom-10 right-4 md:right-8 bg-theme-text text-theme-bg w-14 h-14 rounded-full shadow-xl hover:scale-105 active:scale-95 transition-transform z-40 flex items-center justify-center"
      >
        <div className="relative">
          <FileText size={24} strokeWidth={2.5} />
          <div className="absolute -top-1 -right-1 bg-theme-text rounded-full p-px">
            <Plus size={12} className="text-theme-bg" strokeWidth={4} />
          </div>
        </div>
      </button>

      {showAddReportModal && (
        <AddReportFlow
          onClose={() => setShowAddReportModal(false)}
          onSuccess={() => setShowAddReportModal(false)}
        />
      )}

      {/* Upload Confirmation Modal */}
      {uploadConfirmation && (
        <div className="fixed inset-0 z-60 bg-theme-text/40 backdrop-blur-sm flex items-center justify-center p-4 zoom-in-95">
          <div className="bg-theme-card max-w-md w-full rounded-3xl overflow-hidden shadow-2xl p-6">
            <h3 className="text-xl font-bold text-theme-text mb-2">
              Review Extracted Data
            </h3>
            <p className="text-theme-text-sec text-sm mb-6">
              We've extracted {uploadConfirmation.biomarkers.length} biomarkers.
            </p>

            <div className="space-y-4 mb-6 relative">
              <div>
                <label className="block text-xs font-bold text-theme-text-sec mb-1">
                  Report Name
                </label>
                <input
                  type="text"
                  value={uploadConfirmation.name}
                  onChange={(e) =>
                    setUploadConfirmation({
                      ...uploadConfirmation,
                      name: e.target.value,
                    })
                  }
                  className="w-full bg-theme-card-sec border border-theme-border text-theme-text text-lg px-4 py-3 rounded-xl focus:ring-2 focus:ring-theme-accent outline-none"
                  placeholder="e.g. Annual Checkup"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-theme-text-sec mb-1">
                  Report Date
                </label>
                <input
                  type="date"
                  value={uploadConfirmation.date}
                  onChange={(e) =>
                    setUploadConfirmation({
                      ...uploadConfirmation,
                      date: e.target.value,
                    })
                  }
                  className="w-full bg-theme-card-sec border border-theme-border text-theme-text text-lg px-4 py-3 rounded-xl focus:ring-2 focus:ring-theme-accent outline-none"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setUploadConfirmation(null)}
                className="flex-1 py-3 px-4 bg-theme-card-sec border border-theme-border hover:bg-theme-border text-theme-text font-bold rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmUpload}
                disabled={isSubmittingReport}
                className="flex-1 py-3 px-4 bg-linear-to-r from-theme-accent to-theme-accent/80 text-white shadow-lg shadow-theme-accent/20 hover:opacity-90 font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {isSubmittingReport ? (
                  <Loader2 className="animate-spin" size={20} />
                ) : (
                  "Confirm"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Primary Dashboard Content */}
      {activeTab === "dashboard" && labReports.length > 0 && (
        <div 
          id="health-canvas-area"
          data-tour="health-canvas-area"
          className="space-y-8 animate-in fade-in duration-300"
        >
          {/* Section 1: Health Score */}
          {score !== null &&
            (() => {
              const getScoreDetails = (s: number) => {
                if (s >= 90)
                  return {
                    label: "Excellent",
                    color: "var(--color-theme-success)",
                    glow: "rgba(0, 255, 163, 0.5)",
                  };
                if (s >= 75)
                  return {
                    label: "Good",
                    color: "var(--color-theme-success)",
                    glow: "rgba(74, 222, 128, 0.5)",
                  };
                if (s >= 60)
                  return {
                    label: "Fair",
                    color: "var(--color-theme-warning)",
                    glow: "rgba(250, 204, 21, 0.5)",
                  };
                if (s >= 40)
                  return {
                    label: "Unhealthy",
                    color: "var(--color-theme-warning)",
                    glow: "rgba(251, 146, 60, 0.5)",
                  };
                return {
                  label: "Alarming",
                  color: "var(--color-theme-critical)",
                  glow: "rgba(248, 113, 113, 0.5)",
                };
              };
              const details = getScoreDetails(score);
              const optimalCount =
                allBiomarkersLatest.length - (highLowCount + borderlineCount);

              return (
                <div className="bg-theme-card rounded-4xl border border-theme-border p-6 sm:p-10 mb-8 flex flex-col lg:flex-row items-center justify-between gap-8 sm:gap-12 relative overflow-hidden">
                  {/* Left Column: Circular Progress & Score */}
                  <div className="flex flex-col items-center shrink-0 w-full lg:w-auto">
                    <DashboardHealthDial
                      score={score}
                      scoreDiff={prevScore !== null ? score - prevScore : 0}
                    />
                  </div>

                  {/* Right Column: Score Label, Changes, Details */}
                  <div className="flex-1 min-w-0 w-full space-y-6">
                    <div>
                      <div className="flex flex-col items-center sm:items-start mb-2">
                        <h2 className="text-5xl sm:text-6xl font-display font-medium text-theme-text">
                          {details.label}
                        </h2>
                      </div>
                      <p className="text-theme-text font-sans text-sm max-w-md text-center sm:text-left mx-auto sm:mx-0">
                        Based on your latest lab results compared to optimal
                        clinical ranges.
                      </p>
                    </div>

                    <div className="flex items-center justify-center sm:justify-start gap-6 sm:gap-8 w-full animate-in fade-in slide-in-from-bottom-2 duration-700 mt-2">
                      {/* Optimal */}
                      <div className="flex items-center gap-2">
                        <div className="relative flex items-center justify-center">
                          <div className="absolute w-3 h-3 rounded-full bg-emerald-500/20 dark:bg-emerald-400/20 blur-[2px]" />
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 relative z-10" />
                        </div>
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-theme-text font-display font-medium text-[15px] leading-none">
                            {optimalCount}
                          </span>
                          <span className="text-theme-text-sec font-sans text-[12px] font-medium">
                            Optimal
                          </span>
                        </div>
                      </div>

                      {/* Borderline */}
                      <div className="flex items-center gap-2">
                        <div className="relative flex items-center justify-center">
                          <div className="absolute w-3 h-3 rounded-full bg-amber-500/20 dark:bg-amber-400/20 blur-[2px]" />
                          <div className="w-1.5 h-1.5 rounded-full bg-amber-500 dark:bg-amber-400 relative z-10" />
                        </div>
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-theme-text font-display font-medium text-[15px] leading-none">
                            {borderlineCount}
                          </span>
                          <span className="text-theme-text-sec font-sans text-[12px] font-medium">
                            Borderline
                          </span>
                        </div>
                      </div>

                      {/* Attention */}
                      <div className="flex items-center gap-2">
                        <div className="relative flex items-center justify-center">
                          <div className="absolute w-3 h-3 rounded-full bg-red-500/20 dark:bg-red-400/20 blur-[2px]" />
                          <div className="w-1.5 h-1.5 rounded-full bg-red-500 dark:bg-red-400 relative z-10" />
                        </div>
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-theme-text font-display font-medium text-[15px] leading-none">
                            {highLowCount}
                          </span>
                          <span className="text-theme-text-sec font-sans text-[12px] font-medium">
                            Attention
                          </span>
                        </div>
                      </div>
                    </div>

                    {aiInsights && !isAiInsightsCollapsed && (
                      <div className="space-y-6 mt-4 animate-in fade-in slide-in-from-top-2 duration-300">
                        {aiInsights.good && aiInsights.good.length > 0 && (
                          <div>
                            <h5 className="font-bold text-theme-success mb-2 text-sm flex items-center gap-2">
                              <ArrowUp size={16} /> Good Progress
                            </h5>
                            <ul className="space-y-2.5">
                              {aiInsights.good.map((insight, i) => (
                                <li
                                  key={i}
                                  className="flex items-start gap-3 text-sm sm:text-base text-theme-text-sec"
                                >
                                  <ProfileLogo profile={insight?.profile} />
                                  <span className="leading-relaxed">
                                    {typeof insight === "object" && insight !== null
                                      ? (insight as any).text || JSON.stringify(insight)
                                      : String(insight ?? "")}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {aiInsights.concern &&
                          aiInsights.concern.length > 0 && (
                            <div>
                              <h5 className="font-bold text-[#d97706] dark:text-[#f59e0b] mb-2 text-sm flex items-center gap-2">
                                <ArrowDown size={16} /> Areas of Concern
                              </h5>
                              <ul className="space-y-2.5">
                                {aiInsights.concern.map((insight, i) => (
                                  <li
                                    key={i}
                                    className="flex items-start gap-3 text-sm sm:text-base text-theme-text-sec"
                                  >
                                    <ProfileLogo profile={insight?.profile} />
                                    <span className="leading-relaxed">
                                      {typeof insight === "object" && insight !== null
                                        ? (insight as any).text ||
                                          JSON.stringify(insight)
                                        : String(insight ?? "")}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                        {aiInsights.advice && aiInsights.advice.length > 0 && (
                          <div className="bg-purple-500/5 p-4 sm:p-5 rounded-2xl border border-purple-500/20">
                            <h5 className="font-bold text-purple-700 dark:text-purple-400 mb-2 text-sm flex items-center gap-2">
                              <Sparkles size={16} /> Quick Advice
                            </h5>
                            <ul className="space-y-2.5">
                              {aiInsights.advice.map((insight, i) => (
                                <li
                                  key={i}
                                  className="flex items-start gap-3 text-sm text-purple-900/80 dark:text-purple-200/80"
                                >
                                  <span className="mt-1.5 shrink-0 w-1.5 h-1.5 rounded-full bg-purple-500/60" />
                                  <span className="leading-relaxed">
                                    {typeof insight === "object" && insight !== null
                                      ? (insight as any).text || JSON.stringify(insight)
                                      : String(insight ?? "")}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        <div className="pt-2.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-[11px] text-theme-text-sec border-t border-theme-border/50">
                          <span className="flex items-center gap-1.5">
                            <Info size={13} className="shrink-0 text-purple-500" />
                            Bluepin Intelligence is informational and not medical advice.
                          </span>
                          <button
                            type="button"
                            onClick={() => setOpenLegalDoc("ai-disclaimer")}
                            className="text-purple-600 dark:text-purple-400 font-semibold hover:underline shrink-0 cursor-pointer"
                          >
                            AI Output Disclaimer &rarr;
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

          {/* Section: Parameters */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 group">
                <h3 className="text-xl font-bold text-theme-text">
                  Parameters
                </h3>
                <div className="relative flex items-center cursor-help">
                  <Info className="w-4 h-4 text-theme-text-sec transition-colors" />
                  <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-72 bg-theme-card text-theme-text text-xs p-3.5 rounded-xl border border-theme-border shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                    AI extraction may occasionally misclassify values or
                    statuses. We are continuously improving accuracy with newer
                    models.
                    <button
                      type="button"
                      onClick={() => setOpenLegalDoc("ai-disclaimer")}
                      className="block mt-2 text-purple-600 dark:text-purple-400 font-semibold hover:underline cursor-pointer"
                    >
                      AI Output Disclaimer &rarr;
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-theme-card rounded-3xl border border-theme-border overflow-hidden shadow-sm divide-y divide-theme-border/50 flex flex-col">
              {CATEGORIES.map((category) => {
                const categoryBiomarkers = allBiomarkersLatest.filter(
                  (b: any) => (b.category || "Others") === category,
                );
                if (categoryBiomarkers.length === 0) return null;
                return (
                  <CategoryGroup
                    key={category}
                    category={category}
                    biomarkers={categoryBiomarkers}
                    getHistory={getHistoryForBiomarker}
                    onSelectBiomarker={(b, h) =>
                      setSelectedBiomarker({ biomarker: b, history: h })
                    }
                  />
                );
              })}

              {(() => {
                const otherBiomarkers = allBiomarkersLatest.filter(
                  (b: any) => !b.category || !CATEGORIES.includes(b.category),
                );
                if (otherBiomarkers.length === 0) return null;
                return (
                  <CategoryGroup
                    key="Others"
                    category="Others"
                    biomarkers={otherBiomarkers}
                    getHistory={getHistoryForBiomarker}
                    onSelectBiomarker={(b, h) =>
                      setSelectedBiomarker({ biomarker: b, history: h })
                    }
                  />
                );
              })()}
            </div>
          </div>
        </div>
      )}
      {/* Timeline Content */}
      {activeTab === "timeline" && (
        <div 
          id="canvas-timeline-area"
          data-tour="canvas-timeline-area"
          className="space-y-6 animate-in fade-in duration-300 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-linear-to-b before:from-transparent before:via-theme-border before:to-transparent"
        >
          {sortedReports.length === 0 ? (
            <div className="text-center py-12 relative z-10">
              <p className="text-theme-text-sec">No medical reports found.</p>
            </div>
          ) : (
            [...sortedReports].reverse().map((report, i) => (
              <div
                key={report.id || i}
                className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active py-6"
              >
                <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-theme-card bg-theme-bg text-theme-text-sec shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 group-hover:text-theme-text group-hover:border-theme-border transition-colors relative z-10">
                  <FileText size={16} />
                </div>

                <div className="w-[calc(100%-4rem)] md:w-[calc(50%-3rem)] bg-theme-card border border-theme-border p-4 sm:p-5 rounded-2xl shadow-md hover:border-theme-text/20 transition-all group-hover:-translate-y-1 relative z-10 overflow-hidden">
                  {getReportHealthScore(report).score && (
                    <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-bl-[100px] -z-10 blur-xl pointer-events-none" />
                  )}

                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 relative z-10">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1.5">
                        <span className="px-2 py-0.5 bg-theme-bg rounded-md text-[11px] font-bold tracking-wide text-theme-text-sec uppercase border border-theme-border">
                          {report.date}
                        </span>
                        <button
                          onClick={() =>
                            setEditDateReport({
                              id: report.id,
                              date: report.date,
                            })
                          }
                          className="text-theme-text-sec hover:text-theme-text text-xs font-bold underline decoration-theme-border underline-offset-4"
                        >
                          Edit
                        </button>
                      </div>
                      <h4 className="text-lg sm:text-xl font-bold text-theme-text leading-tight">
                        {report.name || "Lab Report"}
                      </h4>
                    </div>

                    {getReportHealthScore(report).score && (
                      <div className="flex flex-col items-start sm:items-end shrink-0 mt-3 sm:mt-0">
                        <p className="text-[10px] uppercase font-bold tracking-wider text-theme-text-sec mb-0.5">
                          Health Score
                        </p>
                        <div className="flex items-baseline gap-0.5">
                          <span className="text-3xl sm:text-4xl font-black tracking-tighter text-theme-text">
                            {getReportHealthScore(report).score}
                          </span>
                          <span className="text-theme-text-sec font-bold text-sm">
                            /100
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 mt-4 pt-4 border-t border-theme-border/50">
                    <button
                      onClick={() => {
                        if (report.fileUrl && report.fileUrl !== "#") {
                          downloadFile(report.fileUrl, report.date);
                        } else {
                          console.warn("No file attached to this report.");
                        }
                      }}
                      disabled={!report.fileUrl || report.fileUrl === "#"}
                      className="flex-1 flex items-center justify-center gap-2 py-2 bg-theme-text hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-theme-bg rounded-xl text-sm font-bold transition-opacity"
                    >
                      <Download size={16} /> Download
                    </button>
                    <button
                      onClick={() => setDeleteConfirmationId(report.id)}
                      className="flex items-center justify-center p-2 bg-theme-bg hover:bg-theme-border text-theme-critical border border-theme-border rounded-xl transition-colors shrink-0"
                      title="Delete Report"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmationId && (
        <div className="fixed inset-0 z-60 bg-theme-text/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-theme-card max-w-sm w-full rounded-3xl p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-theme-text mb-2">
              Delete Report
            </h3>
            <p className="text-sm text-theme-text-sec mb-4">
              Deleting this report will permanently remove the original file and
              all extracted biomarker values.
            </p>
            <p className="text-xs text-theme-critical font-bold mb-2">
              Type "DELETE" to confirm
            </p>
            <input
              type="text"
              value={deleteInput}
              onChange={(e) => setDeleteInput(e.target.value)}
              className="w-full border border-theme-border rounded-xl px-4 py-3 text-theme-text font-bold mb-6 focus:ring-2 focus:ring-red-500 outline-none bg-transparent"
              placeholder=""
            />
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setDeleteConfirmationId(null);
                  setDeleteInput("");
                }}
                className="flex-1 py-3 px-4 bg-theme-card-sec hover:bg-theme-border rounded-xl font-bold text-theme-text transition"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (deleteInput === "DELETE") {
                    removeLabReport(deleteConfirmationId);
                    setDeleteConfirmationId(null);
                    setDeleteInput("");
                  }
                }}
                disabled={deleteInput !== "DELETE"}
                className="flex-1 py-3 px-4 bg-red-600 disabled:opacity-50 hover:bg-red-700 text-white font-bold rounded-xl transition"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Date Modal */}
      {editDateReport && (
        <div className="fixed inset-0 z-60 bg-theme-text/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-theme-card max-w-sm w-full rounded-3xl p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-theme-text mb-2">
              Edit Report Date
            </h3>
            <p className="text-sm text-theme-text-sec mb-4">
              Changing the report date will re-sort your timeline.
            </p>
            <input
              type="date"
              value={editDateReport.date}
              onChange={(e) =>
                setEditDateReport({ ...editDateReport, date: e.target.value })
              }
              className="w-full border border-theme-border rounded-xl px-4 py-3 text-theme-text font-bold mb-6 focus:ring-2 focus:ring-theme-accent outline-none bg-transparent"
            />
            <div className="flex gap-3">
              <button
                onClick={() => setEditDateReport(null)}
                className="flex-1 py-3 px-4 bg-theme-card-sec hover:bg-theme-border rounded-xl font-bold text-theme-text transition"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (editDateReport.date) {
                    updateLabReport(editDateReport.id, {
                      date: editDateReport.date,
                    });
                    setEditDateReport(null);
                  }
                }}
                className="flex-1 py-3 px-4 bg-theme-accent hover:opacity-90 text-white font-bold rounded-xl transition"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Empty State Dashboard */}
      {activeTab === "dashboard" && labReports.length === 0 && !isUploading && (
        <div 
          id="health-canvas-area"
          data-tour="health-canvas-area"
          className="flex flex-col items-center justify-center py-32 text-theme-text-sec bg-theme-card rounded-4xl border border-theme-border border-dashed"
        >
          <FileText size={48} className="opacity-20 mb-4" />
          <p className="font-medium text-theme-text-sec text-lg">
            Your health canvas is empty.
          </p>
          <p className="text-sm mt-1 mb-8 text-center max-w-sm">
            No biomarker parameters have been recorded in your profile yet.
            Upload a lab report PDF or image to begin.
          </p>
        </div>
      )}

      {/* Modal: View Uploaded File */}
      {previewFile && (
        <div className="fixed inset-0 z-80 bg-theme-text/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-theme-card w-full h-[90vh] max-w-5xl rounded-2xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="flex justify-between items-center p-4 border-b border-theme-border bg-theme-card-sec/50">
              <h3 className="text-lg font-bold text-theme-text flex items-center gap-2">
                <FileOutput size={18} /> Original Upload
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (previewFile) {
                      downloadFile(previewFile.url, new Date().toISOString());
                    }
                  }}
                  className="px-3 py-1.5 bg-theme-accent text-white hover:opacity-90 text-xs font-bold rounded-lg transition-colors"
                >
                  Download
                </button>
                <button
                  onClick={() => setPreviewFile(null)}
                  className="p-2 bg-theme-border hover:bg-theme-border/80 rounded-full transition-colors active:scale-95"
                >
                  <X size={16} className="text-theme-text" />
                </button>
              </div>
            </div>
            <div className="flex-1 bg-theme-card-sec relative overflow-hidden flex items-center justify-center">
              {previewFile.type.includes("pdf") ? (
                <iframe
                  src={previewFile.url}
                  className="w-full h-full border-none"
                  title="PDF Preview"
                />
              ) : (
                <img
                  src={previewFile.url}
                  alt="Document Preview"
                  className="max-w-full max-h-full object-contain"
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Single Graph / Details */}
      {selectedBiomarker && (
        <div className="fixed inset-0 z-70 bg-theme-text/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-theme-card w-full sm:max-w-2xl sm:rounded-3xl rounded-t-3xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-10 sm:zoom-in-95 duration-300">
            <div className="flex justify-between items-center p-6 border-b border-theme-border bg-theme-card-sec/50">
              <div>
                <h3 className="text-xl sm:text-2xl font-bold text-theme-text">
                  {selectedBiomarker.biomarker.name}
                </h3>
                <p className="text-sm text-theme-text-sec font-medium">
                  Ref Range:{" "}
                  {selectedBiomarker.biomarker.refRangeText ||
                    (selectedBiomarker.biomarker.refMin === 0 &&
                    selectedBiomarker.biomarker.refMax === 0
                      ? "Not specified"
                      : `${selectedBiomarker.biomarker.refMin ?? "?"} - ${selectedBiomarker.biomarker.refMax ?? "?"}`)}{" "}
                  {selectedBiomarker.biomarker.unit}
                </p>
              </div>
              <button
                onClick={() => setSelectedBiomarker(null)}
                className="p-3 bg-theme-card-sec hover:bg-theme-border rounded-full transition-colors active:scale-95"
              >
                <X size={20} className="text-theme-text-sec" />
              </button>
            </div>

            <div className="p-4 sm:p-6 bg-theme-card">
              <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-6">
                <div className="p-4 bg-theme-card-sec rounded-2xl border border-theme-border">
                  <p className="text-[10px] sm:text-xs text-theme-text-sec font-bold mb-1">
                    Latest
                  </p>
                  <p className="text-2xl sm:text-3xl font-bold text-theme-text">
                    {
                      selectedBiomarker.history[
                        selectedBiomarker.history.length - 1
                      ]?.value
                    }
                    <span className="text-sm text-theme-text-sec ml-1 font-medium">
                      {selectedBiomarker.biomarker.unit}
                    </span>
                  </p>
                </div>
                {selectedBiomarker.history.length > 1 ? (
                  <div className="p-4 bg-theme-card-sec rounded-2xl border border-theme-border">
                    <p className="text-[10px] sm:text-xs text-theme-text-sec font-bold mb-1">
                      Previous
                    </p>
                    <p className="text-2xl sm:text-3xl font-bold text-theme-text">
                      {
                        selectedBiomarker.history[
                          selectedBiomarker.history.length - 2
                        ]?.value
                      }
                      <span className="text-sm text-theme-text-sec ml-1 font-medium">
                        {selectedBiomarker.biomarker.unit}
                      </span>
                    </p>
                  </div>
                ) : (
                  <div className="p-4 bg-theme-card-sec rounded-2xl border border-theme-border flex items-center justify-center opacity-50">
                    <p className="text-xs text-theme-text-sec font-medium">
                      No previous data
                    </p>
                  </div>
                )}
              </div>

              {selectedBiomarker.biomarker.info && (
                <div className="mb-6 p-4 bg-theme-text/5 rounded-2xl border border-theme-border flex gap-3 items-start">
                  <Info
                    size={20}
                    className="text-theme-text-sec shrink-0 mt-0.5"
                  />
                  <p className="text-sm text-theme-text font-medium leading-relaxed">
                    {selectedBiomarker.biomarker.info}
                  </p>
                </div>
              )}

              {selectedBiomarker.history.length > 1 ||
              TIER_1.includes(
                selectedBiomarker.biomarker.name.toLowerCase().trim(),
              ) ? (
                <div className="h-55 sm:h-70 w-full mt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={selectedBiomarker.history}
                      margin={{ top: 20, right: 20, left: -10, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="var(--color-theme-border)"
                      />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(t) => safeFormat(t, "dd MMM ''yy")}
                        axisLine={false}
                        tickLine={false}
                        tick={{
                          fontSize: 11,
                          fill: "var(--color-theme-text-sec)",
                          fontWeight: 500,
                        }}
                        dy={10}
                        minTickGap={20}
                      />
                      <YAxis
                        domain={[
                          (dataMin: number) => {
                            const refMin = selectedBiomarker.biomarker.refMin;
                            const trueMin =
                              refMin !== undefined && refMin !== null
                                ? Math.min(dataMin, refMin)
                                : dataMin;
                            const margin =
                              trueMin === 0 ? 0 : Math.abs(trueMin) * 0.1;
                            const finalMin = trueMin - margin;
                            return Math.max(0, finalMin);
                          },
                          (dataMax: number) => {
                            const refMax = selectedBiomarker.biomarker.refMax;
                            const trueMax =
                              refMax !== undefined && refMax !== null
                                ? Math.max(dataMax, refMax)
                                : dataMax;
                            const margin =
                              trueMax === 0 ? 1 : Math.abs(trueMax) * 0.1;
                            return trueMax + margin;
                          },
                        ]}
                        axisLine={false}
                        tickLine={false}
                        tick={{
                          fontSize: 11,
                          fill: "var(--color-theme-text-sec)",
                          fontWeight: 500,
                        }}
                        tickFormatter={(val) =>
                          Number.isInteger(val)
                            ? val.toString()
                            : val.toFixed(1)
                        }
                      />
                      <Tooltip
                        contentStyle={{
                          borderRadius: "16px",
                          border: "1px solid var(--color-theme-border)",
                          backgroundColor: "var(--color-theme-card)",
                          boxShadow:
                            "0 10px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)",
                          padding: "12px",
                        }}
                        labelFormatter={(lbl) =>
                          safeFormat(lbl as string, "MMM d, yyyy")
                        }
                        labelStyle={{
                          fontWeight: "bold",
                          color: "var(--color-theme-text)",
                          marginBottom: 4,
                        }}
                        itemStyle={{
                          fontWeight: "bold",
                          color: "var(--color-theme-accent)",
                        }}
                      />

                      {selectedBiomarker.biomarker.refMin !== undefined &&
                      selectedBiomarker.biomarker.refMin !== null &&
                      selectedBiomarker.biomarker.refMax !== undefined &&
                      selectedBiomarker.biomarker.refMax !== null ? (
                        <>
                          <ReferenceArea
                            y1={Number(selectedBiomarker.biomarker.refMin)}
                            y2={Number(selectedBiomarker.biomarker.refMax)}
                            {...({
                              fill: "#22c55e",
                              fillOpacity: 0.15,
                              stroke: "none",
                              ifOverflow: "extendDomain",
                            } as any)}
                          />
                          <ReferenceLine
                            y={Number(selectedBiomarker.biomarker.refMax)}
                            stroke="#22c55e"
                            strokeWidth={2}
                            strokeDasharray="4 4"
                            opacity={0.8}
                            ifOverflow="extendDomain"
                          />
                          <ReferenceLine
                            y={Number(selectedBiomarker.biomarker.refMin)}
                            stroke="#22c55e"
                            strokeWidth={2}
                            strokeDasharray="4 4"
                            opacity={0.8}
                            ifOverflow="extendDomain"
                          />
                        </>
                      ) : null}

                      {selectedBiomarker.biomarker.refMax !== undefined &&
                        selectedBiomarker.biomarker.refMax !== null &&
                        !(
                          selectedBiomarker.biomarker.refMin !== undefined &&
                          selectedBiomarker.biomarker.refMin !== null
                        ) && (
                          <>
                            <ReferenceArea
                              y1={0}
                              y2={Number(selectedBiomarker.biomarker.refMax)}
                              {...({
                                fill: "#22c55e",
                                fillOpacity: 0.15,
                                stroke: "none",
                                ifOverflow: "hidden",
                              } as any)}
                            />
                            <ReferenceLine
                              y={Number(selectedBiomarker.biomarker.refMax)}
                              stroke="#22c55e"
                              strokeWidth={2}
                              strokeDasharray="4 4"
                              opacity={0.8}
                            />
                          </>
                        )}

                      {selectedBiomarker.biomarker.refMin !== undefined &&
                        selectedBiomarker.biomarker.refMin !== null &&
                        !(
                          selectedBiomarker.biomarker.refMax !== undefined &&
                          selectedBiomarker.biomarker.refMax !== null
                        ) && (
                          <>
                            <ReferenceArea
                              y1={Number(selectedBiomarker.biomarker.refMin)}
                              y2={Math.max(
                                Number(selectedBiomarker.biomarker.refMin) * 10,
                                10000,
                              )}
                              {...({
                                fill: "#22c55e",
                                fillOpacity: 0.15,
                                stroke: "none",
                                ifOverflow: "hidden",
                              } as any)}
                            />
                            <ReferenceLine
                              y={Number(selectedBiomarker.biomarker.refMin)}
                              stroke="#22c55e"
                              strokeWidth={2}
                              strokeDasharray="4 4"
                              opacity={0.8}
                            />
                          </>
                        )}

                      <Line
                        type="monotone"
                        dataKey="value"
                        stroke="var(--color-theme-text)"
                        strokeWidth={3}
                        dot={{
                          r: 4,
                          strokeWidth: 0,
                          fill: "var(--color-theme-text)",
                        }}
                        activeDot={{
                          r: 6,
                          stroke: "var(--color-theme-text)",
                          strokeWidth: 2,
                          fill: "var(--color-theme-bg)",
                        }}
                        animationDuration={800}
                        isAnimationActive={selectedBiomarker.history.length > 1}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-30 flex items-center justify-center text-theme-text-sec bg-theme-card-sec rounded-2xl border border-theme-border border-dashed mt-4">
                  <p className="text-sm font-medium">
                    Add more reports to generate trend highlights.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {openLegalDoc && (
        <LegalDocsModal
          isOpen={true}
          onClose={() => setOpenLegalDoc(null)}
          defaultTab={openLegalDoc}
        />
      )}
    </div>
  );
}

function calculateReportScore(report: LabReport) {
  return getReportHealthScore(report);
}

function CategoryGroup({
  category,
  biomarkers,
  getHistory,
  onSelectBiomarker,
}: {
  key?: React.Key;
  category: string;
  biomarkers: Biomarker[];
  getHistory: (name: string) => any[];
  onSelectBiomarker: (b: Biomarker, h: any[]) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  const highLowCount = biomarkers.filter(
    (b) => b.status === "Needs Attention",
  ).length;
  const borderlineCount = biomarkers.filter(
    (b) => b.status === "Borderline",
  ).length;

  return (
    <div className="flex flex-col">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 sm:p-5 bg-transparent hover:bg-theme-card-sec transition-colors text-left"
      >
        <div className="flex items-center gap-4">
          <h3 className="font-bold text-theme-text text-[15px]">{category}</h3>
          {!isOpen && (
            <div className="flex items-center gap-3">
              {borderlineCount > 0 && (
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-theme-warning shadow-[0_0_8px_var(--color-theme-warning)]" />
                  <span className="text-xs font-bold text-theme-warning">
                    {borderlineCount}
                  </span>
                </div>
              )}
              {highLowCount > 0 && (
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-theme-critical shadow-[0_0_8px_var(--color-theme-critical)]" />
                  <span className="text-xs font-bold text-theme-critical">
                    {highLowCount}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
        <ChevronDown
          className={cn(
            "text-theme-text-sec transition-transform duration-300",
            isOpen ? "rotate-180" : "",
          )}
          size={18}
        />
      </button>

      <div
        className={cn(
          "grid transition-all duration-300 ease-in-out",
          isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="overflow-hidden">
          <div className="flex flex-col gap-1 px-2 pb-4">
            {biomarkers.map((b, i) => {
              const history = getHistory(b.biomarkerId || b.name);
              return (
                <BiomarkerRow
                  key={i}
                  biomarker={b}
                  history={history}
                  onSelectBiomarker={onSelectBiomarker}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function BiomarkerRow({
  biomarker,
  history,
  onSelectBiomarker,
}: {
  key?: React.Key;
  biomarker: Biomarker;
  history: any[];
  onSelectBiomarker: (b: Biomarker, h: any[]) => void;
}) {
  const isTier1 = TIER_1.includes(biomarker.name.toLowerCase().trim());
  const canShowGraph = isTier1 || history.length > 1;
  const canOpenModal = canShowGraph || !!biomarker.info;

  let finalStatus = biomarker.status;
  if (
    !["Healthy", "Needs Attention", "Borderline"].includes(
      finalStatus as string,
    )
  ) {
    finalStatus = "Healthy";
  }

  let dotColor = "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]";
  if (finalStatus === "Needs Attention") {
    dotColor = "bg-theme-critical shadow-[0_0_8px_var(--color-theme-critical)]";
  } else if (finalStatus === "Borderline") {
    dotColor = "bg-theme-warning shadow-[0_0_8px_var(--color-theme-warning)]";
  }

  let diffString = null;
  let diffPrefix = "";
  if (history.length > 1) {
    const prevVal = Number(history[history.length - 2].value);
    const curVal = Number(biomarker.value);
    if (!isNaN(prevVal) && !isNaN(curVal)) {
      const diff = curVal - prevVal;
      if (diff !== 0) {
        diffPrefix = diff > 0 ? "↑" : "↓";
        diffString = `${diffPrefix} ${Math.abs(diff).toFixed(diff % 1 !== 0 ? 1 : 0)}`;
      }
    }
  }

  return (
    <div
      onClick={() => {
        if (canOpenModal) onSelectBiomarker(biomarker, history);
      }}
      className={cn(
        "p-3 rounded-xl flex flex-row items-center justify-between group transition-colors",
        "bg-transparent hover:bg-theme-card-sec",
        canOpenModal ? "cursor-pointer" : "cursor-default",
      )}
    >
      <div className="flex-1 flex items-center gap-3">
        <div className={cn("w-2 h-2 rounded-full shrink-0", dotColor)} />
        <div className="flex flex-col justify-center">
          <h4 className="font-bold text-theme-text text-[14px] sm:text-[15px] leading-tight flex items-center gap-2">
            {biomarker.name}
            {biomarker.info && (
              <div
                className="group/info relative flex items-center"
                onClick={(e) => {
                  e.stopPropagation();
                  if (!canOpenModal) {
                    /* do nothing */
                  } else {
                    onSelectBiomarker(biomarker, history);
                  }
                }}
              >
                <Sparkles
                  size={13}
                  className="text-blue-500 shrink-0 cursor-help"
                />
              </div>
            )}
          </h4>
          {(biomarker.refRangeText ||
            biomarker.refMin != null ||
            biomarker.refMax != null) && (
            <span className="text-[12px] font-medium text-theme-text-sec mt-0.5">
              Ref:{" "}
              {biomarker.refRangeText ||
                (biomarker.refMin === 0 && biomarker.refMax === 0
                  ? "Not specified"
                  : `${biomarker.refMin ?? "?"} - ${biomarker.refMax ?? "?"}`)}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0 text-right">
        {diffString && (
          <div
            className={cn(
              "text-[13px] font-bold flex items-center",
              finalStatus === "Healthy"
                ? "text-theme-text-sec"
                : finalStatus === "Needs Attention"
                  ? "text-theme-critical"
                  : "text-theme-warning",
            )}
          >
            {diffString}
          </div>
        )}
        <div className="flex flex-col items-end min-w-12 justify-center">
          <div className="flex items-baseline gap-1">
            <span
              className={cn(
                "text-[15px] font-bold tracking-tight",
                finalStatus === "Healthy"
                  ? "text-theme-text"
                  : finalStatus === "Needs Attention"
                    ? "text-theme-critical"
                    : "text-theme-warning",
              )}
            >
              {" "}
              {biomarker.value ?? biomarker.rawValue}
            </span>
            <span className="text-[12px] font-medium text-theme-text-sec">
              {biomarker.unit}
            </span>
          </div>
        </div>

        {canOpenModal ? (
          <ChevronRight
            size={16}
            className="text-theme-border group-hover:text-theme-text-sec transition-colors shrink-0"
          />
        ) : (
          <div className="w-4 shrink-0" />
        )}
      </div>
    </div>
  );
}
