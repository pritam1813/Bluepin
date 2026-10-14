# Bluepin Mobile — UI Design Guide

> Documents the native-specific UI decisions and component mapping from web to mobile.
> Companion to [MOBILE_APP_PLAN.md](./MOBILE_APP_PLAN.md).

---

## 1. Design Philosophy

The mobile app **does not clone the web UI pixel-for-pixel**. Instead, it follows platform conventions while preserving:
- **Same colour tokens** (blues, purples, greens, ambers, reds for health scores)
- **Same typography scale** (Inter for body, display font for large numbers)
- **Same information hierarchy** (what's important on web is important on mobile)
- **Same interaction patterns** where they translate (e.g. tapping a card to navigate)

---

## 2. Colour System

The web uses CSS custom properties. The mobile theme context maps them identically:

| Token | Light | Dark | Usage |
|---|---|---|---|
| `bg` | `#ffffff` | `#0f0f13` | Screen background |
| `card` | `#f8f9fa` | `#1a1a22` | Card backgrounds |
| `text` | `#0d0d0d` | `#f0f0f0` | Primary text |
| `textSec` | `#6b7280` | `#9ca3af` | Secondary / labels |
| `border` | `#e5e7eb` | `#2a2a38` | Dividers, card borders |
| `accent` | `#3b82f6` | `#60a5fa` | Primary action colour (blue) |

**Health score colours** (from `scoreColor.ts`, shared via `packages/core`):
| Status | Colour |
|---|---|
| Healthy / Optimal | `#10b981` (emerald-500) |
| Borderline | `#f59e0b` (amber-500) |
| Needs Attention | `#ef4444` (red-500) |
| No data | `#6b7280` (gray-500) |

---

## 3. Typography

| Role | Font | Size | Weight |
|---|---|---|---|
| Large numbers (health score, glucose) | Inter (display) | 40sp / 48sp | 500 (Medium) |
| Screen titles | Inter | 28sp | 700 (Bold) |
| Section headers | Inter | 17sp | 700 (Bold) |
| Body / labels | Inter | 14–15sp | 400–600 |
| Captions / meta | Inter | 12sp | 500 |

---

## 4. Component Mapping (Web → Mobile)

### 4.1 Layout Components

| Web | Mobile Equivalent |
|---|---|
| `AppShell` (flex row desktop + mobile) | `AppTabs` (Bottom Tab Navigator) |
| `DesktopSidebar` | Not applicable (no desktop view) |
| `MobileBottomNav` | React Navigation Bottom Tab Bar (customised) |
| `MobileHeader` | React Navigation native header OR custom |
| `AppFooter` | Not applicable (legal docs accessible via Profile) |

### 4.2 Dashboard Components

| Web Component | Mobile Equivalent | Notes |
|---|---|---|
| `DashboardHealthDial` | `HealthDial` (react-native-svg) | Port arc-drawing logic |
| Health score stats row | Same layout, `View` + `Text` | Direct port |
| Glucose snapshot card | `GlucoseSnapshotCard` native | Tappable → Glucose tab |
| Weight card | `WeightCard` native | Tappable → Fitness tab |
| `ActivityCircle` | `ActivityCircle` (RN SVG) | Port from web |
| Goal streak banner | `GoalStreakBanner` | Week dots + streak count |
| Care reminders list | `CareRemindersList` | Tappable rows → relevant tab |
| Daily quote | `DailyQuoteText` | Single text component |
| Quick Add (FAB + options) | Speed dial FAB (react-native-paper or custom) | Three options: glucose, weight, report |

### 4.3 Glucose Components

| Web Component | Mobile Equivalent |
|---|---|
| `AddGlucoseModal` | `AddGlucoseSheet` (bottom sheet) |
| Glucose chart (recharts) | `GlucoseChart` (react-native-gifted-charts) |
| Glucose readings list | `FlatList` with date grouping |
| Timing filter tabs | Segmented control (iOS) / custom tabs (Android) |

### 4.4 Biomarkers Components

| Web Component | Mobile Equivalent |
|---|---|
| `AddReportFlow` | `AddReportFlow` (multi-screen stack) |
| Lab reports accordion | `SectionList` with collapsible sections |
| Biomarker row | `BiomarkerRow` (native text + status dot) |
| DNA loading animation | `DnaLoader` (reanimated Lottie or SVG) |

### 4.5 Modal → Bottom Sheet Pattern

All modals on web become **bottom sheets** on mobile using `@gorhom/bottom-sheet`:

| Web Modal | Mobile Bottom Sheet |
|---|---|
| `AddGlucoseModal` | `AddGlucoseSheet` (snap points: 50%, 90%) |
| `AddWeightModal` | `AddWeightSheet` (snap: 40%) |
| `ProfileModal` → full screen | Full `ProfileScreen` in tab stack |
| `WhatsAppModal` | `WhatsAppSetupScreen` in settings stack |
| `LegalDocsModal` | `LegalDocsScreen` (full screen stack) |
| `NotificationsModal` | `NotificationsScreen` in settings stack |

---

## 5. Navigation Patterns

### Bottom Tab Bar

4 tabs (icons + labels):

| Tab | Icon | Label | Colour |
|---|---|---|---|
| Dashboard | Home | Dash | Blue (`#3b82f6`) |
| Glucose | Droplet | Glucose | Red (`#ef4444`) |
| Canvas | FileText | Canvas | Emerald (`#10b981`) |
| Fitness | Activity | Fitness | Orange (`#f97316`) |

Profile accessible via avatar icon in header (all tabs).

### Tab Bar Styling

```tsx
// Custom tab bar appearance
tabBarStyle: {
  backgroundColor: theme.card,
  borderTopColor: theme.border,
  height: 84,  // includes safe area
  paddingBottom: insets.bottom,
}
```

### iOS vs Android Differences

| Element | iOS | Android |
|---|---|---|
| Tab bar position | Bottom | Bottom |
| Back button | Native `<` chevron | Material back arrow |
| Long press | Context menu (UIContextMenuInteraction) | Ripple + long press menu |
| Date picker | Native wheel picker | Material date picker |
| Alert dialogs | UIAlertController style | Material AlertDialog |
| Status bar | Light/dark content auto | Transparent with icons |

---

## 6. Screen-by-Screen UI Specs

### 6.1 Dashboard Screen

```
┌─────────────────────────────┐
│  [avatar]        Bluepin.   │  ← Header bar
├─────────────────────────────┤
│  Good morning :)            │  ← Greeting (28sp bold)
│  "motivational quote here"  │  ← Quote (14sp, secondary)
├─────────────────────────────┤
│  ┌───────────────────────┐  │
│  │    Health Dial        │  │  ← SVG arc, score number
│  │     [  82  ]          │  │
│  │  12 opt · 2 brd · 0 ↑ │  │  ← Stats row
│  └───────────────────────┘  │
├─────────────────────────────┤
│  Care Reminders •           │  ← Amber dot, section header
│  ┌───────────────────────┐  │
│  │ Log your glucose  ›   │  │  ← Tappable row
│  │─────────────────────  │  │
│  │ Upload a report   ›   │  │
│  └───────────────────────┘  │
├─────────────────────────────┤
│  ┌────────┐  ┌───────────┐  │
│  │Glucose │  │  HbA1c    │  │  ← Two-column card
│  │ 98     │  │  5.8%     │  │
│  │mg/dL   │  │2 today    │  │
│  └────────┘  └───────────┘  │
├─────────────────────────────┤
│  Weight        🔒 pin icon  │
│  ┌───────────────────────┐  │
│  │ 73.2 kg     ↓ 0.5%   │  │
│  └───────────────────────┘  │
└─────────────────────────────┘
        [D] [💧] [📋] [🏃]     ← Tab bar
```

### 6.2 Glucose Screen

```
┌─────────────────────────────┐
│  ← Glucose                  │
├─────────────────────────────┤
│  [Fasting] [Post] [Random]  │  ← Segmented control
├─────────────────────────────┤
│  ┌───────────────────────┐  │
│  │   Line chart          │  │  ← 30-day trend
│  │   ___/‾\_/‾‾          │  │
│  └───────────────────────┘  │
├─────────────────────────────┤
│  Today                      │
│  ┌───────────────────────┐  │
│  │ Fasting  98 mg/dL  ←  │  │  ← Swipe to delete
│  │ Post     142 mg/dL ←  │  │
│  └───────────────────────┘  │
│  Yesterday                  │
│  ...                        │
├─────────────────────────────┤
│                        [+]  │  ← FAB
└─────────────────────────────┘
```

### 6.3 Add Glucose Bottom Sheet

```
┌─────────────────────────────┐
│  ——————  (drag handle)      │
│  Add Glucose Reading        │
│  ─────────────────────────  │
│  Value (mg/dL)              │
│  ┌─────────────────────┐    │
│  │       98            │    │  ← Large number input
│  └─────────────────────┘    │
│                             │
│  Timing                     │
│  ○ Fasting  ● Post  ○ Random│
│                             │
│  [Hours after eating: 2h]   │  ← Conditional
│                             │
│  Date & Time                │
│  [Today, 09:30 AM  ▾]       │
│                             │
│  ┌─────────────────────┐    │
│  │   Add Reading       │    │  ← Primary button
│  └─────────────────────┘    │
│                             │
│  [📷 Scan glucometer]       │  ← OCR shortcut
└─────────────────────────────┘
```

### 6.4 Canvas (Biomarkers) Screen

```
┌─────────────────────────────┐
│  ← Canvas                   │
├─────────────────────────────┤
│  Health Score: 82           │
│  ● 12 Opt  ● 2 Bdl  ● 0 Att│
├─────────────────────────────┤
│  ▼ Lipid Panel   (Oct 2026) │  ← Expandable section
│    Total Chol  182  ✓ Opt   │
│    LDL         98   ✓ Opt   │
│    HDL         52   ✓ Opt   │
│    Trigly.     142  ● Bdr   │
├─────────────────────────────┤
│  ▶ Blood Sugar  (Oct 2026)  │  ← Collapsed section
├─────────────────────────────┤
│  ▶ Complete Blood Count     │
│                             │
│                        [+]  │  ← FAB (Add Report)
└─────────────────────────────┘
```

### 6.5 Profile Screen

```
┌─────────────────────────────┐
│  Profile                    │
├─────────────────────────────┤
│      [avatar 80px]          │
│      Riya Sharma            │
│      riya@email.com         │
│      [Edit Photo]           │
├─────────────────────────────┤
│  Biometrics                 │
│  ┌──────┬──────┬──────┐     │
│  │ 28   │  F   │ 165  │     │
│  │ Age  │Gender│ Ht   │     │
│  ├──────┼──────┼──────┤     │
│  │ 73.2 │ 26.9 │ Pre  │     │
│  │ Wt   │ BMI  │ Diab │     │
│  └──────┴──────┴──────┘     │
├─────────────────────────────┤
│  Notifications          ›   │
│  WhatsApp Reminders     ›   │
│  Legal & Privacy        ›   │
│  Delete Account         ›   │
│  Sign Out               ›   │
└─────────────────────────────┘
```

---

## 7. Animation Specs

| Interaction | Animation | Library |
|---|---|---|
| Tab switch | Fade + slight scale | RN built-in |
| Bottom sheet open | Spring up from bottom | react-native-reanimated |
| Health dial fill | Arc draw on mount (800ms) | react-native-reanimated |
| Goal toggle | Bounce + checkmark draw | react-native-reanimated |
| Card tap | Scale down 0.97 + opacity | react-native-reanimated |
| Delete confirmation | Slide left | react-native-reanimated |
| Score number count-up | Linear interpolation (600ms) | react-native-reanimated |
| Loading (DNA/spinner) | Rotation loop | react-native-reanimated or Lottie |

---

## 8. Accessibility

| Requirement | Implementation |
|---|---|
| Screen reader labels | `accessibilityLabel` on all interactive elements |
| VoiceOver / TalkBack | All icons have text equivalents |
| Minimum touch target | 44×44pt minimum (Apple HIG + Material) |
| Colour contrast | All text meets WCAG AA (4.5:1 minimum) |
| Dynamic type | Text scales with system font size settings |
| Reduced motion | Check `AccessibilityInfo.isReduceMotionEnabled` and skip animations |

---

## 9. Platform-Specific Notes

### iOS

- Use `UIBlurEffect` style background for bottom sheet backdrop
- Tab bar uses `translucent` with blur effect
- Date/time pickers use native wheel style
- Health data prompts follow HealthKit permission UX guidelines
- App icons follow Apple guidelines (no alpha, rounded by OS)

### Android

- Material 3 colour scheme layered on top of Bluepin theme
- Status bar transparent, icons adapt to background
- Bottom sheet uses Material's `BottomSheetDialog` backing via Reanimated
- Adaptive icons with foreground + monochrome layers
- Edge-to-edge display (handle insets with `react-native-safe-area-context`)
