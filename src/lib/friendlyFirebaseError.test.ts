import { describe, expect, it } from "vitest";
import { friendlyFirebaseError } from "./friendlyFirebaseError";

const storageDenied = () => {
  const err = new Error(
    "Firebase Storage: User does not have permission to access 'users/u1/labReports/r.pdf'. (storage/unauthorized)",
  );
  (err as unknown as { code: string }).code = "storage/unauthorized";
  return err;
};

describe("friendlyFirebaseError", () => {
  it("masks storage/unauthorized with a recovery message", () => {
    const out = friendlyFirebaseError(storageDenied(), "Upload failed.");
    expect(out).toMatch(/sign out and sign in again/i);
    expect(out).not.toContain("storage/unauthorized");
    expect(out).not.toContain("users/u1");
  });

  it("parses the code out of a bare Firebase message without .code", () => {
    const out = friendlyFirebaseError(
      new Error("Firebase Storage: retry limit exceeded (storage/retry-limit-exceeded)"),
      "Upload failed.",
    );
    expect(out).toMatch(/connection was interrupted/i);
  });

  it("unwraps handleFirestoreError JSON blobs into the permissions message", () => {
    const blob = new Error(
      JSON.stringify({ error: "Missing or insufficient permissions.", operationType: "create", path: "x" }),
    );
    expect(friendlyFirebaseError(blob, "Save failed.")).toMatch(/permissions issue/i);
  });

  it("maps bare modular-SDK codes and FirebaseError prefixes", () => {
    const bare = Object.assign(new Error("denied"), { code: "permission-denied" });
    expect(friendlyFirebaseError(bare, "Save failed.")).toMatch(/permissions issue/i);
    expect(friendlyFirebaseError(new Error("FirebaseError: some request failed"), "Save failed.")).toBe(
      "Save failed.",
    );
  });

  it("delegates auth/* to the auth mapper", () => {
    const err = Object.assign(new Error("x"), { code: "auth/invalid-credential" });
    expect(friendlyFirebaseError(err, "Login failed.")).toMatch(/incorrect email or password/i);
  });

  it("passes server/app messages through untouched", () => {
    expect(friendlyFirebaseError(new Error("Daily limit of 20 health reports exceeded."), "Oops.")).toBe(
      "Daily limit of 20 health reports exceeded.",
    );
    expect(
      friendlyFirebaseError(new Error("AI analysis service is temporarily busy."), "Oops."),
    ).toBe("AI analysis service is temporarily busy.");
  });

  it("falls back for unknown Firebase shapes and empty errors", () => {
    const weird = Object.assign(new Error("weird"), { code: "storage/something-new" });
    expect(friendlyFirebaseError(weird, "Upload failed.")).toBe("Upload failed.");
    expect(friendlyFirebaseError(null, "Try again.")).toBe("Try again.");
  });
});
