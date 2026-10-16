import { getFriendlyAuthError } from "./friendlyAuthError";

/**
 * Maps raw SDK/API errors to user-facing messages. Firebase errors
 * (storage/*, firestore codes, auth/*, "Firebase: ..." strings, and the JSON
 * blobs thrown by handleFirestoreError) are NEVER shown raw — they leak
 * internals ("storage/unauthorized", project paths) and confuse users.
 *
 * Anything that is NOT recognisably Firebase passes through untouched, so
 * deliberate server/app messages ("Daily limit exceeded", validation text)
 * keep working. Always pass the human fallback the call site was using.
 */
export function friendlyFirebaseError(err: unknown, fallback: string): string {
  const raw = messageOf(err);
  const code = codeOf(err, raw);

  if (code.startsWith("auth/")) return getFriendlyAuthError(code);

  switch (code) {
    case "storage/unauthorized":
    case "firestore/permission-denied":
      return "We couldn't save that due to a permissions issue. Please sign out and sign in again, then retry. If it keeps happening, contact support.";
    case "storage/canceled":
      return "Upload cancelled.";
    case "storage/retry-limit-exceeded":
    case "storage/cannot-slice-blob":
    case "firestore/unavailable":
    case "firestore/deadline-exceeded":
    case "firestore/aborted":
      return "The connection was interrupted. Please check your internet and try again.";
    case "storage/quota-exceeded":
      return "Storage is full right now. Please try again later or contact support.";
    case "storage/invalid-format":
    case "storage/invalid-url":
      return "That file could not be read. Please try a different PDF or photo.";
    case "firestore/unauthenticated":
      return "Please sign in to continue.";
    case "firestore/not-found":
      return "That record no longer exists. Please refresh and try again.";
    case "firestore/already-exists":
    case "firestore/failed-precondition":
    case "firestore/out-of-range":
    case "firestore/unimplemented":
    case "firestore/internal":
    case "firestore/data-loss":
      return fallback;
    default:
      break;
  }

  // Recognisably Firebase but unmapped: never show raw internals.
  if (isFirebaseShaped(err, code, raw)) return fallback;
  // Not Firebase (server/app/validation errors): pass through.
  return raw || fallback;
}

function messageOf(err: unknown): string {
  if (typeof err === "string") return err;
  const m = (err as { message?: unknown })?.message;
  return typeof m === "string" ? m : "";
}

/** Bare modular-SDK codes (firebase/firestore throws these without a prefix). */
const FIRESTORE_BARE_CODES = new Set([
  "cancelled",
  "unknown",
  "invalid-argument",
  "deadline-exceeded",
  "not-found",
  "already-exists",
  "permission-denied",
  "resource-exhausted",
  "failed-precondition",
  "aborted",
  "out-of-range",
  "unimplemented",
  "internal",
  "unavailable",
  "data-loss",
  "unauthenticated",
]);

/** Extracts a `family/code` identifier from err.code or the message text. */
function codeOf(err: unknown, raw: string): string {
  const direct = (err as { code?: unknown })?.code;
  if (typeof direct === "string" && direct.includes("/")) return direct.toLowerCase();
  if (typeof direct === "string" && FIRESTORE_BARE_CODES.has(direct.toLowerCase())) {
    return `firestore/${direct.toLowerCase()}`;
  }

  // handleFirestoreError throws Error(JSON.stringify({error: <inner>, ...}))
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) {
    try {
      const inner = (JSON.parse(trimmed) as { error?: unknown }).error;
      if (typeof inner === "string" && inner !== raw) return codeOf({ message: inner }, inner);
    } catch {
      // Not JSON — fall through to text matching.
    }
  }

  const m = /(storage|firestore|auth)\/[\w-]+/i.exec(raw);
  if (m) return m[0].toLowerCase();
  if (/missing or insufficient permissions/i.test(raw)) return "firestore/permission-denied";
  if (/^\s*Firebase(Error| Storage)?:/i.test(raw)) return "firebase/unknown";
  return "";
}

function isFirebaseShaped(err: unknown, code: string, raw: string): boolean {
  if (code && (code.startsWith("storage/") || code.startsWith("firestore/"))) return true;
  if (/^\s*Firebase(Error| Storage)?:/i.test(raw)) return true;
  if (typeof (err as { code?: unknown })?.code === "string") return true;
  return false;
}
