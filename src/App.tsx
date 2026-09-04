import React, { useState, useEffect } from "react";
import { Joyride, Step } from "react-joyride";
import {
  User,
  Orbit,
  Fingerprint,
  Eclipse,
  Hexagon,
  Home,
  Activity,
  FileText,
  Target,
  Sun,
  Moon,
  Users,
  ChevronLeft,
  ChevronRight,
  Flame,
  Droplet,
  MessageSquare,
  Shield,
} from "lucide-react";
import { cn } from "./lib/utils";
import Dashboard from "./components/Dashboard";
import GlucoseTab from "./components/GlucoseTab";
import BiomarkersTab from "./components/BiomarkersTab";
import { FeedbackWidget } from "./components/FeedbackWidget";
import { AppProvider, useAppStore } from "./store";
// import AuthScreen from "./components/AuthScreen";
import WelcomeScreen from "./components/WelcomeScreen";
import { ProfileModal } from "./components/ProfileModal";
import OnboardingScreen from "./components/OnboardingScreen";
import { auth, db } from "./lib/firebase";
import {
  onAuthStateChanged,
  getRedirectResult,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { ThemeProvider, useTheme } from "./theme";
import { LegalDocsModal } from "./components/LegalDocsModal";
import { LegalDocType } from "./lib/consentManager";
import AdminFeedbackView from "./components/AdminFeedbackView";
import { InstallPWAPrompt } from "./components/InstallPWAPrompt";
import AuthScreen from "./components/authflow/AuthScreen";

type TabType = "dashboard" | "glucose" | "biomarkers" | "admin";

function MainLayout() {
  const [activeTab, setActiveTab] = useState<TabType>("dashboard");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [openLegalDoc, setOpenLegalDoc] = useState<LegalDocType | null>(null);
  const [isWaving, setIsWaving] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const isAdmin = auth.currentUser?.email === "sparsh@bluepin.in";

  const [runTour, setRunTour] = useState(false);

  const tourSteps: Step[] = [
    {
      target: ".tour-dashboard-nav",
      content: "Welcome to Bluepin! This is your dashboard where you can see a high-level overview of your health.",
    },
    {
      target: ".tour-quick-add",
      content: "Use this action button to easily log your Weight, record Glucose levels, or upload a Health Report for analysis.",
    },
    {
      target: ".tour-glucose-nav",
      content: "View detailed charts and track your blood glucose levels over time here.",
    },
    {
      target: ".tour-canvas-nav",
      content: "Upload lab reports and get an AI-powered analysis of your biomarkers.",
    },
    {
      target: ".tour-profile-btn",
      content: "Update your details and preferences here.",
    },
  ];

  useEffect(() => {
    const showTimer = setTimeout(() => setIsWaving(true), 1500);
    const hideTimer = setTimeout(() => setIsWaving(false), 6000);
    
    // Check if tour should run
    const hasCompletedTour = localStorage.getItem("bluepin_tour_completed");
    if (!hasCompletedTour) {
      // Slight delay to ensure elements are mounted
      setTimeout(() => setRunTour(true), 500);
    }
    
    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
    };
  }, []);

  const handleJoyrideCallback = (data: any) => {
    const { status } = data;
    const finishedStatuses = ["finished", "skipped"];
    if (finishedStatuses.includes(status)) {
      setRunTour(false);
      localStorage.setItem("bluepin_tour_completed", "true");
    }
  };

  return (
    <div
      className={cn(
        "min-h-screen bg-theme-bg text-theme-text font-sans flex flex-col md:flex-row pb-20 md:pb-0 transition-all duration-300",
        isSidebarCollapsed ? "md:pl-20" : "md:pl-64",
      )}
    >
      <Joyride
        steps={tourSteps}
        run={runTour}
        continuous
        showSkipButton
        showProgress
        callback={handleJoyrideCallback}
        styles={{
          options: {
            primaryColor: '#1A73E8',
            zIndex: 10000,
          }
        }}
      />
      {/* Desktop Sidebar */}
      <aside
        className={cn(
          "hidden md:flex flex-col border-r border-theme-border bg-theme-bg pt-8 fixed top-0 bottom-0 left-0 transition-all duration-300 z-40",
          isSidebarCollapsed ? "w-20 px-2" : "w-64 px-4",
        )}
      >
        <button
          onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          className="absolute -right-3 top-9 bg-theme-card border border-theme-border text-theme-text rounded-full p-1 hover:bg-theme-card-sec z-10 transition-colors"
        >
          {isSidebarCollapsed ? (
            <ChevronRight size={14} />
          ) : (
            <ChevronLeft size={14} />
          )}
        </button>

        <div className="mb-5 px-2 flex justify-center md:justify-start items-center gap-2 overflow-hidden shrink-0">
          {isSidebarCollapsed ? (
            <img
              src="/Bluepin.png"
              alt="Bluepin Logo"
              className="w-8 h-8 object-contain scale-110"
            />
          ) : (
            <div className="flex items-center gap-3">
              <img
                src="/Bluepin.png"
                alt="Bluepin Logo"
                className="w-10 h-10 object-contain scale-110"
              />
              <h1 className="text-[30px] font-display tracking-tight text-theme-text truncate">
                <span className="font-bold">Blue</span>
                <span className="font-medium opacity-80">pin.</span>
              </h1>
            </div>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto space-y-1.5 pr-1 pb-4">
          <NavItem
            icon={<Home />}
            label="Dashboard"
            isActive={activeTab === "dashboard"}
            onClick={() => setActiveTab("dashboard")}
            isCollapsed={isSidebarCollapsed}
            colorClass="text-blue-500"
            className="tour-dashboard-nav"
          />
          <NavItem
            icon={<Droplet />}
            label="Glucose"
            isActive={activeTab === "glucose"}
            onClick={() => setActiveTab("glucose")}
            isCollapsed={isSidebarCollapsed}
            colorClass="text-red-500"
            className="tour-glucose-nav"
          />
          <NavItem
            icon={<FileText />}
            label="Health Canvas"
            isActive={activeTab === "biomarkers"}
            onClick={() => setActiveTab("biomarkers")}
            isCollapsed={isSidebarCollapsed}
            colorClass="text-emerald-500"
            className="tour-canvas-nav"
          />

          {isAdmin && (
            <NavItem
              icon={<Shield />}
              label="Admin"
              isActive={activeTab === "admin"}
              onClick={() => setActiveTab("admin")}
              isCollapsed={isSidebarCollapsed}
              colorClass="text-purple-500"
            />
          )}
        </nav>

        <div className="mt-auto pt-4 pb-8 space-y-2 shrink-0 bg-theme-bg">
          <button
            onClick={toggleTheme}
            title={
              isSidebarCollapsed
                ? theme === "dark"
                  ? "Light Mode"
                  : "Dark Mode"
                : undefined
            }
            className={cn(
              "w-full flex items-center space-x-3 py-3 rounded-xl transition-all duration-200 ease-in-out text-left text-theme-text-sec hover:bg-theme-card-sec font-medium",
              isSidebarCollapsed ? "justify-center px-0" : "px-4",
            )}
          >
            {theme === "dark" ? (
              <div className="relative flex items-center justify-center transition-transform duration-300">
                <Sun size={20} className="text-theme-text-sec" />
              </div>
            ) : (
              <div className="relative flex items-center justify-center transition-transform duration-300">
                <Moon size={20} className="text-theme-text-sec" />
              </div>
            )}
            {!isSidebarCollapsed && (
              <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
            )}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 max-w-5xl mx-auto w-full p-4 md:p-8 overflow-y-auto relative">
        <div className="hidden md:flex absolute top-6 right-8 gap-3 z-30">
          <FeedbackWidget
            trigger={
              <div className="relative group flex items-center">
                <div
                  className={cn(
                    "absolute top-full right-0 mt-3 whitespace-nowrap bg-theme-bg border border-theme-border text-theme-text px-3 py-1.5 rounded-xl shadow-lg text-xs font-medium transition-all duration-300 pointer-events-none z-50",
                    "opacity-0 -translate-y-2 group-hover:opacity-100 group-hover:translate-y-0",
                  )}
                >
                  Talk to the founder
                  <div className="absolute -top-1.25 right-3.5 w-2.5 h-2.5 bg-theme-bg border-l border-t border-theme-border transform rotate-45"></div>
                </div>
                <button className="w-10 h-10 bg-theme-card border border-theme-border rounded-full flex items-center justify-center text-theme-text hover:bg-theme-card-sec transition-colors shadow-sm">
                  <div
                    className={cn(
                      "text-xl group-hover:scale-110 transition-transform duration-300 relative",
                      isWaving
                        ? "animate-[wave_2.5s_ease-in-out_infinite] origin-bottom-right"
                        : "",
                    )}
                  >
                    👋
                  </div>
                </button>
              </div>
            }
          />
          <button
            onClick={() => setShowProfile(true)}
            className="tour-profile-btn w-10 h-10 bg-theme-card border border-theme-border rounded-full flex items-center justify-center text-theme-text hover:bg-theme-card-sec transition-colors shadow-sm group"
          >
            <div className="relative flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
              <Hexagon
                size={24}
                className="absolute text-theme-text opacity-50 group-hover:opacity-100 group-hover:text-blue-400 transition-colors"
              />
              <Fingerprint
                size={16}
                className="text-theme-text group-hover:text-blue-400 transition-colors"
              />
            </div>
          </button>
        </div>

        {/* Mobile Header */}
        <div className="md:hidden flex items-center justify-between mb-5 pt-1 pb-2 border-b border-theme-border">
          <div className="flex items-center gap-2">
            <img
              src="/Bluepin.png"
              alt="Bluepin Logo"
              className="w-8 h-8 object-contain scale-110"
            />
            <h1 className="text-[26px] font-display tracking-tight text-theme-text">
              <span className="font-bold">Blue</span>
              <span className="font-medium opacity-80">pin.</span>
            </h1>
          </div>
          <div className="flex items-center gap-2 relative">
            <FeedbackWidget
              trigger={
                <div className="relative group flex items-center">
                  <div
                    className={cn(
                      "absolute top-full right-0 mt-2 whitespace-nowrap bg-theme-bg border border-theme-border text-theme-text px-3 py-1.5 rounded-xl shadow-lg text-xs font-medium transition-all duration-300 pointer-events-none z-50",
                      "opacity-0 -translate-y-2 group-hover:opacity-100 group-hover:translate-y-0",
                    )}
                  >
                    Talk to the founder
                    <div className="absolute -top-1.25 right-3.5 w-2.5 h-2.5 bg-theme-bg border-l border-t border-theme-border transform rotate-45"></div>
                  </div>
                  <button className="text-theme-text-sec p-2">
                    <div
                      className={cn(
                        "text-xl hover:scale-110 transition-transform duration-300 relative",
                        isWaving
                          ? "animate-[wave_2.5s_ease-in-out_infinite] origin-bottom-right"
                          : "",
                      )}
                    >
                      👋
                    </div>
                  </button>
                </div>
              }
            />
            <button
              onClick={toggleTheme}
              className="text-theme-text-sec p-2 group"
            >
              {theme === "dark" ? (
                <div className="relative flex items-center justify-center transition-transform duration-300">
                  <Sun size={20} className="text-theme-text-sec" />
                </div>
              ) : (
                <div className="relative flex items-center justify-center transition-transform duration-300">
                  <Moon size={20} className="text-theme-text-sec" />
                </div>
              )}
            </button>
            <button
              onClick={() => setShowProfile(true)}
              className="tour-profile-btn text-theme-text-sec p-2 group"
            >
              <div className="relative flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                <Hexagon
                  size={24}
                  className="absolute text-theme-text opacity-50 group-hover:opacity-100 group-hover:text-blue-400 transition-colors"
                />
                <Fingerprint
                  size={16}
                  className="text-theme-text group-hover:text-blue-400 transition-colors"
                />
              </div>
            </button>
          </div>
        </div>

        {activeTab === "dashboard" && (
          <Dashboard onNavigate={(tab: TabType) => setActiveTab(tab)} />
        )}
        {activeTab === "glucose" && <GlucoseTab />}
        {activeTab === "biomarkers" && <BiomarkersTab />}

        {activeTab === "admin" && isAdmin && <AdminFeedbackView />}
        <footer className="mt-12 pt-8 pb-4 border-t border-theme-border/50 text-center text-xs text-theme-text-sec flex flex-wrap justify-center gap-4">
          <button
            onClick={() => setOpenLegalDoc("terms")}
            className="hover:text-theme-text transition-colors"
          >
            Terms of Service
          </button>
          <button
            onClick={() => setOpenLegalDoc("privacy")}
            className="hover:text-theme-text transition-colors"
          >
            Privacy Policy
          </button>
        </footer>
        {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}
      </main>
      <LegalDocsModal
        isOpen={!!openLegalDoc}
        onClose={() => setOpenLegalDoc(null)}
        defaultTab={openLegalDoc || "terms"}
      />
      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-theme-card border-t border-theme-border z-50 flex justify-around p-2 pb-safe transition-colors duration-300">
        <MobileNavItem
          icon={<Home size={20} />}
          label="Dash"
          isActive={activeTab === "dashboard"}
          onClick={() => setActiveTab("dashboard")}
          colorClass="text-blue-500"
          className="tour-dashboard-nav"
        />
        <MobileNavItem
          icon={<Droplet size={20} />}
          label="Glucose"
          isActive={activeTab === "glucose"}
          onClick={() => setActiveTab("glucose")}
          colorClass="text-red-500"
          className="tour-glucose-nav"
        />
        <MobileNavItem
          icon={<FileText size={20} />}
          label="Canvas"
          isActive={activeTab === "biomarkers"}
          onClick={() => setActiveTab("biomarkers")}
          colorClass="text-emerald-500"
          className="tour-canvas-nav"
        />
        {isAdmin && (
          <MobileNavItem
            icon={<Shield size={20} />}
            label="Admin"
            isActive={activeTab === "admin"}
            onClick={() => setActiveTab("admin")}
            colorClass="text-purple-500"
          />
        )}
      </nav>
      <InstallPWAPrompt />
    </div>
  );
}

function NavItem({
  icon,
  label,
  isActive,
  onClick,
  isCollapsed,
  colorClass,
  className,
}: {
  icon: React.ReactNode;
  label: string;
  isActive: boolean;
  onClick: () => void;
  isCollapsed?: boolean;
  colorClass?: string;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={isCollapsed ? label : undefined}
      className={cn(
        "w-full flex items-center space-x-3 py-3 rounded-xl transition-all duration-200 ease-in-out text-left",
        isCollapsed ? "justify-center px-0" : "px-4",
        isActive
          ? "bg-theme-card-sec text-theme-text font-medium"
          : "text-theme-text-sec hover:bg-theme-card-sec hover:text-theme-text",
        className
      )}
    >
      <span
        className={cn(
          "transition-colors duration-300",
          isActive ? colorClass || "text-theme-text" : "text-theme-text-sec",
        )}
      >
        {icon}
      </span>
      {!isCollapsed && <span>{label}</span>}
    </button>
  );
}

function MobileNavItem({
  icon,
  label,
  isActive,
  onClick,
  colorClass,
  className,
}: {
  icon: React.ReactNode;
  label: string;
  isActive: boolean;
  onClick: () => void;
  colorClass?: string;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-center justify-center space-y-1 w-16 py-1 transition-colors",
        isActive ? "text-theme-text" : "text-theme-text-sec",
        className
      )}
    >
      <span
        className={cn(
          "transition-colors duration-300",
          isActive ? colorClass || "text-theme-text" : "text-theme-text-sec",
        )}
      >
        {icon}
      </span>
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  );
}

function AppContent() {
  const [sessionUser, setSessionUser] = useState<any>(undefined);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [showWelcome, setShowWelcome] = useState(() => {
    try {
      return localStorage.getItem("bluepin_welcome_seen") !== "true";
    } catch {
      return true;
    }
  });
  const [authError, setAuthError] = useState<string | null>(null);
  const [authTimedOut, setAuthTimedOut] = useState(false);

  const handleStartWelcome = () => {
    try {
      localStorage.setItem("bluepin_welcome_seen", "true");
    } catch {}
    setShowWelcome(false);
  };

  useEffect(() => {
    // Handle redirect sign-in results (e.g. mobile standalone PWA)
    getRedirectResult(auth).catch((err) => {
      if (err.code !== "auth/redirect-cancelled-by-user") {
        console.error("Redirect result error:", err);
      }
    });

    const timer = setTimeout(() => {
      setAuthTimedOut(true);
    }, 8000);

    const unsub = onAuthStateChanged(
      auth,
      async (u) => {
        clearTimeout(timer);
        setAuthTimedOut(false);
        setAuthError(null);
        if (u) {
          try {
            localStorage.setItem("bluepin_welcome_seen", "true");
          } catch {}
          try {
            const docRef = doc(db, "users", u.uid);
            const docSnap = await getDoc(docRef);
            setNeedsOnboarding(!docSnap.exists() || !docSnap.data()?.name);
          } catch (e: any) {
            console.error("Firestore user doc fetch error:", e);
            setNeedsOnboarding(true);
          }
        }
        setSessionUser(u);
      },
      (error) => {
        clearTimeout(timer);
        setAuthError(error.message || "Failed to initialize authentication.");
        setSessionUser(null);
      },
    );

    return () => {
      clearTimeout(timer);
      unsub();
    };
  }, []);

  if (sessionUser === undefined) {
    if (authTimedOut || authError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-theme-bg text-theme-text relative">
          <div className="max-w-sm w-full bg-theme-card border border-theme-border rounded-2xl p-6 text-center shadow-lg">
            <div className="w-12 h-12 rounded-full bg-amber-500/10 text-amber-500 mx-auto flex items-center justify-center mb-4">
              <Shield size={24} />
            </div>
            <h2 className="text-lg font-bold mb-2">Connection Timeout</h2>
            <p className="text-sm text-theme-text-sec mb-6 leading-relaxed">
              {authError ||
                "Unable to reach authentication services. Please check your internet connection and try again."}
            </p>
            <div className="space-y-3">
              <button
                onClick={() => window.location.reload()}
                className="w-full bg-[#1A73E8] hover:bg-[#1557B0] text-white font-medium py-3 rounded-xl transition-all shadow-sm"
              >
                Retry
              </button>
              <button
                onClick={() => {
                  setAuthTimedOut(false);
                  setSessionUser(null);
                }}
                className="w-full bg-theme-card border border-theme-border hover:bg-theme-card-sec text-theme-text-sec text-sm font-medium py-2.5 rounded-xl transition-colors"
              >
                Continue to Sign In
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-theme-bg text-theme-text gap-4 relative">
        <img
          src="/Bluepin.png"
          alt="Bluepin Logo"
          className="w-12 h-12 object-contain animate-pulse"
        />
        <p className="text-sm text-theme-text-sec font-medium">
          Loading Bluepin...
        </p>
      </div>
    );
  }

  if (sessionUser === null) {
    // WelcomeScreen is now handled by the separate marketing site (bluepin.in)
    // if (showWelcome) {
    //   return <WelcomeScreen onStart={handleStartWelcome} />;
    // }
    return <AuthScreen />;
  }

  if (needsOnboarding) {
    return <OnboardingScreen onComplete={() => setNeedsOnboarding(false)} />;
  }

  return (
    <AppProvider>
      <MainLayout />
    </AppProvider>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}
