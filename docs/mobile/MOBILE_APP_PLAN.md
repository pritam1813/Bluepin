# Bluepin Mobile App Plan

> **Scope**: React Native (Expo) app for Android & iOS, sharing the same Firebase backend as the existing web app. All core features are preserved; UI adapts to native platform conventions.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Technology Stack](#2-technology-stack)
3. [Architecture Overview](#3-architecture-overview)
4. [Feature Parity Matrix](#4-feature-parity-matrix)
5. [Screen & Navigation Structure](#5-screen--navigation-structure)
6. [Native UI Adaptations](#6-native-ui-adaptations)
7. [Backend & API Strategy](#7-backend--api-strategy)
8. [Auth Strategy](#8-auth-strategy)
9. [Data & State Management](#9-data--state-management)
10. [Native-Only Features](#10-native-only-features)
11. [File & Media Handling](#11-file--media-handling)
12. [Notifications](#12-notifications)
13. [Phased Rollout Plan](#13-phased-rollout-plan)
14. [Mono-repo Structure](#14-mono-repo-structure)
15. [CI/CD & Store Deployment](#15-cicd--store-deployment)
16. [Open Questions & Decisions Required](#16-open-questions--decisions-required)

---

## 1. Executive Summary

Bluepin is a diabetes management app currently delivered as a React + Vite PWA with an Express/Node.js backend on Firebase App Hosting. This plan outlines how to ship **native Android and iOS apps** using **React Native with Expo**, sharing:

- The **same Firebase project** (Firestore, Auth, Storage, FCM)
- The **same Express backend API** (already serving AI inference, OCR, WhatsApp reminders)
- All **business logic** (biomarker scoring, goal tracking, glucose analysis, care reminders)

The mobile app will be a **separate Expo workspace** inside a monorepo alongside the web app. Shared pure-TS/JS logic (`lib/`, `types.ts`, scoring utilities) will be extracted into a `packages/core` shared package.

---

## 2. Technology Stack

| Layer | Technology | Rationale |
|---|---|---|
| Framework | **React Native + Expo SDK 52+** | Fastest path to ship; Expo ecosystem covers camera, filesystem, notifications natively |
| Language | TypeScript | Same as web — shared types immediately |
| Navigation | **React Navigation v7** (Stack + Bottom Tabs) | De-facto standard; maps naturally to current tab structure |
| State / Store | **Zustand** (same pattern as web `store.tsx`) | Direct port; no Redux overhead |
| Firebase Client | **`@react-native-firebase`** (RNFB v21) | Full native Firebase SDK — better performance and background support than the JS SDK in RN |
| Charts | **Victory Native** or **react-native-gifted-charts** | Native SVG charting for glucose/weight trends |
| UI Primitives | **Custom components** with NativeWind (Tailwind for RN) | Mirrors web colour tokens; preserves design system |
| Forms | **React Hook Form** + Zod | Identical to web |
| File Picker / Camera | **expo-document-picker**, **expo-camera**, **expo-image-picker** | Lab report OCR upload flow |
| Notifications | **expo-notifications** + FCM (RNFB) | Push reminders; replaces WhatsApp-only flow |
| Secure Storage | **expo-secure-store** | Token / API key storage (replaces localStorage) |
| Date utils | **date-fns** | Already used on web; works in RN |
| Animation | **react-native-reanimated v3** + **react-native-gesture-handler** | Replaces `motion/react`; hardware-accelerated |
| Deep Links | **Expo Linking** + Universal Links / App Links | Magic link auth (WhatsApp → app) |

---

## 3. Architecture Overview

```
bluepin/ (monorepo root)
├── apps/
│   ├── web/          ← existing Vite/React PWA (unchanged)
│   └── mobile/       ← new Expo app
├── packages/
│   └── core/         ← shared pure-TS logic extracted from web
│       ├── types.ts
│       ├── biomarkerUtils.ts
│       ├── derivedMetrics.ts
│       ├── goalUtils.ts
│       ├── scoreColor.ts
│       ├── careReminderRules.ts
│       └── utils.ts
└── server/           ← existing Express backend (unchanged)
```

**Data flow** (identical to web):
```
Mobile App
  → Firebase Auth (RNFB)
  → Firestore real-time listeners (RNFB)
  → Express API (for AI/OCR endpoints)
  → Firebase Storage (report PDFs/images)
```

See [MOBILE_ARCHITECTURE.md](./MOBILE_ARCHITECTURE.md) for detailed diagrams.

---

## 4. Feature Parity Matrix

| Feature | Web | Mobile | Notes |
|---|---|---|---|
| Google Sign-In | ✅ | ✅ | `@react-native-google-signin/google-signin` |
| Email + Password | ✅ | ✅ | Direct port |
| Phone / WhatsApp magic link | ✅ | ✅ | Deep link intercept in-app |
| Onboarding flow | ✅ | ✅ | Native bottom-sheet steps |
| Dashboard (health dial, snapshots) | ✅ | ✅ | Port health dial as SVG component |
| Glucose logging (manual) | ✅ | ✅ | Native number pad |
| Glucose logging (OCR from image) | ✅ | ✅ | Camera capture → existing OCR API |
| Lab report upload (PDF/image OCR) | ✅ (file picker) | ✅ | Native doc picker + camera |
| Biomarkers Canvas tab | ✅ | ✅ | Collapsible list native sections |
| Weight logging | ✅ | ✅ | Direct port |
| Goals & streaks | ✅ | ✅ | Direct port |
| Care reminders (UI) | ✅ | ✅ | Direct port |
| WhatsApp reminder scheduling | ✅ | ✅ | Same backend API |
| Push notifications (FCM) | ✅ (web push) | ✅ | Native FCM via RNFB — **better** |
| Profile (edit, biometrics) | ✅ | ✅ | Native form sheets |
| Dark mode | ✅ | ✅ | `useColorScheme()` hook |
| Legal docs modal | ✅ | ✅ | Scrollable modal/sheet |
| Family invite / family ID | ✅ | ✅ | Share sheet for invite link |
| Consent management | ✅ | ✅ | First-launch consent screen |
| Admin feedback view | ✅ | ⬜ | Phase 3 — low priority |
| Install PWA prompt | ✅ | N/A | Replace with app store rating prompt |
| Dashboard onboarding tour | ✅ (Joyride) | ✅ | Custom tooltip overlay (Phase 2) |

---

## 5. Screen & Navigation Structure

```
RootNavigator (Stack)
├── AuthStack (unauthenticated)
│   ├── SplashScreen
│   ├── AuthScreen          ← login / register
│   └── OnboardingScreen    ← post-signup profile setup
│
└── AppTabs (authenticated — Bottom Tab Navigator)
    ├── DashboardStack
    │   └── DashboardScreen      ← health dial, glucose snapshot, weight, reminders
    ├── GlucoseStack
    │   ├── GlucoseScreen        ← readings list + chart
    │   ├── AddGlucoseSheet      ← bottom sheet
    │   └── GlucoseDetailScreen
    ├── BiomarkersStack
    │   ├── BiomarkersScreen     ← canvas / lab reports list
    │   ├── ReportDetailScreen
    │   └── AddReportFlow        ← multi-step: pick file → confirm biomarkers
    ├── FitnessStack  (weight tab — currently inside Dashboard)
    │   ├── WeightScreen
    │   └── AddWeightSheet
    └── ProfileStack
        ├── ProfileScreen
        ├── SettingsScreen
        ├── NotificationsScreen
        └── LegalDocsScreen
```

> **Note**: The web app uses a 3-tab bottom nav (Dashboard, Glucose, Canvas/Biomarkers). The mobile app adds a dedicated **Fitness** tab for weight (currently pinnable in Dashboard) and moves **Profile** into a proper stack instead of a modal, which is more native.

---

## 6. Native UI Adaptations

### 6.1 Platform-Specific Patterns

| Web Pattern | Android Native | iOS Native |
|---|---|---|
| Modal overlays | `BottomSheet` (react-native-bottom-sheet) | Same |
| Hover states | Ripple (`TouchableNativeFeedback`) | Opacity fade (`TouchableOpacity`) |
| Desktop sidebar | N/A | N/A |
| Browser file picker | `expo-document-picker` | `expo-document-picker` |
| `localStorage` | `AsyncStorage` + `expo-secure-store` | Same |
| CSS animations (motion) | `react-native-reanimated` | Same |
| Tailwind CSS classes | NativeWind (subset of Tailwind) | Same |
| `recharts` SVG charts | `react-native-gifted-charts` | Same |

### 6.2 Design Token Mapping

The web uses a CSS custom-property theme system (`--theme-bg`, `--theme-text`, etc.). Mobile will replicate this as a **React Context theme object**:

```ts
// packages/core/theme.ts
export interface AppTheme {
  bg: string;
  card: string;
  text: string;
  textSec: string;
  border: string;
  accent: string;
}

export const lightTheme: AppTheme = { bg: '#ffffff', card: '#f8f9fa', ... };
export const darkTheme: AppTheme  = { bg: '#0f0f13', card: '#1a1a22', ... };
```

### 6.3 Health Dial (SVG)

The web `DashboardHealthDial` uses CSS + DOM. Mobile will use `react-native-svg` to replicate the arc/dial directly — the scoring logic (`getCanvasHealthScore`) is already in shared `packages/core`.

### 6.4 Activity Circle

`ActivityCircle.tsx` uses SVG. Port to `react-native-svg` with identical props interface.

### 6.5 Bottom Sheet Flows

Quick-add actions (Add Glucose, Add Weight, Add Report) currently use modals on web. On mobile these become **`react-native-bottom-sheet`** panels — the native UX pattern for transient data entry.

---

## 7. Backend & API Strategy

The existing Express server (deployed on Firebase App Hosting) is **reused without modification**. All mobile API calls point to the same base URL.

| API Route | Used By Mobile? | Notes |
|---|---|---|
| `POST /api/upload` | ✅ | Lab report PDF/image OCR (multipart) |
| `POST /api/insights` | ✅ | AI-generated health insights |
| `GET /api/health` | ✅ | Liveness check |
| `POST /api/auth/*` | ✅ | WhatsApp magic link exchange |
| `POST /api/notifications/*` | ✅ | FCM token registration |
| `POST /api/reminders/*` | ✅ | WhatsApp reminder scheduling |
| `POST /api/whatsapp/*` | ✅ | Webhook (server-side only) |
| `GET /api/cron/*` | Server only | Not called from mobile |

**Auth header**: Mobile sends Firebase ID tokens (obtained via RNFB `auth().currentUser?.getIdToken()`) in `Authorization: Bearer <token>` — same as web.

---

## 8. Auth Strategy

| Method | Implementation |
|---|---|
| **Email + Password** | `@react-native-firebase/auth` — `signInWithEmailAndPassword` |
| **Google Sign-In** | `@react-native-google-signin/google-signin` → `auth().signInWithCredential` |
| **Phone / WhatsApp Magic Link** | Server issues signed JWT in WhatsApp message → deep link `bluepin://auth?token=...` → app intercepts via `Linking.addEventListener`, calls `/api/auth/exchange-magic-link`, signs in with custom Firebase token |
| **Session persistence** | RNFB Auth persists natively in Keychain (iOS) / Keystore (Android) |
| **Consent on first login** | `ConsentScreen` shown after successful auth if no consent record in Firestore |

---

## 9. Data & State Management

### 9.1 Zustand Store (port of `src/store.tsx`)

```ts
// apps/mobile/src/store.ts
// Near-identical to web store — same shape, same Firestore listeners
// Replace firebase/firestore JS SDK with @react-native-firebase/firestore
```

Key replacements:
- `onSnapshot` → RNFB `firestore().collection().onSnapshot()`
- `setDoc` / `updateDoc` → RNFB equivalents
- `localStorage` → `AsyncStorage` (non-sensitive), `expo-secure-store` (tokens)

### 9.2 Offline Support

RNFB Firestore has **native offline persistence** enabled by default (SQLite-backed). This is a step up from the web PWA — the mobile app will work offline and sync when connectivity returns.

```ts
// Enable offline persistence (enabled by default in RNFB)
firestore().settings({ persistence: true });
```

### 9.3 Shared Business Logic

All scoring, derivation, and utility functions move to `packages/core` and are imported by both web and mobile:

- `biomarkerUtils.ts` — biomarker status, TIER_1 list
- `derivedMetrics.ts` — health score, dashboard metrics
- `goalUtils.ts` — streaks, weekly activity
- `careReminderRules.ts` — care reminder engine
- `scoreColor.ts` — colour mapping for scores
- `types.ts` — all shared TypeScript interfaces

---

## 10. Native-Only Features

These features are either impossible or degraded on the web PWA but fully native on mobile:

| Feature | Implementation | Priority |
|---|---|---|
| **Push Notifications** (glucose reminders, care alerts) | FCM via `@react-native-firebase/messaging` + `expo-notifications` | P0 |
| **Camera capture** for glucose meter / lab report photo | `expo-camera` → upload to existing OCR endpoint | P0 |
| **Biometric auth** (Face ID / Fingerprint lock) | `expo-local-authentication` — optional app lock | P1 |
| **HealthKit / Health Connect integration** | `react-native-health` (iOS) + `react-native-health-connect` (Android) — import glucose/weight | P2 |
| **Home Screen Widget** | Expo Widgets (Expo SDK 52+) — show today's glucose + health score | P3 |
| **Share sheet** for family invite links | `expo-sharing` | P1 |
| **Haptic feedback** on quick actions | `expo-haptics` | P1 |
| **App rating prompt** | `expo-store-review` | P2 |
| **Background sync** for reminder delivery tracking | `expo-task-manager` + `expo-background-fetch` | P2 |

---

## 11. File & Media Handling

### Lab Report Upload Flow

```
User taps "Add Report"
  → Bottom sheet: "Take Photo" / "Choose PDF" / "Choose Image"
  → expo-camera OR expo-document-picker / expo-image-picker
  → File uploaded via multipart POST to existing /api/upload endpoint
  → Server runs OCR (existing labReportServiceDirect.ts)
  → Returns structured biomarkers JSON
  → User reviews & confirms biomarkers
  → Saved to Firestore (existing schema)
```

### Glucose Meter Photo

```
User taps "Scan glucose meter"
  → expo-camera (viewfinder)
  → Capture → send to /api/upload with type=glucose_ocr
  → Returns parsed glucose value
  → Pre-fills AddGlucose form
```

### Storage

- Lab report PDFs/images: **Firebase Storage** (same bucket as web)
- Profile photos: **Firebase Storage**
- Local cache: **expo-file-system** for downloaded report previews

---

## 12. Notifications

### Push Notifications (replacing WhatsApp-only flow)

Mobile enables **native push** alongside WhatsApp reminders:

1. On app start, request push permission via `expo-notifications`
2. Get Expo push token + FCM token
3. Register token with backend (`POST /api/notifications/register-token`)
4. Backend stores token in Firestore under `users/{uid}/devices/{deviceId}`
5. Backend cron (`server/routes/cron.ts`) sends glucose/weight reminders via FCM

### Notification Types (MVP)

| Type | Trigger | Channel |
|---|---|---|
| Daily glucose reminder | User-set time (mirrors WhatsApp reminder slot) | FCM push + WhatsApp |
| Care reminder alert | Care reminder engine fires | FCM push |
| Report analysis done | OCR processing complete | FCM push |
| Goal streak milestone | `goalUtils.ts` streak logic | FCM push |

### Local Notifications (offline fallback)

Use `expo-notifications` to schedule local notifications for the daily glucose reminder — fires even without internet.

---

## 13. Phased Rollout Plan

See [MOBILE_PHASES.md](./MOBILE_PHASES.md) for detailed task breakdowns.

### Phase 0 — Monorepo Setup (Week 1–2)
- Convert repo to monorepo (npm workspaces)
- Extract `packages/core` shared logic
- Scaffold `apps/mobile` Expo project
- Wire shared Firebase config

### Phase 1 — Auth + Onboarding (Week 2–3)
- Splash screen, Auth screen (email/password, Google)
- WhatsApp magic link deep link handler
- Consent screen (port of `ConsentSection`)
- Onboarding flow (profile setup)

### Phase 2 — Core Features MVP (Week 4–7)
- Dashboard screen (health dial, glucose snapshot, weight, care reminders)
- Glucose tab (list, chart, add via form, add via camera OCR)
- Biomarkers/Canvas tab (lab reports list, report detail, add report flow)
- Weight logging
- Goals & streaks

### Phase 3 — Native Enhancements (Week 8–10)
- Push notifications setup + FCM token registration
- Profile screen + settings
- Dark mode + theme
- Haptic feedback
- Biometric app lock
- Share sheet for family invites

### Phase 4 — Store Submission (Week 11–12)
- App icons, splash screens, store assets
- Privacy manifest (iOS 17+)
- Play Store listing
- App Store listing
- Beta testing (TestFlight + Play internal track)

### Phase 5 — Post-Launch (Ongoing)
- HealthKit / Health Connect integration
- Home screen widgets
- App rating prompt
- A/B testing via Firebase Remote Config

---

## 14. Mono-repo Structure

```
bluepin/                          ← workspace root
├── package.json                  ← workspaces: ["apps/*", "packages/*"]
├── apps/
│   ├── web/                      ← existing Vite/React app (minimal changes)
│   │   ├── package.json
│   │   ├── src/
│   │   └── server/
│   └── mobile/                   ← NEW Expo app
│       ├── package.json
│       ├── app.json              ← Expo config
│       ├── app/                  ← Expo Router file-based routing (alternative to RN Navigation)
│       │   ├── (auth)/
│       │   │   ├── sign-in.tsx
│       │   │   └── onboarding.tsx
│       │   └── (app)/
│       │       ├── _layout.tsx   ← Tab layout
│       │       ├── index.tsx     ← Dashboard
│       │       ├── glucose.tsx
│       │       ├── biomarkers.tsx
│       │       ├── fitness.tsx
│       │       └── profile.tsx
│       ├── components/
│       ├── hooks/
│       ├── store.ts              ← Zustand store (uses packages/core)
│       └── lib/
│           └── firebase.ts       ← RNFB initialisation
└── packages/
    └── core/                     ← shared pure-TS logic
        ├── package.json
        ├── types.ts
        ├── biomarkerUtils.ts
        ├── derivedMetrics.ts
        ├── goalUtils.ts
        ├── careReminderRules.ts
        ├── scoreColor.ts
        └── utils.ts
```

> **Routing decision**: Use **Expo Router** (file-based, built on React Navigation) instead of manual navigator wiring — reduces boilerplate significantly and aligns with Expo SDK 52 best practices.

---

## 15. CI/CD & Store Deployment

### Build Service: EAS (Expo Application Services)

```yaml
# eas.json
{
  "build": {
    "development": { "developmentClient": true, "distribution": "internal" },
    "preview":     { "distribution": "internal" },
    "production":  { "autoIncrement": true }
  },
  "submit": {
    "production": {
      "android": { "serviceAccountKeyPath": "./play-store-key.json", "track": "internal" },
      "ios":      { "appleId": "...", "ascAppId": "...", "appleTeamId": "..." }
    }
  }
}
```

### GitHub Actions Workflow

```
On PR to main:
  → eas build --platform all --profile preview
  → Upload APK/IPA as artifacts
  → Run Jest unit tests (packages/core)
  → Run Maestro E2E tests (smoke)

On merge to main:
  → eas build --platform all --profile production
  → eas submit --platform all
```

### Environment Config

| Environment | Firebase Project | Backend URL |
|---|---|---|
| Development | `bluepin-f8a09` | `http://localhost:3000` |
| Preview | `bluepin-f8a09` | Preview App Hosting URL |
| Production | `myhealthyfam-28c2c` | `https://api.bluepin.in` |

Sensitive config stored in **EAS Secrets** (mirrors App Hosting env approach).

---

## 16. Open Questions & Decisions Required

| # | Question | Options | Impact |
|---|---|---|---|
| 1 | **Expo Router vs React Navigation?** | Expo Router (recommended), React Navigation v7 | Navigation architecture |
| 2 | **RNFB vs Firebase JS SDK?** | RNFB (recommended for native), JS SDK (simpler setup) | Performance, offline, background |
| 3 | **NativeWind vs StyleSheet?** | NativeWind (shares tokens with web), plain StyleSheet | Styling consistency |
| 4 | **Fitness tab: separate tab or keep in Dashboard?** | Separate tab (recommended), pinnable widget | Navigation structure |
| 5 | **HealthKit / Health Connect integration in MVP?** | Phase 2 (recommended to skip for MVP), Phase 5 | Scope of MVP |
| 6 | **Monorepo tool: npm workspaces vs Turborepo?** | npm workspaces (simpler), Turborepo (caching) | Build speed |
| 7 | **App Store account setup** | User must enroll in Apple Developer Program ($99/yr) and Google Play ($25 one-time) | Store submission |
| 8 | **WhatsApp reminder on mobile: keep or replace with push?** | Both (recommended), push only, WhatsApp only | Notification strategy |
