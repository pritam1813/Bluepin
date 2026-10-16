import React, { useState, useEffect, useRef } from "react";
import {
  X,
  MessageSquare,
  Copy,
  Check,
  ExternalLink,
  CheckCircle2,
  Unlink,
  AlertCircle,
  ArrowLeft,
  Loader2,
  RotateCw,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Bell,
  BellOff,
  Clock,
} from "lucide-react";
import { auth } from "../lib/firebase";
import { friendlyFirebaseError } from "../lib/friendlyFirebaseError";
import { useAppStore } from "../store";
import { cn } from "../lib/utils";
import { WhatsAppIcon } from "./CustomEmojis";
import type { Reminder, ReminderSlot } from "../types";

interface WhatsAppModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface RemindersResponse {
  linked: boolean;
  reminder: Reminder | null;
  slots: ReminderSlot[];
}

export function WhatsAppModal({ isOpen, onClose }: WhatsAppModalProps) {
  const { profile, updateProfile } = useAppStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkedPhone, setLinkedPhone] = useState<string | null>(
    profile.whatsappPhone || null,
  );

  // In-App OTP linking states
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [countryCode] = useState("+91");
  const [otpDigits, setOtpDigits] = useState<string[]>([
    "",
    "",
    "",
    "",
    "",
    "",
  ]);
  const [resendTimer, setResendTimer] = useState<number>(30);
  const [canResend, setCanResend] = useState<boolean>(false);
  const [isResending, setIsResending] = useState<boolean>(false);
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Fallback bot code states
  const [showManualCode, setShowManualCode] = useState(true);
  const [code, setCode] = useState<string | null>(null);
  const [expiresIn, setExpiresIn] = useState<number>(600);
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const [botPhone, setBotPhone] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Daily glucose reminder. Lives in whatsapp_reminders/{phone}, which the
  // client SDK cannot reach, so all of it goes through /api/reminders.
  const [slots, setSlots] = useState<ReminderSlot[]>([]);
  const [reminder, setReminder] = useState<Reminder | null>(null);
  const [pendingHour, setPendingHour] = useState<number | null>(null);
  const [reminderLoading, setReminderLoading] = useState(false);
  const [reminderError, setReminderError] = useState<string | null>(null);

  // Sync state if profile updates
  useEffect(() => {
    if (profile.whatsappPhone) {
      setLinkedPhone(profile.whatsappPhone);
    }
  }, [profile.whatsappPhone]);

  /**
   * Loads the reminder state whenever the modal opens, so the picker always
   * reflects the current stored value — including one last set from WhatsApp.
   */
  const fetchReminder = async () => {
    setReminderLoading(true);
    setReminderError(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;

      const res = await fetch("/api/reminders", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;

      const data: RemindersResponse = await res.json();
      setSlots(Array.isArray(data.slots) ? data.slots : []);
      setReminder(data.reminder ?? null);
      setPendingHour(null);
    } catch (err: any) {
      setReminderError(
        err?.message || "Could not load your reminder settings.",
      );
    } finally {
      setReminderLoading(false);
    }
  };

  // Check linking status on open
  const checkStatus = async () => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;

      const res = await fetch("/api/whatsapp/status", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.linked) {
          setLinkedPhone(data.phone);
          if (data.phone !== profile.whatsappPhone) {
            updateProfile({ whatsappPhone: data.phone });
          }
        } else {
          setLinkedPhone(null);
        }
        if (data.botPhone) {
          setBotPhone(data.botPhone);
        }
      }
    } catch {
      // Ignore background check error
    }
  };

  useEffect(() => {
    if (isOpen) {
      checkStatus();
      fetchReminder();
      setError(null);
      setStep("phone");
      setOtpDigits(["", "", "", "", "", ""]);
    }
  }, [isOpen]);

  // Resend countdown timer for in-app OTP
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (step === "otp" && resendTimer > 0) {
      timer = setTimeout(() => {
        setResendTimer((prev) => prev - 1);
      }, 1000);
    } else if (step === "otp" && resendTimer === 0) {
      setCanResend(true);
    }
    return () => clearTimeout(timer);
  }, [step, resendTimer]);

  // Focus first OTP input when entering OTP step
  useEffect(() => {
    if (step === "otp") {
      setResendTimer(30);
      setCanResend(false);
      setIsResending(false);
      setOtpDigits(["", "", "", "", "", ""]);
      setTimeout(() => {
        otpInputRefs.current[0]?.focus();
      }, 150);
    }
  }, [step]);

  // Countdown timer for fallback link code
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    if (code && expiresIn > 0 && !linkedPhone) {
      timer = setInterval(() => {
        setExpiresIn((prev) => {
          if (prev <= 1) {
            setCode(null);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [code, expiresIn, linkedPhone]);

  // ─── 1. Send OTP to WhatsApp Phone ──────────────────────────────────────────
  const handleSendOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanNumber = phoneNumber.replace(/\D/g, "");
    if (cleanNumber.length < 10) return;

    setLoading(true);
    setError(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("You must be signed in.");

      const fullNumber = `${countryCode}${cleanNumber}`;
      const res = await fetch("/api/whatsapp/link/send-otp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ phone: fullNumber }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          data.error || "Failed to send WhatsApp verification code.",
        );
      }

      setStep("otp");
    } catch (err: any) {
      setError(friendlyFirebaseError(err, "Could not send verification code."));
    } finally {
      setLoading(false);
    }
  };

  // ─── 2. Verify OTP and Link Account ─────────────────────────────────────────
  const handleVerifyOtp = async (codeToVerify?: string) => {
    const otpValue = codeToVerify || otpDigits.join("");
    if (otpValue.length < 6) return;

    setLoading(true);
    setError(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("You must be signed in.");

      const cleanNumber = phoneNumber.replace(/\D/g, "");
      const fullNumber = `${countryCode}${cleanNumber}`;

      const res = await fetch("/api/whatsapp/link/verify-otp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ phone: fullNumber, otp: otpValue }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to verify code.");
      }

      setLinkedPhone(data.phone || cleanNumber);
      updateProfile({ whatsappPhone: data.phone || cleanNumber });
      setStep("phone");
    } catch (err: any) {
      setError(friendlyFirebaseError(err, "Invalid verification code."));
    } finally {
      setLoading(false);
    }
  };

  // ─── OTP Input Controls ──────────────────────────────────────────────────────
  const handleOtpChange = (index: number, val: string) => {
    const digit = val.replace(/\D/g, "").slice(-1);
    const newDigits = [...otpDigits];
    newDigits[index] = digit;
    setOtpDigits(newDigits);

    if (digit && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }

    if (digit && index === 5 && newDigits.every((d) => d.length === 1)) {
      handleVerifyOtp(newDigits.join(""));
    }
  };

  const handleOtpKeyDown = (
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.key === "Backspace" && !otpDigits[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, 6);
    if (!pasted) return;

    const newDigits = [...otpDigits];
    for (let i = 0; i < pasted.length; i++) {
      newDigits[i] = pasted[i];
    }
    setOtpDigits(newDigits);

    if (pasted.length === 6) {
      handleVerifyOtp(pasted);
    } else {
      otpInputRefs.current[pasted.length]?.focus();
    }
  };

  const handleResend = async () => {
    if (!canResend || isResending) return;
    setIsResending(true);
    setError(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("You must be signed in.");

      const cleanNumber = phoneNumber.replace(/\D/g, "");
      const fullNumber = `${countryCode}${cleanNumber}`;

      const res = await fetch("/api/whatsapp/link/send-otp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ phone: fullNumber }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to resend code.");
      }

      setResendTimer(30);
      setCanResend(false);
      setOtpDigits(["", "", "", "", "", ""]);
      setTimeout(() => {
        otpInputRefs.current[0]?.focus();
      }, 100);
    } catch (err: any) {
      setError(friendlyFirebaseError(err, "Could not resend code."));
    } finally {
      setIsResending(false);
    }
  };

  // ─── 3. Unlink Account ────────────────────────────────────────────────────────
  const handleUnlink = async () => {
    if (!confirm("Are you sure you want to disconnect WhatsApp from Bluepin?"))
      return;
    setLoading(true);
    setError(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("You must be signed in.");

      const res = await fetch("/api/whatsapp/unlink", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setLinkedPhone(null);
        setCode(null);
        setStep("phone");
        setPhoneNumber("");
        // Unlinking deletes the reminder server-side, so clear local state too.
        setReminder(null);
        setPendingHour(null);
        updateProfile({ whatsappPhone: undefined });
      }
    } catch (err: any) {
      setError(friendlyFirebaseError(err, "Failed to unlink account."));
    } finally {
      setLoading(false);
    }
  };

  // ─── 3b. Daily Reminder: Save / Stop ──────────────────────────────────────────
  const handleSaveReminder = async () => {
    if (pendingHour === null) return;
    setReminderLoading(true);
    setReminderError(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("You must be signed in.");

      const res = await fetch("/api/reminders", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ hour: pendingHour }),
      });

      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error || "Failed to save your reminder.");

      setReminder(data.reminder ?? null);
      setPendingHour(null);
    } catch (err: any) {
      setReminderError(friendlyFirebaseError(err, "Failed to save your reminder."));
    } finally {
      setReminderLoading(false);
    }
  };

  const handleStopReminder = async () => {
    setReminderLoading(true);
    setReminderError(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("You must be signed in.");

      const res = await fetch("/api/reminders/stop", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error || "Failed to stop your reminder.");

      setReminder(data.reminder ?? null);
      setPendingHour(null);
    } catch (err: any) {
      setReminderError(friendlyFirebaseError(err, "Failed to stop your reminder."));
    } finally {
      setReminderLoading(false);
    }
  };

  // ─── 4. Fallback Bot Code Generator ──────────────────────────────────────────
  const generateLinkCode = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("You must be signed in.");

      const res = await fetch("/api/whatsapp/link-code", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to generate link code.");
      }

      setCode(data.code);
      setExpiresIn(data.expiresIn || 600);
      setDeepLink(data.deepLink);
      setBotPhone(data.botPhone);
    } catch (err: any) {
      setError(friendlyFirebaseError(err, "Could not create link code."));
    } finally {
      setLoading(false);
    }
  };

  const copyCode = () => {
    if (!code) return;
    navigator.clipboard.writeText(`LINK ${code}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-110 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm transition-opacity animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 relative border border-neutral-100 flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-100 bg-neutral-50/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-sm">
              {/* <MessageSquare size={16} /> */}
              <WhatsAppIcon className="size-4.5" />
            </div>
            <div>
              <h3 className="text-[15px] font-bold text-neutral-900 leading-tight">
                WhatsApp Sync
              </h3>
              <p className="text-[11px] text-neutral-500">
                Log glucose & reports directly from WhatsApp
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-700 transition-colors p-1.5 rounded-full hover:bg-neutral-100 cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto custom-scrollbar flex flex-col gap-4">
          {error && (
            <div className="bg-red-50 text-red-600 text-xs p-3 rounded-xl flex items-center gap-2 border border-red-100">
              <AlertCircle size={15} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {reminderError && (
            <div className="bg-red-50 text-red-600 text-xs p-3 rounded-xl flex items-center gap-2 border border-red-100">
              <AlertCircle size={15} className="shrink-0" />
              <span>{reminderError}</span>
            </div>
          )}

          {linkedPhone ? (
            /* Connected State */
            <div className="flex flex-col gap-4">
              <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-blue-50 text-[#1A73E8] border border-blue-200 flex items-center justify-center shrink-0 shadow-sm">
                    <CheckCircle2 size={20} />
                  </div>
                  <div>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-[#1A73E8]">
                      Connected
                    </span>
                    <p className="text-[14px] font-bold text-neutral-900">
                      {linkedPhone}
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleUnlink}
                  disabled={loading}
                  className="text-neutral-500 hover:text-red-600 text-xs font-semibold py-1.5 px-3 rounded-lg border border-neutral-200 hover:border-red-200 hover:bg-red-50 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Unlink size={13} />
                  Disconnect
                </button>
              </div>

              {/* Daily Reminder */}
              <div className="bg-theme-card border border-theme-border/60 rounded-2xl p-4 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div
                      className={cn(
                        "w-9 h-9 rounded-full border flex items-center justify-center shrink-0 shadow-sm",
                        reminder?.enabled
                          ? "bg-theme-accent/10 border-theme-accent/25 text-theme-accent"
                          : "bg-theme-card-sec border-theme-border text-theme-text-sec",
                      )}
                    >
                      {reminder?.enabled ? (
                        <Bell size={17} />
                      ) : (
                        <BellOff size={17} />
                      )}
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-[13px] font-bold text-theme-text leading-tight">
                        Daily Glucose Reminder
                      </h4>
                      <p className="text-[11px] text-theme-text-sec leading-snug mt-0.5">
                        {reminderLoading && !reminder ? (
                          "Loading reminder..."
                        ) : reminder?.enabled ? (
                          <>
                            On — we&apos;ll nudge you at{" "}
                            <span className="font-semibold text-theme-text">
                              {reminder.displayTime}
                            </span>{" "}
                            if you haven&apos;t logged.
                          </>
                        ) : (
                          "Off — pick a time below to switch it on."
                        )}
                      </p>
                    </div>
                  </div>
                </div>

                {slots.length > 0 && (
                  <>
                    <div className="flex items-center gap-1.5 text-theme-text-sec">
                      <Clock size={12} />
                      <span className="text-[11px] font-semibold">
                        Reminder time — IST (India)
                      </span>
                    </div>

                    {/* A select rather than 19 chips: a wrapping grid spent
                        ~145px giving every hour equal weight, and a horizontal
                        rail hid most options behind a swipe. This stays one
                        line tall, exposes the whole range on tap, and inherits
                        native keyboard and screen-reader behaviour. */}
                    <div className="relative">
                      <select
                        value={
                          pendingHour ??
                          (reminder?.enabled ? reminder.hour : "")
                        }
                        onChange={(e) => {
                          const next = e.target.value;
                          if (next === "") return;
                          setPendingHour(Number(next));
                        }}
                        disabled={reminderLoading}
                        aria-label="Reminder time in IST"
                        className={cn(
                          "w-full appearance-none bg-theme-card text-[12px] font-semibold py-2.5 pl-3 pr-9 rounded-xl border transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed",
                          pendingHour !== null && pendingHour !== reminder?.hour
                            ? "border-theme-accent ring-1 ring-theme-accent"
                            : "border-theme-border",
                          "text-theme-text focus:outline-none focus:ring-1 focus:ring-theme-accent",
                        )}
                      >
                        <option
                          value=""
                          className="bg-theme-card text-theme-text-sec"
                        >
                          Choose a time…
                        </option>
                        {slots.map((slot) => (
                          <option
                            key={slot.hour}
                            value={slot.hour}
                            className="bg-theme-card text-theme-text"
                          >
                            {slot.display}
                          </option>
                        ))}
                      </select>
                      <ChevronDown
                        size={15}
                        className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-theme-text-sec"
                      />
                    </div>
                  </>
                )}

                <div className="flex items-center gap-2 pt-0.5">
                  {pendingHour !== null && (
                    <button
                      onClick={handleSaveReminder}
                      disabled={reminderLoading}
                      className="flex-1 py-2.5 px-4 rounded-xl bg-theme-accent hover:bg-theme-accent/90 text-white text-[12px] font-semibold transition-all flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {reminderLoading ? (
                        <>
                          <Loader2 size={13} className="animate-spin" />
                          <span>Saving...</span>
                        </>
                      ) : (
                        <>
                          <Bell size={13} />
                          <span>Save reminder</span>
                        </>
                      )}
                    </button>
                  )}

                  {reminder && (
                    <button
                      onClick={
                        reminder.enabled ? handleStopReminder : undefined
                      }
                      disabled={reminderLoading || !reminder.enabled}
                      title={
                        reminder.enabled
                          ? "Stop this reminder"
                          : "Pick a time above to turn it back on"
                      }
                      className={cn(
                        "flex items-center justify-center gap-1.5 rounded-xl text-[12px] font-semibold transition-all border disabled:cursor-not-allowed",
                        reminder.enabled
                          ? "py-2.5 px-4 border-theme-border bg-theme-card-sec text-theme-text-sec hover:text-theme-critical hover:border-theme-critical/40 hover:bg-theme-critical/10"
                          : "py-2.5 px-4 border-theme-border bg-theme-card-sec text-theme-text-sec/50",
                      )}
                    >
                      {reminderLoading && reminder.enabled ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <BellOff size={13} />
                      )}
                      <span>Stop</span>
                    </button>
                  )}
                </div>
              </div>

              </div>
          ) : (
            /* Unconnected State: In-App OTP Flow */
            <div className="flex flex-col gap-4">
              <div className="text-xs text-neutral-600 leading-relaxed">
                Connect your WhatsApp account to log blood sugar readings, send
                meter photos, and analyse lab reports instantly via WhatsApp.
              </div>

              <div className="hidden">
                {step === "phone" ? (
                  /* Step 1: Enter Phone Number */
                  <form onSubmit={handleSendOtp} className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-neutral-800 mb-1.5">
                        WhatsApp Mobile Number
                      </label>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5 px-3 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-neutral-800 text-sm font-semibold select-none">
                          <span>🇮🇳</span>
                          <span>{countryCode}</span>
                        </div>
                        <input
                          type="tel"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          autoComplete="tel"
                          required
                          autoFocus
                          placeholder="Enter 10-digit number"
                          value={phoneNumber}
                          onChange={(e) => {
                            const cleaned = e.target.value
                              .replace(/\D/g, "")
                              .slice(0, 10);
                            setPhoneNumber(cleaned);
                          }}
                          className="flex-1 px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1A73E8] text-neutral-900 placeholder:text-neutral-400 text-[15px]"
                        />
                      </div>
                      <p className="text-[11px] text-neutral-500 mt-1.5 flex items-center gap-1.5 pl-2">
                        <span>
                          We'll send a 6-digit verification code to your
                          WhatsApp.
                        </span>
                      </p>
                    </div>

                    <button
                      type="submit"
                      disabled={
                        loading || phoneNumber.replace(/\D/g, "").length < 10
                      }
                      className="w-full bg-[#1A73E8] hover:bg-[#1557B0] text-white font-medium text-[15px] py-3.5 rounded-full shadow-[0_8px_20px_-6px_rgba(26,115,232,0.4)] hover:-translate-y-0.5 hover:shadow-[0_12px_24px_-8px_rgba(26,115,232,0.6)] transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Sending code to WhatsApp...</span>
                        </>
                      ) : (
                        <>
                          <WhatsAppIcon className="size-5" />
                          <span>Send WhatsApp Code</span>
                        </>
                      )}
                    </button>
                  </form>
                ) : (
                  /* Step 2: Enter 6-digit OTP */
                  <div className="space-y-4">
                    <div className="flex items-center justify-between bg-neutral-50 border border-neutral-200 p-3 rounded-xl">
                      <div className="flex items-center gap-2 text-xs">
                        <ShieldCheck className="w-4 h-4 text-[#1A73E8] shrink-0" />
                        <span className="text-neutral-600">
                          Code sent to WhatsApp{" "}
                          <span className="font-semibold text-neutral-900">
                            {countryCode} {phoneNumber}
                          </span>
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setStep("phone")}
                        className="text-xs text-[#1A73E8] hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        <ArrowLeft className="w-3 h-3" /> Change
                      </button>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-neutral-800 mb-2 text-center">
                        Enter 6-Digit WhatsApp Code
                      </label>
                      <div className="flex justify-between gap-1.5 sm:gap-2">
                        {otpDigits.map((digit, idx) => (
                          <input
                            key={idx}
                            ref={(el) => {
                              otpInputRefs.current[idx] = el;
                            }}
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            maxLength={1}
                            value={digit}
                            onChange={(e) =>
                              handleOtpChange(idx, e.target.value)
                            }
                            onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                            onPaste={handleOtpPaste}
                            className="w-11 sm:w-12 h-13 text-center text-xl font-bold bg-neutral-50 border border-neutral-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1A73E8] text-neutral-900 transition-all"
                          />
                        ))}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleVerifyOtp()}
                      disabled={
                        loading || isResending || otpDigits.some((d) => !d)
                      }
                      className="w-full bg-[#1A73E8] hover:bg-[#1557B0] text-white font-medium text-[15px] py-3.5 rounded-full shadow-[0_8px_20px_-6px_rgba(26,115,232,0.4)] hover:-translate-y-0.5 hover:shadow-[0_12px_24px_-8px_rgba(26,115,232,0.6)] transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                    >
                      {loading && !isResending ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Verifying...</span>
                        </>
                      ) : (
                        <span>Verify & Connect WhatsApp</span>
                      )}
                    </button>

                    <div className="text-center pt-1">
                      {canResend ? (
                        <button
                          type="button"
                          onClick={handleResend}
                          disabled={loading || isResending}
                          className="text-xs text-[#1A73E8] hover:underline font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          <RotateCw
                            className={cn(
                              "w-3.5 h-3.5",
                              isResending && "animate-spin",
                            )}
                          />
                          <span>
                            {isResending ? "Resending code..." : "Resend Code"}
                          </span>
                        </button>
                      ) : (
                        <p className="text-xs text-neutral-500">
                          Resend code in{" "}
                          <span className="font-semibold text-neutral-800">
                            {resendTimer}s
                          </span>
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Collapsible Alternative: Bot Link Code */}
              <div className="pt-2 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => {
                    setShowManualCode(!showManualCode);
                    if (!code && !showManualCode) generateLinkCode();
                  }}
                  className="hidden w-full  items-center justify-between text-xs text-neutral-500 hover:text-neutral-800 py-1 transition-colors cursor-pointer"
                >
                  <span>Prefer to message our bot directly?</span>
                  {showManualCode ? (
                    <ChevronUp size={14} />
                  ) : (
                    <ChevronDown size={14} />
                  )}
                </button>

                {showManualCode && (
                  <div className="mt-3 flex flex-col gap-3 animate-in fade-in duration-150">
                    {!code ? (
                      <button
                        onClick={generateLinkCode}
                        disabled={loading}
                        className="w-full py-2.5 px-3 rounded-xl border border-neutral-200 bg-neutral-50 hover:bg-neutral-100 text-xs font-semibold text-neutral-700 transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        {loading ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <MessageSquare size={14} />
                        )}
                        Generate Manual Code
                      </button>
                    ) : (
                      <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-3 text-center space-y-2">
                        <span className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">
                          Manual Code
                        </span>
                        <div className="text-2xl font-black tracking-widest text-neutral-900 font-mono">
                          {code}
                        </div>
                        <div className="flex gap-2 pt-1">
                          <button
                            onClick={copyCode}
                            className="flex-1 py-2 px-2.5 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-100 text-[11px] font-semibold text-neutral-700 flex items-center justify-center gap-1 cursor-pointer"
                          >
                            {copied ? (
                              <Check size={12} className="text-[#1A73E8]" />
                            ) : (
                              <Copy size={12} />
                            )}
                            {copied ? "Copied!" : "Copy"}
                          </button>
                          {deepLink && (
                            <a
                              href={deepLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex-1 py-2 px-2.5 rounded-lg bg-[#1A73E8] hover:bg-[#1557B0] text-white text-[11px] font-semibold flex items-center justify-center gap-1 cursor-pointer"
                            >
                              <ExternalLink size={12} />
                              Open Chat
                            </a>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
