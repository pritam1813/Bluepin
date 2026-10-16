import { auth } from "../lib/firebase";
import { friendlyFirebaseError } from "../lib/friendlyFirebaseError";
import React, {
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback,
} from "react";
import { useAppStore } from "../store";
import { UploadCloud, Camera, Loader2, Info, X } from "lucide-react";
import { GlucoseReading, MealTiming } from "../types";
import { v4 as uuidv4 } from "uuid";
import { cn, istTime, istToday, trackEvent } from "../lib/utils";
import {
  ALLOWED_EXTENSIONS,
  CHUNK_SIZE,
  detectMimeType,
  MAX_FILE_SIZE_BYTES,
  readFileAsBase64,
} from "../lib/fileutils";

export interface AddGlucoseModalProps {
  onClose: () => void;
  onAdd: (r: GlucoseReading) => Promise<void>;
}

export function AddGlucoseModal({ onClose, onAdd }: AddGlucoseModalProps) {
  const [val, setVal] = useState("");
  // Separate uploading state per trigger so only the tapped button shows "Analyzing…"
  const [uploadingSource, setUploadingSource] = useState<
    "file" | "camera" | null
  >(null);
  const isUploading = uploadingSource !== null;

  const [isDragging, setIsDragging] = useState(false);
  const [errorObj, setErrorObj] = useState<string | null>(null);
  const [imageUrlData, setImageUrlData] = useState<string | undefined>(
    undefined,
  );
  const [source, setSource] = useState<"Manual" | "OCR">("Manual");
  const [timingSelection, setTimingSelection] = useState<MealTiming | null>(
    null,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { glucoseReadings } = useAppStore();

  // AbortController + mount ref for safe async teardown
  const abortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      abortControllerRef.current?.abort();
    };
  }, []);

  // Touch device detection — suppress drag UI on mobile
  const isTouchDevice = useMemo(
    () =>
      typeof window !== "undefined" &&
      ("ontouchstart" in window || navigator.maxTouchPoints > 0),
    [],
  );

  // ── Drag handlers ──────────────────────────────────────────────────────────

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      await processFile(file, "file");
    } else {
      console.warn(
        "[AddGlucoseModal:handleDrop] Drop event triggered but no file was found in dataTransfer.",
        {
          dataTransferTypes: e.dataTransfer.types,
          filesLength: e.dataTransfer.files?.length,
        },
      );
    }
  }, []);

  // ── File processing ────────────────────────────────────────────────────────

  const processFile = async (file: File, trigger: "file" | "camera") => {
    if (!file) {
      console.error(
        "[AddGlucoseModal:processFile] Called with null or undefined file.",
        {
          trigger,
        },
      );
      return;
    }

    if (file.size === 0) {
      console.error(
        "[AddGlucoseModal:processFile] File validation failed: File is empty (0 bytes).",
        {
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type,
          trigger,
        },
      );
      setErrorObj("The selected file appears to be empty.");
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      console.error(
        "[AddGlucoseModal:processFile] File validation failed: File size exceeds limit.",
        {
          fileName: file.name,
          fileSize: file.size,
          maxSizeBytes: MAX_FILE_SIZE_BYTES,
          trigger,
        },
      );
      setErrorObj("File size exceeds 10 MB. Please upload a smaller file.");
      return;
    }
    const ext = file.name.toLowerCase().split(".").pop() ?? "";
    if (ext && !ALLOWED_EXTENSIONS.includes(ext)) {
      console.error(
        "[AddGlucoseModal:processFile] File validation failed: Unsupported file extension.",
        {
          fileName: file.name,
          extension: ext,
          allowedExtensions: ALLOWED_EXTENSIONS,
          trigger,
        },
      );
      setErrorObj(
        "Invalid file format. Only PDF, PNG, and JPEG files are supported.",
      );
      return;
    }

    setUploadingSource(trigger);
    setErrorObj(null);

    abortControllerRef.current = new AbortController();
    const { signal } = abortControllerRef.current;

    try {
      let base64Str: string;
      try {
        base64Str = await readFileAsBase64(file);
      } catch (readErr: any) {
        console.error(
          "[AddGlucoseModal:processFile] Failed to read file as base64 string:",
          {
            error: readErr,
            message: readErr?.message,
            fileName: file.name,
            fileSize: file.size,
            fileType: file.type,
            trigger,
          },
        );
        throw readErr;
      }

      if (!base64Str || base64Str.length === 0) {
        console.error(
          "[AddGlucoseModal:processFile] Base64 conversion produced an empty payload.",
          {
            fileName: file.name,
            trigger,
          },
        );
        throw new Error("Failed to read image data: file content is empty.");
      }

      const mimeType = detectMimeType(file);
      const totalChunks = Math.ceil(base64Str.length / CHUNK_SIZE);
      const uploadId = uuidv4();
      let data: any = null;

      const currentUser = auth.currentUser;
      if (!currentUser) {
        console.error(
          "[AddGlucoseModal:processFile] Authentication error: User is not authenticated.",
        );
      }
      let token: string | undefined;
      try {
        token = await currentUser?.getIdToken();
        if (!token) {
          console.warn(
            "[AddGlucoseModal:processFile] Auth token is undefined or empty for current user.",
            {
              uid: currentUser?.uid,
            },
          );
        }
      } catch (tokenErr: any) {
        console.error(
          "[AddGlucoseModal:processFile] Failed to retrieve Firebase auth token:",
          {
            error: tokenErr,
            message: tokenErr?.message,
            uid: currentUser?.uid,
          },
        );
        throw new Error("Authentication failed. Please sign in again.");
      }

      for (let i = 0; i < totalChunks; i++) {
        if (signal.aborted) {
          console.warn(
            "[AddGlucoseModal:processFile] Upload aborted before sending chunk:",
            {
              chunkIndex: i,
              totalChunks,
              uploadId,
            },
          );
          throw new DOMException("Upload cancelled.", "AbortError");
        }

        const chunkData = base64Str.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);

        let res: Response;
        try {
          res = await fetch("/api/upload-chunk", {
            method: "POST",
            signal,
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              uploadId,
              chunkIndex: i,
              totalChunks,
              chunkData,
              mimeType,
              type: "glucose",
            }),
          });
        } catch (fetchErr: any) {
          if (fetchErr.name === "AbortError" || signal.aborted) {
            console.warn(
              "[AddGlucoseModal:processFile] Fetch aborted during chunk transfer:",
              {
                chunkIndex: i,
                totalChunks,
                uploadId,
              },
            );
          } else {
            console.error(
              "[AddGlucoseModal:processFile] Network request failed for chunk upload:",
              {
                error: fetchErr,
                message: fetchErr?.message,
                chunkIndex: i,
                totalChunks,
                uploadId,
              },
            );
          }
          throw fetchErr;
        }

        if (!res.ok) {
          const text = await res.text().catch((textErr) => {
            console.error(
              "[AddGlucoseModal:processFile] Failed to read error response body text:",
              {
                status: res.status,
                statusText: res.statusText,
                error: textErr,
              },
            );
            return "";
          });

          let parsed: any;
          try {
            parsed = JSON.parse(text);
          } catch (parseErr) {
            console.warn(
              "[AddGlucoseModal:processFile] Error response body is not valid JSON:",
              {
                status: res.status,
                statusText: res.statusText,
                rawBody: text,
                parseError: parseErr,
              },
            );
          }

          console.error(
            "[AddGlucoseModal:processFile] Chunk upload endpoint returned HTTP error status:",
            {
              status: res.status,
              statusText: res.statusText,
              chunkIndex: i,
              totalChunks,
              uploadId,
              error: parsed?.error,
              details: parsed?.details,
              rawBody: text,
            },
          );

          if (
            parsed?.details?.includes("503") ||
            parsed?.details?.includes("UNAVAILABLE") ||
            parsed?.details?.includes("high demand")
          ) {
            throw new Error(
              "Service is currently experiencing high demand. Please wait a moment and try again.",
            );
          }
          const errDetails =
            typeof parsed?.details === "object"
              ? JSON.stringify(parsed.details)
              : parsed?.details;
          throw new Error(
            parsed?.error || errDetails || text || `HTTP Error ${res.status}`,
          );
        }

        let resData: any;
        try {
          resData = await res.json();
        } catch (jsonErr: any) {
          console.error(
            "[AddGlucoseModal:processFile] Failed to parse successful response as JSON:",
            {
              status: res.status,
              chunkIndex: i,
              totalChunks,
              uploadId,
              error: jsonErr,
            },
          );
          throw new Error("Invalid response format received from server.");
        }

        if (i === totalChunks - 1) data = resData;
      }

      if (!isMountedRef.current) {
        console.warn(
          "[AddGlucoseModal:processFile] Component unmounted before extraction result could be applied.",
          {
            uploadId,
            data,
          },
        );
        return;
      }

      if (data?.success && data.value !== undefined && data.value !== null) {
        const numVal = Number(data.value);
        if (isNaN(numVal)) {
          console.error(
            "[AddGlucoseModal:processFile] Extracted glucose value is not a valid number:",
            {
              rawValue: data.value,
              data,
              uploadId,
            },
          );
          setErrorObj("Extracted reading is not a valid number.");
          return;
        }
        setVal(Math.round(numVal).toString());
        setSource("OCR");
        setImageUrlData("");
      } else {
        console.error(
          "[AddGlucoseModal:processFile] Glucose extraction failed or returned unsuccessful status:",
          {
            success: data?.success,
            value: data?.value,
            errorMsg: data?.errorMsg,
            details: data?.details,
            fullResponse: data,
            uploadId,
            fileName: file.name,
          },
        );
        setErrorObj(data?.errorMsg ?? "Could not extract glucose reading.");
      }
    } catch (err: any) {
      if (!isMountedRef.current) {
        console.warn(
          "[AddGlucoseModal:processFile] Catch block: Component unmounted during failure handling.",
          {
            error: err?.message,
          },
        );
        return;
      }
      if (err.name === "AbortError") {
        console.warn(
          "[AddGlucoseModal:processFile] Extraction process aborted/cancelled.",
          {
            trigger,
            fileName: file.name,
          },
        );
        return;
      }
      console.error(
        "[AddGlucoseModal:processFile] End-to-end extraction pipeline failure:",
        {
          error: err,
          message: err?.message,
          name: err?.name,
          stack: err?.stack,
          fileName: file?.name,
          fileSize: file?.size,
          trigger,
        },
      );
      setErrorObj(friendlyFirebaseError(err, "Failed to process image."));
    } finally {
      if (isMountedRef.current) {
        setUploadingSource(null);
      } else {
        console.warn(
          "[AddGlucoseModal:processFile] Finally block: Component unmounted during cleanup.",
        );
      }
    }
  };

  const handleFileUpload = useCallback(
    async (
      e: React.ChangeEvent<HTMLInputElement>,
      trigger: "file" | "camera",
    ) => {
      const file = e.target.files?.[0];
      if (!file) {
        console.warn(
          `[AddGlucoseModal:handleFileUpload] File input change event triggered with no file for trigger: ${trigger}.`,
        );
        return;
      }
      // Reset so the same file can be re-selected
      e.target.value = "";
      await processFile(file, trigger);
    },
    [],
  );

  // ── Form submit ────────────────────────────────────────────────────────────

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!val || isNaN(Number(val)) || !timingSelection) {
      setErrorObj(
        "Please enter a valid glucose value and select when you performed the test.",
      );
      return;
    }

    const timing = timingSelection;
    // IST, not the device's day — cron compares this `date` against the IST
    // day it fires on, so the two must agree on which calendar day this is.
    const date = istToday();
    const existingReading = glucoseReadings.find(
      (r) => r.date === date && r.timing === timing,
    );

    const reading: GlucoseReading = {
      id: existingReading ? existingReading.id : uuidv4(),
      value: Number(val),
      unit: "mg/dL",
      timing,
      hoursAfterEating:
        timing === "Post-Prandial" ? 2 : timing === "Fasting" ? 8 : 5,
      source,
      imageUrl: imageUrlData,
      date,
      time: istTime(),
      createdAt: existingReading ? existingReading.createdAt : Date.now(),
    };

    setIsSubmitting(true);
    try {
      await onAdd(reading);
      trackEvent("glucose_logged", {
        method: source === "Manual" ? "manual" : "camera_ai",
      });
    } catch (err: any) {
      setErrorObj(friendlyFirebaseError(err, "Failed to add reading"));
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md transition-opacity"
      onDragOver={!isTouchDevice ? handleDragOver : undefined}
      onDragLeave={!isTouchDevice ? handleDragLeave : undefined}
      onDrop={!isTouchDevice ? handleDrop : undefined}
    >
      {isDragging && (
        <div className="absolute inset-0 z-70 bg-theme-accent/20 backdrop-blur-sm flex items-center justify-center p-4 pointer-events-none">
          <div className="bg-theme-card p-8 rounded-3xl shadow-xl flex flex-col items-center max-w-sm w-full text-center border-theme-accent border-dashed border-2">
            <UploadCloud size={64} className="text-theme-accent mb-4" />
            <h3 className="text-xl font-bold text-theme-text mb-2">
              Drop photo here
            </h3>
            <p className="text-theme-text-sec text-sm">
              Release to analyze your glucometer reading automatically.
            </p>
          </div>
        </div>
      )}

      <div
        className={cn(
          "bg-theme-card rounded-4xl w-full max-w-sm shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 transition-all z-10",
          isDragging ? "scale-[0.98] opacity-50" : "",
        )}
      >
        <div className="p-5 sm:p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-2xl font-display font-medium text-theme-text">
              Add Reading
            </h3>
            <button
              id="close-glucose-modal-btn"
              onClick={onClose}
              className="p-2 -mr-2 text-theme-text-sec hover:text-theme-text transition-colors"
            >
              <X size={24} />
            </button>
          </div>

          {errorObj && (
            <div className="mb-4 text-sm text-theme-critical bg-theme-critical/10 p-3 rounded-2xl border border-theme-critical/20 flex items-start gap-2">
              <Info size={16} className="mt-0.5 shrink-0" />
              <div>
                <span>
                  {typeof errorObj === "object"
                    ? JSON.stringify(errorObj)
                    : errorObj}
                </span>
                {(errorObj.includes("Invalid") ||
                  errorObj.includes("size") ||
                  errorObj.includes("type")) && (
                  <p className="text-xs mt-1 opacity-80">
                    Allowed formats: PDF, PNG, JPEG, JPG. Maximum file size: 10
                    MB.
                  </p>
                )}
              </div>
            </div>
          )}

          <div
            className="flex justify-center mb-4 w-full"
            id="add-glucose-modal-content"
            data-tour="add-glucose-modal-content"
          >
            <input
              id="glucose-upload"
              type="file"
              accept="image/png,image/jpeg,image/jpg,application/pdf"
              className="hidden"
              onChange={(e) => handleFileUpload(e, "file")}
              disabled={isUploading}
            />
            <input
              id="glucose-upload-camera"
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => handleFileUpload(e, "camera")}
              disabled={isUploading}
            />
            <div className="flex w-full gap-2">
              <label
                htmlFor="glucose-upload"
                className={cn(
                  "w-full flex flex-col items-center justify-center gap-2 py-4 px-3 rounded-2xl border-2 border-dashed border-theme-accent/30 bg-theme-accent/5 hover:bg-theme-accent/10 hover:border-theme-accent/50 transition-colors text-theme-accent cursor-pointer",
                  isUploading && "opacity-50 cursor-not-allowed",
                )}
              >
                {uploadingSource === "file" ? (
                  <Loader2
                    className="animate-spin text-theme-accent"
                    size={24}
                  />
                ) : (
                  <UploadCloud size={24} />
                )}
                <span className="font-bold text-sm text-center">
                  {uploadingSource === "file"
                    ? "Analyzing..."
                    : "Upload Reading"}
                </span>
              </label>
              <label
                htmlFor="glucose-upload-camera"
                className={cn(
                  "w-full flex flex-col items-center justify-center gap-2 py-4 px-3 rounded-2xl border-2 border-dashed border-theme-accent/30 bg-theme-accent/5 hover:bg-theme-accent/10 hover:border-theme-accent/50 transition-colors text-theme-accent cursor-pointer",
                  isUploading && "opacity-50 cursor-not-allowed",
                )}
              >
                {uploadingSource === "camera" ? (
                  <Loader2
                    className="animate-spin text-theme-accent"
                    size={24}
                  />
                ) : (
                  <Camera size={24} />
                )}
                <span className="font-bold text-sm text-center">
                  {uploadingSource === "camera" ? "Analyzing..." : "Take Photo"}
                </span>
              </label>
            </div>
          </div>

          <div className="flex items-center gap-4 mb-4">
            <div className="h-px bg-theme-border flex-1"></div>
            <span className="text-xs font-bold text-theme-text-sec">
              or manual entry
            </span>
            <div className="h-px bg-theme-border flex-1"></div>
          </div>

          <form onSubmit={handleManualSubmit} className="space-y-4">
            <div id="add-glucose-manual-entry">
              <label className="block text-sm font-bold text-theme-text mb-2">
                Blood Glucose (mg/dL)
              </label>
              <input
                type="number"
                min="0"
                max="1000"
                value={val}
                onChange={(e) => {
                  setVal(e.target.value);
                  if (source !== "Manual") setSource("Manual");
                }}
                autoFocus
                required
                className="w-full text-2xl px-4 py-3 bg-theme-bg border border-theme-border rounded-2xl focus:ring-2 focus:ring-theme-accent focus:border-theme-accent outline-none transition-all font-black text-center tracking-tight"
                placeholder="0"
              />
            </div>

            <div className="mt-6">
              <div className="mb-4">
                <label className="block text-sm font-bold text-theme-text leading-tight">
                  Meal Timing
                </label>
                <p className="text-[13px] text-theme-text-sec mt-1">
                  Relative to your most recent meal.
                </p>
              </div>

              <div className="flex flex-col gap-4">
                {(
                  [
                    { label: "Less than 2 hours", value: "Post-Prandial" },
                    { label: "2–8 hours", value: "Random" },
                    { label: "More than 8 hours", value: "Fasting" },
                  ] as const
                ).map(({ label, value }) => (
                  <label
                    key={value}
                    className="flex items-center gap-3 cursor-pointer group"
                  >
                    <div className="relative flex items-center justify-center w-5 h-5 shrink-0">
                      <input
                        type="radio"
                        name="timing"
                        className="peer sr-only"
                        checked={timingSelection === value}
                        onChange={() => setTimingSelection(value)}
                      />
                      <div className="w-5 h-5 border-2 border-theme-border rounded-full peer-checked:border-theme-text peer-checked:bg-theme-text transition-colors" />
                      <div className="absolute w-2 h-2 bg-theme-bg rounded-full scale-0 peer-checked:scale-100 transition-transform" />
                    </div>
                    <span className="text-[14px] font-medium text-theme-text group-hover:opacity-80 transition-opacity">
                      {label}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 px-4 bg-theme-card-sec border border-theme-border text-theme-text rounded-xl font-bold hover:bg-theme-border transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!val || isSubmitting}
                className="flex-1 py-3 px-4 bg-linear-to-r from-theme-accent to-theme-accent/80 text-white rounded-xl font-bold hover:opacity-90 transition-colors shadow-lg shadow-theme-accent/20 disabled:opacity-50"
              >
                {isSubmitting ? "Saving..." : "Save"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
