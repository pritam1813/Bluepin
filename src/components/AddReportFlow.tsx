import { useState, useRef, useEffect } from "react";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import {
  UploadCloud,
  Loader2,
  X,
  File as FileIcon,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { auth, storage } from "../lib/firebase";
import { friendlyFirebaseError } from "../lib/friendlyFirebaseError";
import { useAppStore } from "../store";
import { LabReport } from "../types";
import { cn, trackEvent } from "../lib/utils";
import { DnaLoader } from "./DnaLoader";
import { generateId } from "@/server/utils/generateId";
import { LegalDocsModal } from "./LegalDocsModal";
import { LegalDocType } from "../lib/consentManager";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_EXTS = ["pdf", "png", "jpg", "jpeg"];
const CORE_BIOMARKERS = [
  "Hemoglobin",
  "Total Cholesterol",
  "Vitamin D",
  "Glucose",
  "Creatinine",
  "White Blood Cells",
];

export function AddReportFlow({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const { labReports } = useAppStore();

  const [file, setFile] = useState<File | null>(null);
  const [reportName, setReportName] = useState("");
  const [reportDate, setReportDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [openLegalDoc, setOpenLegalDoc] = useState<LegalDocType | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Uploading file...");
  const [completedCount, setCompletedCount] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<LabReport | null>(
    null,
  );

  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const validateFile = (f: File): string | null => {
    if (f.size === 0) return "The selected file appears to be empty.";
    if (f.size > MAX_FILE_SIZE)
      return "File size exceeds 10MB limit. Please upload a smaller file.";
    const ext = f.name.toLowerCase().split(".").pop() || "";
    if (!ALLOWED_EXTS.includes(ext)) {
      return "Invalid file format. Only PDF, PNG, and JPEG files are supported.";
    }
    return null;
  };

  const handleSelectFile = (f: File) => {
    const err = validateFile(f);
    if (err) {
      setErrorMsg(err);
      setFile(null);
      return;
    }
    setErrorMsg(null);
    setFile(f);
    if (!reportName.trim()) {
      setReportName(f.name.replace(/\.[^/.]+$/, ""));
    }
  };

  const processFile = async (force = false) => {
    if (!file || !reportName.trim() || !reportDate) return;

    const validationError = validateFile(file);
    if (validationError) {
      setErrorMsg(validationError);
      return;
    }

    // Check for duplicate report in store
    if (!force) {
      const existing = labReports.find(
        (r) =>
          r.name?.trim().toLowerCase() === reportName.trim().toLowerCase() &&
          r.date === reportDate,
      );
      if (existing) {
        setDuplicateWarning(existing);
        return;
      }
    }

    const uid = auth.currentUser?.uid;
    if (!uid) {
      setErrorMsg("Please sign in to upload health reports.");
      return;
    }

    setDuplicateWarning(null);
    setIsUploading(true);
    setErrorMsg(null);
    setStatusMessage("Uploading to secure storage...");
    setCompletedCount(0);

    abortRef.current = new AbortController();
    const { signal } = abortRef.current;

    let ticker: ReturnType<typeof setInterval> | null = null;

    try {
      // Generate a stable ID for this report upfront — it travels with both
      // the Storage path and the API request, enabling server-side idempotency.
      const reportId = generateId();

      // 1. Client → Firebase Storage (binary)
      const fileRef = ref(
        storage,
        `users/${uid}/labReports/${reportId}_${file.name}`,
      );
      await uploadBytes(fileRef, file);
      const downloadUrl = await getDownloadURL(fileRef);

      if (signal.aborted)
        throw new DOMException("Upload cancelled.", "AbortError");

      // 2. Client → API server (pass download URL)
      setStatusMessage("Analyzing medical document with AI...");
      ticker = setInterval(() => {
        setCompletedCount((prev) => Math.min(prev + 1, CORE_BIOMARKERS.length));
      }, 1200);

      const token = await auth.currentUser?.getIdToken();
      const mimeType =
        file.type ||
        (file.name.toLowerCase().endsWith(".pdf")
          ? "application/pdf"
          : "image/png");

      const res = await fetch("/api/analyze-report", {
        method: "POST",
        signal,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fileUrl: downloadUrl,
          mimeType,
          reportId,
          reportName: reportName.trim(),
          reportDate,
        }),
      });

      if (ticker) clearInterval(ticker);

      let data: any = null;
      try {
        const text = await res.text();
        data = text ? JSON.parse(text) : {};
      } catch {
        if (res.status === 503) {
          throw new Error("AI analysis service is temporarily busy. Please try again in a few moments.");
        }
        throw new Error(`Server returned status ${res.status}. Please try again.`);
      }

      if (!res.ok) {
        throw new Error(data?.error || `Failed to analyze document (status ${res.status}).`);
      }

      // 3. Server wrote to Firestore — the onSnapshot listener in store.tsx
      //    delivers the report automatically. Just close the modal.
      if (data?.success && Array.isArray(data.biomarkers) && data.biomarkers.length > 0) {
        trackEvent('report_uploaded', { fileType: file.type });
        onSuccess ? onSuccess() : onClose();
      } else {
        setErrorMsg(
          data?.errorMsg ||
            data?.error ||
            "Could not extract any lab results from this file.",
        );
      }
    } catch (err: any) {
      if (err.name === "AbortError") return;
      setErrorMsg(friendlyFirebaseError(err, "Failed to upload and process document."));
    } finally {
      if (ticker) clearInterval(ticker);
      setIsUploading(false);
    }
  };

  const isFormComplete = Boolean(file && reportName.trim() && reportDate);

  return (
    <div className="fixed inset-0 z-60 bg-theme-text/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-theme-card max-w-md w-full rounded-4xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
        {duplicateWarning ? (
          <div className="p-8 text-center min-h-75 flex flex-col items-center justify-center relative">
            <button
              onClick={() => setDuplicateWarning(null)}
              className="absolute top-4 right-4 p-2 text-theme-text-sec hover:text-theme-text transition-colors"
            >
              <X size={24} />
            </button>
            <div className="w-14 h-14 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center mb-4">
              <AlertCircle size={32} />
            </div>
            <h3 className="text-xl font-bold text-theme-text mb-2">
              Report Already Exists
            </h3>
            <p className="text-theme-text-sec text-sm mb-6 max-w-xs">
              A report named{" "}
              <span className="font-semibold text-theme-text">
                {duplicateWarning.name}
              </span>{" "}
              for{" "}
              <span className="font-semibold text-theme-text">
                {duplicateWarning.date}
              </span>{" "}
              is already in your records.
            </p>
            <div className="flex gap-3 w-full">
              <button
                onClick={() => setDuplicateWarning(null)}
                className="flex-1 py-3 border border-theme-border text-theme-text font-bold rounded-xl hover:bg-theme-card-sec transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => processFile(true)}
                className="flex-1 py-3 bg-theme-accent text-white font-bold rounded-xl hover:bg-theme-accent/90 shadow-md shadow-theme-accent/20 transition-all"
              >
                Save Anyway
              </button>
            </div>
          </div>
        ) : isUploading ? (
          <div className="p-8 flex flex-col items-center justify-center min-h-87.5 relative">
            <DnaLoader className="mb-8 scale-110" />
            <h3 className="text-[22px] font-bold text-theme-text mb-2 text-center">
              Processing Health Report
            </h3>
            <p className="text-theme-text-sec text-sm mb-6 text-center">
              {statusMessage}
            </p>
            <div className="w-full max-w-60 space-y-3 mt-2">
              {CORE_BIOMARKERS.map((name, idx) => {
                const isDone = idx < completedCount;
                return (
                  <div
                    key={name}
                    className="flex items-center justify-between text-sm animate-in fade-in slide-in-from-bottom-2 duration-500"
                  >
                    <span
                      className={
                        isDone
                          ? "text-theme-text font-medium"
                          : "text-theme-text-sec"
                      }
                    >
                      {name}
                    </span>
                    {isDone ? (
                      <CheckCircle2
                        size={16}
                        className="text-emerald-500 animate-in zoom-in duration-300"
                      />
                    ) : (
                      <div className="w-4 h-4 rounded-full border-2 border-theme-border/50 animate-pulse" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : errorMsg ? (
          <div className="p-8 text-center min-h-75 flex flex-col items-center justify-center relative">
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 text-theme-text-sec hover:text-theme-text transition-colors"
            >
              <X size={24} />
            </button>
            <h3 className="text-xl font-bold text-theme-text mb-2">
              Upload Failed
            </h3>
            <p className="text-theme-text-sec text-sm mb-2">{errorMsg}</p>
            <p className="text-theme-text-sec text-xs mb-6">
              Allowed formats: PDF, PNG, JPEG, JPG.
              <br />
              Maximum file size: 10 MB.
            </p>
            <button
              onClick={() => setErrorMsg(null)}
              className="w-full py-3 bg-theme-accent text-white font-bold rounded-xl"
            >
              Try Again
            </button>
          </div>
        ) : (
          <div className="p-6 sm:p-8">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-[22px] font-display font-medium text-theme-text">
                Add Health Report
              </h3>
              <button
                onClick={onClose}
                className="p-2 -mr-2 text-theme-text-sec hover:text-theme-text transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            <div className="space-y-5">
              {/* File Dropzone */}
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleSelectFile(f);
                    e.target.value = "";
                  }}
                />
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    const f = e.dataTransfer.files?.[0];
                    if (f) handleSelectFile(f);
                  }}
                  className={cn(
                    "w-full h-32 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-colors text-center px-4",
                    isDragging
                      ? "border-theme-accent bg-theme-accent/5"
                      : file
                        ? "border-emerald-500/50 bg-emerald-500/5 dark:bg-emerald-500/10"
                        : "border-theme-border/60 hover:bg-theme-card-sec/50 bg-theme-card-sec",
                  )}
                >
                  {file ? (
                    <>
                      <FileIcon size={32} className="text-emerald-500 mb-2" />
                      <span className="text-sm font-medium text-theme-text truncate w-full max-w-50">
                        {file.name}
                      </span>
                      <span className="text-xs text-theme-text-sec mt-0.5">
                        Click to change file
                      </span>
                    </>
                  ) : (
                    <>
                      <UploadCloud
                        size={32}
                        className="text-theme-text-sec mb-2"
                      />
                      <span className="text-sm font-medium text-theme-text">
                        Upload file here
                      </span>
                      <span className="text-xs text-theme-text-sec mt-0.5">
                        Drag & drop or tap to choose PDF / Image
                      </span>
                      <span className="mt-3 px-6 py-2 bg-theme-accent text-white text-sm font-semibold rounded-xl hover:bg-theme-accent/90 shadow-md shadow-theme-accent/20 transition-all">
                        Browse Files
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Report Name */}
              <div>
                <label className="block text-xs font-bold text-theme-text-sec mb-1.5 ml-1 uppercase tracking-wider">
                  Lab / Report Name
                </label>
                <input
                  type="text"
                  value={reportName}
                  onChange={(e) => setReportName(e.target.value)}
                  className="w-full bg-theme-bg border border-theme-border text-theme-text text-base px-4 py-3 rounded-xl focus:ring-2 focus:ring-theme-accent outline-none"
                  placeholder="e.g. Full Body Checkup"
                />
              </div>

              {/* Report Date */}
              <div>
                <label className="block text-xs font-bold text-theme-text-sec mb-1.5 ml-1 uppercase tracking-wider">
                  Report Date
                </label>
                <input
                  type="date"
                  value={reportDate}
                  onChange={(e) => setReportDate(e.target.value)}
                  className="w-full bg-theme-bg border border-theme-border text-theme-text text-base px-4 py-3 rounded-xl focus:ring-2 focus:ring-theme-accent outline-none"
                />
              </div>
            </div>

            <div className="mt-8 space-y-4">
              <div className="bg-theme-bg p-3 rounded-lg border border-theme-border/50">
                <p className="text-[11px] text-theme-text-sec leading-relaxed text-center">
                  By uploading this report, you confirm that you have the right to upload it and consent to its processing per our{" "}
                  <button
                    type="button"
                    onClick={() => setOpenLegalDoc("health-consent")}
                    className="text-theme-accent hover:underline font-medium cursor-pointer"
                  >
                    Health Data Consent
                  </button>
                  {", "}
                  <button
                    type="button"
                    onClick={() => setOpenLegalDoc("privacy")}
                    className="text-theme-accent hover:underline font-medium cursor-pointer"
                  >
                    Privacy Policy
                  </button>
                  {" & "}
                  <button
                    type="button"
                    onClick={() => setOpenLegalDoc("ai-disclaimer")}
                    className="text-theme-accent hover:underline font-medium cursor-pointer"
                  >
                    AI Disclaimer
                  </button>
                  .
                </p>
              </div>
              <button
                onClick={() => processFile()}
                disabled={!isFormComplete || isUploading}
                className="w-full py-4 bg-linear-to-r from-theme-accent to-theme-accent/80 disabled:opacity-50 disabled:from-theme-border disabled:to-theme-border text-white font-bold rounded-xl transition-all shadow-lg shadow-theme-accent/20 active:scale-[0.98] flex justify-center items-center gap-2"
              >
                {isUploading ? (
                  <Loader2 className="animate-spin" size={20} />
                ) : (
                  "Confirm"
                )}
              </button>
            </div>
          </div>
        )}
      </div>

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
