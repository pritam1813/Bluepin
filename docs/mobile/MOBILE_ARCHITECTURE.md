# Bluepin Mobile — Architecture Deep Dive

> Companion to [MOBILE_APP_PLAN.md](./MOBILE_APP_PLAN.md)

---

## 1. High-Level Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Bluepin Mobile App                │
│              (Expo / React Native)                  │
│                                                     │
│  ┌──────────┐  ┌────────────┐  ┌─────────────────┐ │
│  │  Screens │  │  Zustand   │  │  packages/core  │ │
│  │  (React  │◄─│   Store    │◄─│  (shared logic) │ │
│  │  Native) │  │            │  │                 │ │
│  └──────────┘  └─────┬──────┘  └─────────────────┘ │
│                      │                             │
│              ┌───────┴────────┐                    │
│              │  Firebase RN   │                    │
│              │  (RNFB v21)    │                    │
│              └───────┬────────┘                    │
└──────────────────────┼──────────────────────────────┘
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
  ┌──────────┐  ┌──────────┐  ┌──────────┐
  │Firestore │  │  Auth    │  │ Storage  │
  │(real-time│  │(RNFB)    │  │(RNFB)   │
  │  sync)   │  └──────────┘  └──────────┘
  └──────────┘
        │
        │ Express API (existing)
        ▼
  ┌─────────────────────────────┐
  │  Firebase App Hosting       │
  │  server/ (Node.js)          │
  │  ├── /api/upload  (OCR)     │
  │  ├── /api/insights (AI)     │
  │  ├── /api/reminders         │
  │  └── /api/notifications     │
  └─────────────────────────────┘
```

---

## 2. Navigation Architecture

```
RootStack (NavigationContainer)
│
├── <AuthStack.Navigator>   [shown when user === null]
│   ├── Splash              (auto-resolves in 1-2s)
│   ├── SignIn              (email/password + Google)
│   └── Onboarding          (profile setup wizard)
│
└── <AppTabs.Navigator>     [shown when user !== null]
    │  (Bottom Tab — 4 tabs)
    │
    ├── Tab: Dashboard
    │   └── Stack
    │       └── DashboardScreen
    │           ├── HealthDialCard       (SVG, shared score logic)
    │           ├── GlucoseSnapshotCard  (tappable → GlucoseTab)
    │           ├── WeightCard           (tappable → FitnessTab)
    │           ├── GoalStreakCard
    │           └── CareRemindersCard
    │
    ├── Tab: Glucose
    │   └── Stack
    │       ├── GlucoseScreen           (chart + readings list)
    │       ├── GlucoseDetailScreen     (single reading detail)
    │       └── [BottomSheet] AddGlucose
    │
    ├── Tab: Canvas (Biomarkers)
    │   └── Stack
    │       ├── BiomarkersScreen        (reports list + biomarker summary)
    │       ├── ReportDetailScreen      (biomarker table for one report)
    │       └── [Flow] AddReportFlow
    │           ├── Step 1: Pick source (camera / file picker)
    │           ├── Step 2: Upload + OCR (loading)
    │           └── Step 3: Review & confirm biomarkers
    │
    ├── Tab: Fitness
    │   └── Stack
    │       ├── WeightScreen            (trend chart + log list)
    │       └── [BottomSheet] AddWeight
    │
    └── Tab: Profile
        └── Stack
            ├── ProfileScreen           (avatar, biometrics, settings)
            ├── EditBiometricsScreen
            ├── NotificationsScreen     (WhatsApp reminder + push toggle)
            ├── WhatsAppSetupScreen
            └── LegalDocsScreen
```

---

## 3. State Management

### Zustand Store Shape

```ts
// apps/mobile/src/store.ts
interface MobileAppStore {
  // Data (identical to web AppState)
  glucoseReadings: GlucoseReading[];
  labReports: LabReport[];
  weightEntries: WeightEntry[];
  goals: Goal[];
  goalLogs: GoalLog;
  profile: UserProfile;

  // Actions
  addGlucoseReading: (r: Omit<GlucoseReading, 'id' | 'createdAt'>) => Promise<void>;
  deleteGlucoseReading: (id: string) => Promise<void>;
  addLabReport: (r: Omit<LabReport, 'id' | 'createdAt'>) => Promise<void>;
  deleteLabReport: (id: string) => Promise<void>;
  addWeightEntry: (w: Omit<WeightEntry, 'id' | 'createdAt'>) => Promise<void>;
  updateProfile: (p: Partial<UserProfile>) => Promise<void>;
  toggleGoalLog: (goalId: string, date: string, value?: number) => Promise<void>;

  // UI state
  isLoading: boolean;
  unsubscribers: (() => void)[];
  initListeners: (userId: string) => void;
  cleanup: () => void;
}
```

### Firestore Listeners (RNFB)

```ts
// Firestore listeners are set up once on auth state change
// and torn down on sign-out
function initListeners(userId: string) {
  const unsub1 = firestore()
    .collection(`users/${userId}/glucoseReadings`)
    .orderBy('createdAt', 'desc')
    .onSnapshot(snap => {
      set({ glucoseReadings: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
    });

  const unsub2 = firestore()
    .collection(`users/${userId}/labReports`)
    .onSnapshot(/* ... */);

  // ... other collections

  set({ unsubscribers: [unsub1, unsub2, ...] });
}
```

---

## 4. Authentication Flow

```
App Launch
    │
    ▼
RNFB auth().onAuthStateChanged()
    │
    ├── user = null ──────────► AuthStack
    │                              │
    │                         SignIn Screen
    │                         ┌───┴────────────┐
    │                         │                │
    │                    Email/Password    Google OAuth
    │                         │                │
    │                         └───────┬────────┘
    │                                 │
    │                         auth().signIn*()
    │                                 │
    │                         ────────────────────
    │
    └── user ≠ null ─────────► Check Firestore profile
                                       │
                              ┌────────┴──────────┐
                              │                   │
                         profile exists      no profile
                              │                   │
                         has consent?      OnboardingFlow
                              │                   │
                         ┌────┴────┐              │
                         │        │               │
                       yes        no         (creates profile)
                         │        │               │
                    AppTabs   ConsentScreen ───────┘
```

### WhatsApp Magic Link on Mobile

```
User taps link in WhatsApp message
  → bluepin://auth?token=<jwt>
  → Expo Linking fires deep link event
  → App extracts token
  → POST /api/auth/exchange-magic-link { token }
  → Server verifies JWT, returns Firebase custom token
  → auth().signInWithCustomToken(firebaseToken)
  → Normal auth flow continues
```

---

## 5. API Communication

```ts
// apps/mobile/src/lib/api.ts

const BASE_URL = process.env.EXPO_PUBLIC_API_URL; // set per environment

async function apiFetch(path: string, options?: RequestInit) {
  const token = await auth().currentUser?.getIdToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

// Lab report upload (multipart)
async function uploadReport(fileUri: string, mimeType: string) {
  const formData = new FormData();
  formData.append('file', { uri: fileUri, type: mimeType, name: 'report' } as any);

  const token = await auth().currentUser?.getIdToken();
  const res = await fetch(`${BASE_URL}/api/upload`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: formData,
  });
  return res.json();
}
```

---

## 6. Push Notifications Architecture

```
Mobile App (on first launch)
  │
  ├── Request permission (expo-notifications)
  ├── Get Expo push token + FCM token (RNFB Messaging)
  └── POST /api/notifications/register
      { userId, fcmToken, platform: 'android'|'ios' }
      │
      └── Server stores in Firestore:
          users/{uid}/devices/{deviceId}
          { fcmToken, platform, updatedAt }

Server Cron (existing cron.ts)
  │
  ├── Daily glucose reminder (user's chosen time)
  │   └── FCM multicast to user's devices
  │
  └── Care reminder alerts (when engine fires)
      └── FCM to user's devices

Mobile App (background)
  ├── RNFB messaging().onMessage() ← foreground handler
  ├── RNFB messaging().setBackgroundMessageHandler() ← background
  └── expo-notifications for local scheduling (offline fallback)
```

---

## 7. Offline Strategy

| Data type | Offline behaviour |
|---|---|
| Glucose readings | RNFB offline cache; writes queue and sync on reconnect |
| Lab reports | RNFB offline cache; new uploads queue (need connectivity) |
| Weight entries | RNFB offline cache |
| Goals / logs | RNFB offline cache |
| AI insights | Cached from last successful fetch; refresh when online |
| Push notifications | Local notifications scheduled as fallback for reminders |

---

## 8. Security Considerations

| Concern | Mitigation |
|---|---|
| Auth tokens | RNFB stores natively in Keychain/Keystore — not in JS memory |
| Sensitive prefs | `expo-secure-store` for any sensitive user preferences |
| File uploads | Same server-side validation as web (MIME check, size limit) |
| API keys | Stored in EAS Secrets, injected at build time via `EXPO_PUBLIC_*` env vars |
| Firebase rules | Existing `firestore.rules` and `storage.rules` apply — no changes needed |
| Biometric lock | `expo-local-authentication` (optional, Phase 3) |
| Certificate pinning | Not required for MVP; add in Phase 5 if compliance requires |

---

## 9. Performance Targets

| Metric | Target |
|---|---|
| App cold start | < 2 seconds (JS bundle load) |
| Dashboard render | < 500ms after data available |
| OCR upload → result | < 15 seconds (same as web) |
| Chart render (90 data points) | < 100ms (Victory Native / gifted-charts) |
| Firestore first sync | < 3 seconds on 4G |
| Offline app launch | < 1.5 seconds (cached data from RNFB) |

---

## 10. Testing Strategy

| Layer | Tool | Coverage target |
|---|---|---|
| Shared logic (`packages/core`) | Vitest (existing tests port directly) | > 80% |
| Component unit tests | Jest + React Native Testing Library | > 60% |
| Integration (store + Firestore) | Jest + RNFB mocks | Key flows |
| E2E (critical paths) | Maestro | Auth, add glucose, upload report |
| Manual QA | TestFlight / Play internal | Before each release |

---

## 11. Package Dependencies Reference

```jsonc
// apps/mobile/package.json (key dependencies)
{
  "dependencies": {
    // Expo core
    "expo": "~52.0.0",
    "expo-router": "~4.0.0",
    "expo-status-bar": "~2.0.0",

    // React Native core
    "react-native": "0.76.x",
    "react": "18.3.x",

    // Firebase (native)
    "@react-native-firebase/app": "^21.0.0",
    "@react-native-firebase/auth": "^21.0.0",
    "@react-native-firebase/firestore": "^21.0.0",
    "@react-native-firebase/storage": "^21.0.0",
    "@react-native-firebase/messaging": "^21.0.0",

    // Auth
    "@react-native-google-signin/google-signin": "^13.0.0",

    // Navigation
    "@react-navigation/native": "^7.0.0",
    "@react-navigation/bottom-tabs": "^7.0.0",
    "@react-navigation/stack": "^7.0.0",

    // UI / animation
    "react-native-reanimated": "~3.16.0",
    "react-native-gesture-handler": "~2.21.0",
    "@gorhom/bottom-sheet": "^5.0.0",
    "react-native-svg": "^15.0.0",
    "nativewind": "^4.0.0",

    // Charts
    "react-native-gifted-charts": "^1.4.0",

    // Native features
    "expo-camera": "~16.0.0",
    "expo-document-picker": "~12.0.0",
    "expo-image-picker": "~16.0.0",
    "expo-notifications": "~0.29.0",
    "expo-secure-store": "~14.0.0",
    "expo-local-authentication": "~15.0.0",
    "expo-haptics": "~14.0.0",
    "expo-sharing": "~12.0.0",
    "expo-file-system": "~18.0.0",
    "expo-linking": "~7.0.0",

    // Shared logic
    "@bluepin/core": "workspace:*",

    // State
    "zustand": "^5.0.0",

    // Forms
    "react-hook-form": "^7.85.0",
    "zod": "^4.4.3",
    "@hookform/resolvers": "^5.9.1",

    // Utils
    "date-fns": "^4.4.0"
  }
}
```
