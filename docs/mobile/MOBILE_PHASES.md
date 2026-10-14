# Bluepin Mobile — Phased Implementation Plan

> Companion to [MOBILE_APP_PLAN.md](./MOBILE_APP_PLAN.md). Tracks all tasks by phase with acceptance criteria.

---

## Phase 0 — Monorepo Setup
**Goal**: Restructure repo and scaffold Expo project without breaking the existing web app.
**Duration**: Week 1–2
**Owner**: Engineering lead

### Tasks

#### P0-1: Convert to npm workspaces monorepo
- [ ] Add `"workspaces": ["apps/*", "packages/*"]` to root `package.json`
- [ ] Move existing web app files into `apps/web/`
  - `src/`, `server/`, `public/`, `index.html`, `vite.config.ts`, `tsconfig.json`
  - All Firebase config files
  - `apphosting.yaml`, `firebase.json`, `firestore.rules`, `storage.rules`
- [ ] Update all internal paths (imports, tsconfig paths)
- [ ] Verify `npm run dev` and `npm run build` still work for web
- [ ] **Acceptance**: Web app builds and runs identically to pre-monorepo

#### P0-2: Extract `packages/core`
- [ ] Create `packages/core/package.json` (`"name": "@bluepin/core"`)
- [ ] Copy and **de-browser** the following from `apps/web/src/`:
  - `types.ts`
  - `lib/biomarkerUtils.ts` (remove any DOM/browser APIs)
  - `lib/derivedMetrics.ts`
  - `lib/goalUtils.ts`
  - `lib/scoreColor.ts`
  - `lib/utils.ts` (strip `localStorage`, browser date APIs)
  - `careReminderRules.ts`
  - `lib/registry/biomarkerRegistry.ts`
  - `lib/registry/biomarkerLookup.ts`
  - `lib/registry/profileDefinitions.ts`
- [ ] Update web app to import from `@bluepin/core` instead of local paths
- [ ] Port existing Vitest tests to `packages/core/__tests__/`
- [ ] **Acceptance**: All existing unit tests pass (`npm test` in `packages/core`)

#### P0-3: Scaffold Expo mobile app
- [ ] `npx create-expo-app apps/mobile --template tabs` (Expo Router template)
- [ ] Configure `app.json`:
  - Bundle ID: `in.bluepin.app`
  - Android package: `in.bluepin.app`
  - App name: `Bluepin`
  - Scheme: `bluepin` (for deep links)
- [ ] Install and configure `@react-native-firebase`:
  - `@react-native-firebase/app`
  - `@react-native-firebase/auth`
  - `@react-native-firebase/firestore`
  - `@react-native-firebase/storage`
  - Download `google-services.json` (Android) and `GoogleService-Info.plist` (iOS) for dev Firebase project
- [ ] Configure NativeWind (Tailwind for React Native)
- [ ] Add `@bluepin/core` as workspace dependency
- [ ] Verify Expo dev build runs on Android emulator and iOS simulator
- [ ] **Acceptance**: App launches with "Hello, Bluepin" on both platforms

#### P0-4: EAS Setup
- [ ] Install EAS CLI: `npm install -g eas-cli`
- [ ] `eas init` in `apps/mobile/`
- [ ] Configure `eas.json` with `development`, `preview`, `production` profiles
- [ ] Create EAS Secrets for Firebase config values
- [ ] **Acceptance**: `eas build --profile development --platform android` succeeds

---

## Phase 1 — Auth + Onboarding
**Goal**: Complete authentication flows and onboarding experience.
**Duration**: Week 2–3

### Tasks

#### P1-1: Splash Screen
- [ ] Design: Bluepin logo centred, animated fade-in (matches web loading splash)
- [ ] Use `expo-splash-screen` for native splash
- [ ] After 1.5s: resolve auth state → route to Auth or App
- [ ] **Acceptance**: Smooth transition, no white flash

#### P1-2: Sign In Screen
- [ ] Port `AuthForm.tsx` logic to React Native
- [ ] Email + password fields (React Hook Form + Zod)
- [ ] Error messages from `friendlyAuthError.ts` (in `packages/core`)
- [ ] Loading state during sign-in
- [ ] "Forgot password" → email reset flow
- [ ] **Acceptance**: User can sign in with email/password, errors shown correctly

#### P1-3: Google Sign-In
- [ ] Install `@react-native-google-signin/google-signin`
- [ ] Configure OAuth client IDs (Android + iOS) in Google Cloud Console
- [ ] Implement `signInWithCredential` flow
- [ ] Show Google button on auth screen
- [ ] **Acceptance**: Google sign-in completes successfully on both platforms

#### P1-4: WhatsApp Magic Link Deep Link
- [ ] Configure Expo Linking with scheme `bluepin://`
- [ ] Configure Universal Links (iOS) and App Links (Android) for `bluepin.in` domain
- [ ] Listen for `bluepin://auth?token=<jwt>` on app launch and foreground
- [ ] Call `/api/auth/exchange-magic-link` and complete sign-in
- [ ] **Acceptance**: Tapping WhatsApp message link opens app and logs user in

#### P1-5: Consent Screen
- [ ] Show after first sign-in if no consent record in Firestore
- [ ] Port `ConsentSection.tsx` — checkbox items for Terms, Privacy, Health Data
- [ ] On accept: write consent record to Firestore (same schema as web)
- [ ] Legal doc viewer (scrollable modal with markdown rendered via `react-native-markdown-display`)
- [ ] **Acceptance**: Consent saved to Firestore, visible in web app profile too

#### P1-6: Onboarding Flow
- [ ] Multi-step bottom sheet / screen wizard:
  - Step 1: Name
  - Step 2: Age + Gender
  - Step 3: Height + Weight
  - Step 4: Diabetes status
- [ ] Write to Firestore `users/{uid}` on completion
- [ ] Progress indicator
- [ ] Skip allowed (partial profile)
- [ ] **Acceptance**: Profile data appears in web app after completing mobile onboarding

---

## Phase 2 — Core Features MVP
**Goal**: Full feature parity for daily-use flows.
**Duration**: Week 4–7

### Tasks

#### P2-1: Dashboard Screen
- [ ] Port health dial as `HealthDial.tsx` using `react-native-svg` arc
  - Use `getCanvasHealthScore()` from `@bluepin/core`
  - Animated score counter (react-native-reanimated)
- [ ] Glucose snapshot card (today's readings, HbA1c)
- [ ] Weight snapshot card
- [ ] Goal streak card (circular activity indicators via `react-native-svg`)
- [ ] Care reminders list (from `careReminderRules.ts`)
- [ ] Daily motivational quote (from `dailyThoughts.ts` — move to `packages/core`)
- [ ] Pull-to-refresh
- [ ] Greeting by time of day
- [ ] **Acceptance**: Dashboard matches web feature-for-feature; data syncs with web

#### P2-2: Glucose Screen
- [ ] Readings list (grouped by date, newest first)
- [ ] Line chart (Fasting / Post-Prandial / Random toggle)
  - Use `react-native-gifted-charts` LineChart
- [ ] FAB (floating action button) → opens AddGlucose bottom sheet
- [ ] AddGlucose bottom sheet:
  - Value input (number pad)
  - Timing picker (Fasting / Post-Prandial / Random)
  - Hours after eating (conditional)
  - Date/time picker (`@react-native-community/datetimepicker`)
  - Submit → Firestore write
- [ ] Delete reading (swipe-to-delete)
- [ ] HbA1c trend section
- [ ] **Acceptance**: Glucose logs created on mobile appear in web instantly

#### P2-3: Glucose OCR (Camera)
- [ ] Camera capture screen using `expo-camera`
- [ ] Upload image to `/api/upload?type=glucose_ocr`
- [ ] Parse response → pre-fill AddGlucose form with parsed value
- [ ] Confirmation screen before saving
- [ ] Fallback to manual if OCR confidence is low
- [ ] **Acceptance**: Photo of glucometer populates glucose value correctly

#### P2-4: Biomarkers / Canvas Screen
- [ ] Lab reports list (sorted by date)
- [ ] Biomarker summary header (health score, optimal/borderline/attention counts)
- [ ] Expandable report cards with biomarker rows
- [ ] Status colour coding (green/amber/red) matching web theme
- [ ] Biomarker detail (name, value, ref range, status, info)
- [ ] Delete report (swipe or long-press)
- [ ] **Acceptance**: Lab reports visible on mobile match web exactly

#### P2-5: Add Lab Report Flow
- [ ] Entry point: FAB on Biomarkers screen
- [ ] Step 1 — Source picker bottom sheet:
  - "Take Photo" → `expo-camera`
  - "Choose PDF/Image" → `expo-document-picker`
- [ ] Step 2 — Upload + OCR:
  - Multipart POST to `/api/upload`
  - Progress indicator (animated DNA loader or spinner)
- [ ] Step 3 — Review biomarkers:
  - List of extracted biomarkers
  - Edit any value before saving
  - Confirm → write `LabReport` to Firestore
- [ ] Error handling: OCR failure → show error, allow retry
- [ ] **Acceptance**: PDF uploaded from mobile → biomarkers appear in web Canvas tab

#### P2-6: Fitness / Weight Screen
- [ ] Weight log list (sorted newest first)
- [ ] Trend chart (line chart, 30-day window)
- [ ] FAB → AddWeight bottom sheet (weight input + date picker)
- [ ] BMI calculation display (from `profile.heightCm` + latest weight)
- [ ] Delete entry (swipe-to-delete)
- [ ] **Acceptance**: Weight entries sync bidirectionally with web

#### P2-7: Goals & Streaks
- [ ] Goals list screen (active goals)
- [ ] Toggle goal completion (checkbox / number input)
- [ ] Streak counter (from `calculateGoalsStreak()`)
- [ ] Weekly activity grid (7-day dots, from `getWeeklyActivity()`)
- [ ] Add / edit / archive goals
- [ ] **Acceptance**: Goal logs sync with web; streak matches

---

## Phase 3 — Native Enhancements
**Goal**: Polish, native features, notifications.
**Duration**: Week 8–10

### Tasks

#### P3-1: Push Notifications
- [ ] Request permission on first launch (after auth)
- [ ] Register FCM token via `/api/notifications/register`
- [ ] Token refresh listener (RNFB `messaging().onTokenRefresh()`)
- [ ] Foreground notification handler (show in-app banner)
- [ ] Background / quit state handler (navigate on tap)
- [ ] Local notification fallback for daily glucose reminder
- [ ] **Acceptance**: Glucose reminder push received at configured time

#### P3-2: Profile Screen
- [ ] Profile header (avatar, name, email/phone)
- [ ] Biometrics grid (age, gender, height, weight, BMI, diabetes status)
- [ ] Edit modals (native bottom sheets)
- [ ] Profile photo upload (`expo-image-picker` → Firebase Storage)
- [ ] Sign out button
- [ ] **Acceptance**: Profile edits on mobile reflected in web instantly

#### P3-3: Settings Screen
- [ ] Notifications section:
  - Toggle push notifications
  - Daily reminder time picker
  - WhatsApp reminder setup (phone number + time slot)
- [ ] Account section:
  - Change password
  - Delete account (with confirmation)
- [ ] App section:
  - Dark mode toggle (follows system by default)
  - App version display
- [ ] **Acceptance**: Notification preferences persist across sessions

#### P3-4: Dark Mode
- [ ] Theme context using `useColorScheme()` (follows system setting)
- [ ] Manual override in Settings
- [ ] All screens and components themed
- [ ] Matches web dark mode colours exactly
- [ ] **Acceptance**: App looks correct in both light and dark mode on both platforms

#### P3-5: Family Invite / Share
- [ ] Profile screen: "Invite family member" button
- [ ] Generate invite link (call existing invite API or Firestore write)
- [ ] `expo-sharing` to open native share sheet with invite link
- [ ] Accept invite via deep link `bluepin://invite?id=<inviteId>`
- [ ] **Acceptance**: Family member can join from mobile invite

#### P3-6: Haptic Feedback
- [ ] `expo-haptics` on: goal toggle, glucose save, delete confirmation
- [ ] Respects iOS system haptic settings
- [ ] **Acceptance**: Haptics fire on correct actions, can be disabled

#### P3-7: Onboarding Tour
- [ ] Custom tooltip overlay for first-time users
- [ ] Steps: Dashboard → Glucose → Canvas → Add Report
- [ ] Dismissible; writes `hasSeenDashboardTour: true` to Firestore
- [ ] **Acceptance**: Tour shown once on first login, not repeated

#### P3-8: Biometric App Lock (optional)
- [ ] `expo-local-authentication` check on app foreground
- [ ] Toggle in Settings
- [ ] Fallback to PIN/password if biometric fails
- [ ] **Acceptance**: App requires Face ID/fingerprint after 5min background

---

## Phase 4 — Store Submission
**Goal**: Ship to App Store and Google Play.
**Duration**: Week 11–12

### Tasks

#### P4-1: App Assets
- [ ] App icon (1024×1024 PNG, no alpha) — adapt from `Bluepin.png`
- [ ] Adaptive icon for Android (foreground + background layers)
- [ ] Splash screen image (2048×2048)
- [ ] Store screenshots (6.7" iPhone, 12.9" iPad, Pixel 7)
- [ ] Feature graphic (Android Play Store, 1024×500)

#### P4-2: iOS Privacy Manifest
- [ ] Create `PrivacyInfo.xcprivacy` with all used APIs declared
  - `NSUserDefaults` (AsyncStorage)
  - File timestamp APIs (expo-file-system)
  - Disk space APIs
- [ ] Required reason APIs documented
- [ ] **Acceptance**: Xcode build passes privacy manifest validation

#### P4-3: App Store Connect Setup
- [ ] Create app record on App Store Connect
- [ ] Fill app metadata (description, keywords, category: Health & Fitness)
- [ ] Health data privacy questionnaire (diabetes tracking = sensitive)
- [ ] Age rating: 4+
- [ ] `eas submit --platform ios --profile production`
- [ ] TestFlight beta → internal team QA

#### P4-4: Google Play Console Setup
- [ ] Create app on Google Play Console
- [ ] Fill store listing (description, graphics)
- [ ] Data safety questionnaire (health data, personal info)
- [ ] Content rating: Everyone
- [ ] `eas submit --platform android --profile production`
- [ ] Internal testing track → QA

#### P4-5: Final QA Checklist
- [ ] Auth: email, Google, WhatsApp magic link
- [ ] Glucose: add manual, add via OCR, delete, chart
- [ ] Reports: upload PDF, upload image, review biomarkers, delete
- [ ] Weight: add, chart, delete
- [ ] Goals: toggle, streak counter
- [ ] Dashboard: all cards render, navigation works
- [ ] Profile: edit all fields, photo upload
- [ ] Notifications: push received, local reminder fires
- [ ] Dark mode: all screens
- [ ] Offline: app loads with cached data
- [ ] Deep links: magic link, invite link
- [ ] Both platforms: Android 10+ and iOS 15+

---

## Phase 5 — Post-Launch Enhancements
**Goal**: Differentiated native features.
**Duration**: Ongoing after launch

### Backlog Items

| Item | Effort | Priority |
|---|---|---|
| HealthKit (iOS) glucose + weight import | Large | P1 |
| Health Connect (Android) glucose + weight | Large | P1 |
| Home screen widget (today's glucose + health score) | Medium | P2 |
| App rating prompt (`expo-store-review`) | Small | P2 |
| Siri shortcuts / Google Assistant | Large | P3 |
| Background fetch for reminder delivery tracking | Medium | P2 |
| In-app PDF viewer for lab reports | Medium | P2 |
| Admin feedback view (port from web) | Small | P3 |
| Accessibility audit (VoiceOver / TalkBack) | Medium | P1 |
| Crash reporting (Firebase Crashlytics) | Small | P1 |
| Performance monitoring (Firebase Perf) | Small | P2 |

---

## Milestone Summary

| Milestone | Target Date | Deliverable |
|---|---|---|
| M0: Monorepo + Expo scaffold | Week 2 | Dev build runs on simulator |
| M1: Auth complete | Week 3 | All sign-in methods work |
| M2: MVP feature complete | Week 7 | All core tabs functional |
| M3: Native enhancements | Week 10 | Push, profile, dark mode, share |
| M4: Store submission | Week 12 | TestFlight + Play internal beta |
| M5: Public launch | Week 13–14 | App Store + Play Store live |
