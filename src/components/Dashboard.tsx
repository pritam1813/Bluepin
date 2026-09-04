import { ActivityCircle, emojiToStatus } from './ActivityCircle';
import { AddWeightModal } from './AddWeightModal';
import { WeightCard } from './WeightCard';
import { AddGlucoseModal } from './GlucoseTab';
import { AddReportFlow } from './AddReportFlow';
import { motion, AnimatePresence } from 'motion/react';
import React, { useMemo, useState, useEffect } from 'react';
import getCareReminders from '../careReminderRules';
import { useAppStore } from '../store';
import { Pin, Target, Hexagon, Circle, X, FileText, ChevronRight, ChevronDown, Droplet, Plus, ArrowUp, ArrowDown, Users, Check, Activity, HeartPulse, User, Flame } from 'lucide-react';
import { parseISO, isAfter, subDays } from 'date-fns';
import { cn, safeFormat } from '../lib/utils';
import { TIER_1, calculateStatus, isCoreBiomarkerPresent, getCoreBiomarkersByCategory, hydrateBiomarker } from '../lib/biomarkerUtils';
import { getHydratedBiomarkers, getDashboardMetrics, sortLabReports, getCanvasHealthScore } from '../lib/derivedMetrics';
import { auth } from '../lib/firebase';

import { DashboardHealthDial } from './DashboardHealthDial';
import { getDailyDashboardQuote } from './dailyThoughts';


import { calculateGoalsStreak, getWeeklyActivity } from "../lib/goalUtils";

export default function Dashboard({ onNavigate }: { onNavigate: (tab: any) => void }) {
 const { profile, glucoseReadings, labReports, weightEntries, goals, goalLogs, addWeightEntry, addGlucoseReading, familySummaries } = useAppStore();
 const currentUserId = auth.currentUser?.uid;
   const isGlucoseTracking = true;
  
  const [pinnedSection, setPinnedSection] = useState<'health'|'glucose'|'weight'>(() => (localStorage.getItem('pinnedSection') as any) || 'health');

  useEffect(() => {
    localStorage.setItem('pinnedSection', pinnedSection);
  }, [pinnedSection]);

  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [showAllReminders, setShowAllReminders] = useState(false);
  const [quickAddAction, setQuickAddAction] = useState<'none'|'report'|'glucose'|'weight'>('none');

 const dailyThought = useMemo(() => {
   return getDailyDashboardQuote();
 }, []);

 const greeting = useMemo(() => {
 const hour = new Date().getHours();
 if (hour < 12) return 'Good morning';
 if (hour < 18) return 'Good afternoon';
 return 'Good evening';
 }, []);

 
 

 // --- Snapshot Data ---
 const sortedReports = useMemo(() => sortLabReports(labReports), [labReports]);

 
 const { score, prevScore, needsAttention, highLowCount, borderlineCount, latestBiomarkers: allBiomarkersLatest } = useMemo(() => {
    return getCanvasHealthScore(sortedReports);
  }, [sortedReports]);

  const { missingCoreCount, optimalCount } = useMemo(() => {
    const availableNames = allBiomarkersLatest ? allBiomarkersLatest.map(b => b.biomarkerId || b.name) : [];
    let missingCount = 0;
    Object.entries(getCoreBiomarkersByCategory()).forEach(([category, markers]) => {
      missingCount += markers.filter(m => !isCoreBiomarkerPresent(m, availableNames)).length;
    });
    return {
      missingCoreCount: missingCount,
      optimalCount: (allBiomarkersLatest ? allBiomarkersLatest.length : 0) - ((highLowCount||0) + (borderlineCount||0))
    };
  }, [allBiomarkersLatest, highLowCount, borderlineCount]);


 const scoreDiff = score !== null && prevScore !== null ? score - prevScore : 0;

 // --- Today's Goals ---
 const [nextUpIndex, setNextUpIndex] = useState(0);
 const [isHoveringGoals, setIsHoveringGoals] = useState(false);

 const todayStr = safeFormat(new Date(), 'yyyy-MM-dd');
 const activeGoalsToday = goals.filter(g => g.isActive);
 const todayLogs = goalLogs[todayStr] || {};
 const completedGoalsToday = activeGoalsToday.filter(g => todayLogs[g.id]?.completed);
 const incompleteGoals = activeGoalsToday.filter(g => !todayLogs[g.id]?.completed);

 useEffect(() => {
 if (incompleteGoals.length <= 1 || isHoveringGoals) return;
 
 const interval = setInterval(() => {
 setNextUpIndex(prev => (prev + 1) % incompleteGoals.length);
 }, 3000);
 return () => clearInterval(interval);
 }, [incompleteGoals.length, isHoveringGoals]);

 useEffect(() => {
 if (incompleteGoals.length > 0 && nextUpIndex >= incompleteGoals.length) {
 setNextUpIndex(0);
 }
 }, [incompleteGoals.length, nextUpIndex]);

 const currentNextUpGoal = incompleteGoals[nextUpIndex];

 // --- Care Reminders ---
  
  const activeReminders = useMemo(() => {
    return getCareReminders({
      healthScore: score || null,
      glucoseTrackingEnabled: isGlucoseTracking,
      glucoseReadings: glucoseReadings.map(r => ({ timestamp: `${r.date}T${r.time || '00:00'}:00`, timing: r.timing as any })),
      weightLogs: weightEntries.map(w => ({ timestamp: w.date })),
      healthReports: labReports.map(r => ({ uploadedAt: r.date }))
    });
  }, [score, isGlucoseTracking, glucoseReadings, weightEntries, labReports]);

  const remindersRef = React.useRef<HTMLElement>(null);
  const [hasSeenReminders, setHasSeenReminders] = useState(false);
  const [showNotifierReady, setShowNotifierReady] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShowNotifierReady(true), 2000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!remindersRef.current || activeReminders.length === 0 || hasSeenReminders) return;
    
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        setHasSeenReminders(true);
        observer.disconnect();
      }
    }, { threshold: 0.1 });

    observer.observe(remindersRef.current);

    return () => observer.disconnect();
  }, [activeReminders.length, hasSeenReminders]);


    
  const hba1cReadings = useMemo(() => {
    return [...labReports]
      .filter(r => r.biomarkers.some(b => hydrateBiomarker(b).biomarkerId === 'hba1c'))
      .map(r => {
        const bRaw = r.biomarkers.find(x => hydrateBiomarker(x).biomarkerId === 'hba1c'); const b = bRaw ? hydrateBiomarker(bRaw) : null;
        return {
          id: r.id,
          date: r.date,
          time: '00:00',
          value: b!.value,
          timing: 'HbA1c'
        };
      })
      .sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [labReports]);

  const latestHba1c = hba1cReadings.length > 0 ? hba1cReadings[hba1cReadings.length - 1] : null;

  const uniqueGlucoseReadings = useMemo(() => {
    const sorted = [...glucoseReadings].sort((a,b) => b.createdAt - a.createdAt);
    const seen = new Set();
    const unique = [];
    for (const r of sorted) {
      const key = `${r.date}-${r.timing}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(r);
      }
    }
    return unique.sort((a,b) => new Date(`${b.date}T${b.time || '00:00'}`).getTime() - new Date(`${a.date}T${a.time || '00:00'}`).getTime());
  }, [glucoseReadings]);

  const todayUniqueReadings = useMemo(() => {
    const todayStr = safeFormat(new Date(), 'yyyy-MM-dd');
    return uniqueGlucoseReadings.filter(r => r.date === todayStr);
  }, [uniqueGlucoseReadings]);

  // --- Glucose Snapshot ---
  const glucoseSnapshot = useMemo(() => {
    if (!isGlucoseTracking) return null;
    if (glucoseReadings.length === 0) return { hasRecent: false };

    // Get unique readings
    const seen = new Set();
    const uniqueGlucoseReadings = glucoseReadings.filter(r => {
      const key = `${r.date}-${r.time}-${r.timing}-${r.value}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const now = new Date();

    const getGraphDataForTypeAndWindow = (type, daysAgo) => {
      const rawReadings = uniqueGlucoseReadings.filter(r => r.timing === type);
      const limitDate = subDays(now, daysAgo);
      
      const filtered = rawReadings.filter(r => {
        try {
          return r.date ? isAfter(parseISO(r.date), limitDate) : false;
        } catch { return false; }
      });

      const grouped = new Map();
      filtered.forEach(r => {
        const ts = new Date(`${r.date}T${r.time || '00:00'}`).getTime();
        const existing = grouped.get(r.date);
        if (!existing || ts > existing.timestamp) {
          grouped.set(r.date, { ...r, timestamp: ts });
        }
      });
      
      return Array.from(grouped.values()).sort((a, b) => a.timestamp - b.timestamp);
    };

    const getStats = (items) => {
      if (items.length === 0) return null;
      const values = items.map(r => r.value);
      const sum = values.reduce((a, b) => a + b, 0);
      return {
        avg: Math.round((sum / values.length) * 10) / 10,
        count: values.length
      };
    };

    // Priority: Fasting, Post-Prandial, Random
    let selectedType = null;
    let recentStats = null;
    let previousStats = null;

    const tryType = (type) => {
      const recentItems = getGraphDataForTypeAndWindow(type, 7);
      if (recentItems.length > 0) {
        selectedType = type;
        recentStats = getStats(recentItems);
        
        // previous 7 days (from 14 days ago to 7 days ago)
        const fourteenItems = getGraphDataForTypeAndWindow(type, 14);
        const previousItems = fourteenItems.filter(item => {
          const limitDate = subDays(now, 7);
          return !isAfter(parseISO(item.date), limitDate);
        });
        
        previousStats = getStats(previousItems);
        return true;
      }
      return false;
    };

    if (!tryType('Fasting') && !tryType('Post-Prandial') && !tryType('Random')) {
      return { hasRecent: false };
    }

    return {
      hasRecent: true,
      type: selectedType,
      recentAvg: recentStats.avg,
      previousAvg: previousStats ? previousStats.avg : null,
      recentCount: recentStats.count
    };
  }, [glucoseReadings, isGlucoseTracking]);

  // --- Weight Snapshot ---
  const weightSnapshot = useMemo(() => {
    if (!weightEntries || weightEntries.length === 0) return null;
    
    // Entries should be sorted chronologically by date
    const sortedEntries = [...weightEntries].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const latestEntry = sortedEntries[sortedEntries.length - 1];
    
    const today = new Date();
    const sevenDaysAgo = subDays(today, 7);
    const fourteenDaysAgo = subDays(today, 14);
    
    const previousWeekEntries = sortedEntries.filter(e => {
      try {
        const d = parseISO(e.date);
        return d > fourteenDaysAgo && d <= sevenDaysAgo;
      } catch {
        return false;
      }
    });
    
    let trend = null;
    if (previousWeekEntries.length > 0) {
      const avgPrevWeek = previousWeekEntries.reduce((sum, e) => sum + e.weight, 0) / previousWeekEntries.length;
      const diff = latestEntry.weight - avgPrevWeek;
      const pct = (diff / avgPrevWeek) * 100;
      if (Math.abs(diff) >= 0.1) {
        trend = {
           pct: Math.abs(pct),
           direction: diff > 0 ? 'up' : 'down'
        };
      }
    }
    
    return {
      latest: latestEntry,
      trend,
    };
  }, [weightEntries]);

    const { currentStreak } = calculateGoalsStreak(goals, goalLogs);
  const weeklyActivity = getWeeklyActivity(goals, goalLogs);

  
  const careRemindersNode = (
<section ref={remindersRef} className="mt-8 relative">
          <div className="flex items-center justify-between px-2 mb-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-amber-400 dark:bg-amber-500 shadow-[0_0_8px_rgba(251,191,36,0.6)]" style={{ animation: 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite' }} />
              <h2 className="text-[17px] font-bold text-theme-text">Care Reminders</h2>
            </div>
            {activeReminders.length > 0 && (
              <span className="text-[12px] font-medium text-theme-text-sec/60">{activeReminders.length}</span>
            )}
          </div>
          
          <div className="bg-theme-card border border-theme-border/50 rounded-[20px] overflow-hidden shadow-sm">
            {activeReminders.length > 0 ? (
              <div className="flex flex-col">
                {(showAllReminders ? activeReminders : activeReminders.slice(0, 3)).map((reminder, idx) => (
                  <div 
                    key={reminder.id}
                    onClick={() => {
                      if (reminder.action === 'log_glucose') onNavigate('glucose');
                      else if (reminder.action === 'log_weight') onNavigate('fitness');
                      else if (reminder.action === 'upload_report') onNavigate('biomarkers');
                    }}
                    className={cn(
                      "flex items-start sm:items-center justify-between p-3.5 sm:px-4 sm:py-3 cursor-pointer hover:bg-theme-bg/50 transition-colors group",
                      idx < (showAllReminders ? activeReminders.length : Math.min(activeReminders.length, 3)) - 1 ? "border-b border-theme-border/20" : ""
                    )}
                  >
                    <div className="flex flex-col pr-4">
                      <h3 className="text-[14px] font-semibold text-theme-text leading-tight mb-0.5">{reminder.title}</h3>
                      <p className="text-[12px] font-normal text-theme-text-sec/80 leading-snug">{reminder.message}</p>
                    </div>
                    <ChevronRight size={14} className="text-theme-text-sec/30 group-hover:text-theme-text-sec/60 transition-colors shrink-0 mt-0.5 sm:mt-0" />
                  </div>
                ))}
                
                {activeReminders.length > 3 && !showAllReminders && (
                  <button 
                    onClick={() => setShowAllReminders(true)}
                    className="w-full py-2.5 text-[12px] font-medium text-theme-text-sec hover:text-theme-text bg-theme-bg/20 hover:bg-theme-bg/40 transition-colors border-t border-theme-border/20"
                  >
                    View all {activeReminders.length} reminders
                  </button>
                )}
              </div>
            ) : (
              <div className="p-4 flex items-center justify-center text-center">
                <p className="text-[13px] font-medium text-theme-text-sec/70">Nothing needs your attention right now.</p>
              </div>
            )}
          </div>
        </section>
);


  return (
    <div className="w-full max-w-2xl mx-auto pt-0 pb-24 space-y-8 animate-in fade-in -mt-4 md:-mt-5">
      {/* 1. TOP HEADER */}
      <header>
        <h1 className="text-4xl sm:text-5xl font-display font-medium text-theme-text tracking-normal">{greeting} :)</h1>
        
        {/* Daily Thought */}
        <div className="mt-2 mb-6 max-w-lg">
          <p className="text-[14px] sm:text-[15px] font-sans font-medium text-theme-text-sec leading-snug text-left line-clamp-2">
            {dailyThought}
          </p>
        </div>
      </header>

 

 
        

        

 
        {pinnedSection === 'health' && (
          <>
            {/* 2. HEALTH SNAPSHOT */}
 <section 
 onClick={() => onNavigate('biomarkers')}
 className="bg-theme-card px-4 py-2 sm:px-6 sm:py-4 rounded-[28px] border border-theme-border/50 shadow-sm cursor-pointer hover:shadow-md transition-all relative group"
 >
        <button 
          onClick={(e) => { e.stopPropagation(); setPinnedSection('health'); }}
          className={cn(
            "absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full transition-colors z-20",
            pinnedSection === 'health' ? "text-blue-500 bg-blue-500/10" : "text-theme-text-sec hover:text-theme-text hover:bg-theme-bg"
          )}
          title="Pin to top"
        >
          <Pin size={16} className={pinnedSection === 'health' ? "fill-current" : ""} />
        </button>

 <div className="relative z-10 flex flex-col items-center">
 <DashboardHealthDial score={score} scoreDiff={scoreDiff} />
 </div>

 <div className="mt-8 mb-2 relative z-10 w-full flex justify-center">
 {score === null ? (
 <p className="text-sm text-theme-text-sec font-medium mt-6 pt-6 border-t border-theme-border/60">Upload a lab report to generate your Health Score</p>
 ) : (
 <div className="flex items-center justify-center gap-6 sm:gap-8 w-full animate-in fade-in slide-in-from-bottom-2 duration-700 mt-2">
      {/* Optimal */}
      <div className="flex items-center gap-2">
        <div className="relative flex items-center justify-center">
          <div className="absolute w-3 h-3 rounded-full bg-emerald-500/20 dark:bg-emerald-400/20 blur-[2px]" />
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 relative z-10" />
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-theme-text font-display font-medium text-[15px] leading-none">{optimalCount}</span>
          <span className="text-theme-text-sec font-sans text-[12px] font-medium">Optimal</span>
        </div>
      </div>
      
      {/* Borderline */}
      <div className="flex items-center gap-2">
        <div className="relative flex items-center justify-center">
          <div className="absolute w-3 h-3 rounded-full bg-amber-500/20 dark:bg-amber-400/20 blur-[2px]" />
          <div className="w-1.5 h-1.5 rounded-full bg-amber-500 dark:bg-amber-400 relative z-10" />
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-theme-text font-display font-medium text-[15px] leading-none">{borderlineCount}</span>
          <span className="text-theme-text-sec font-sans text-[12px] font-medium">Borderline</span>
        </div>
      </div>

      {/* Attention */}
      <div className="flex items-center gap-2">
        <div className="relative flex items-center justify-center">
          <div className="absolute w-3 h-3 rounded-full bg-red-500/20 dark:bg-red-400/20 blur-[2px]" />
          <div className="w-1.5 h-1.5 rounded-full bg-red-500 dark:bg-red-400 relative z-10" />
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-theme-text font-display font-medium text-[15px] leading-none">{highLowCount}</span>
          <span className="text-theme-text-sec font-sans text-[12px] font-medium">Attention</span>
        </div>
      </div>
    </div>
  )}
</div>
 </section>
            {careRemindersNode}
            {/* GLUCOSE DASHBOARD CARDS */}
        <section 
            onClick={() => onNavigate('glucose')}
            className="bg-theme-card px-5 py-5 sm:px-6 rounded-[28px] border border-theme-border/50 shadow-sm cursor-pointer hover:shadow-md transition-all group flex flex-col gap-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-[17px] font-bold text-theme-text">Glucose</h2>
              <button 
                onClick={(e) => { e.stopPropagation(); setPinnedSection('glucose'); }}
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center transition-colors",
                  pinnedSection === 'glucose' ? "text-blue-500 bg-blue-500/10" : "text-theme-text-sec hover:text-theme-text hover:bg-theme-bg"
                )}
                title="Pin to top"
              >
                <Pin size={16} className={pinnedSection === 'glucose' ? "fill-current" : ""} />
              </button>
            </div>
            <div className="flex min-h-[120px] relative overflow-hidden -mx-2">
              <div className="flex-1 px-2 sm:px-4 flex flex-col justify-between relative">
                <div className="absolute top-0 right-0 p-2 opacity-[0.03] group-hover:opacity-[0.05] transition-opacity">
                  <Droplet size={80} fill="currentColor" />
                </div>
                <div className="relative z-10 flex items-center justify-between mb-2">
                  <p className="text-[14px] font-semibold text-theme-text-sec">Today's Reading</p>
                  <div className="w-8 h-8 rounded-xl bg-theme-accent/10 border border-theme-accent/20 flex items-center justify-center">
                    <Droplet className="text-theme-accent" size={16} fill="currentColor" fillOpacity={0.2} />
                  </div>
                </div>
                
                <div className="relative z-10">
                  {todayUniqueReadings.length > 0 ? (
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-4xl font-display font-medium text-theme-text tracking-tight">{todayUniqueReadings[0].value}</span>
                      <span className="text-sm font-bold text-theme-text-sec">mg/dL</span>
                    </div>
                  ) : (
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-4xl font-display font-medium text-theme-text tracking-tight opacity-20">--</span>
                      <span className="text-sm font-bold text-theme-text-sec opacity-20">mg/dL</span>
                    </div>
                  )}
                  <p className="text-xs font-medium text-theme-text-sec mt-1">
                    {todayUniqueReadings.length > 0 ? `${todayUniqueReadings.length} reading${todayUniqueReadings.length > 1 ? 's' : ''} today` : 'No readings today'}
                  </p>
                </div>
              </div>

              <div className="w-[1px] bg-theme-border/50 my-2" />

              <div className="flex-1 px-2 sm:px-4 flex flex-col justify-between relative">
                <div className="absolute top-0 right-0 p-2 opacity-[0.03] group-hover:opacity-[0.05] transition-opacity">
                  <Hexagon size={80} fill="currentColor" />
                </div>
                <div className="relative z-10 flex items-center justify-between mb-2">
                  <p className="text-[14px] font-semibold text-theme-text-sec">Latest HbA1c</p>
                  <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                    <Hexagon className="text-purple-500" size={16} fill="currentColor" fillOpacity={0.2} />
                  </div>
                </div>

                <div className="relative z-10">
                  {latestHba1c ? (
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-4xl font-display font-medium text-theme-text tracking-tight">{latestHba1c.value}</span>
                      <span className="text-sm font-bold text-theme-text-sec">%</span>
                    </div>
                  ) : (
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-4xl font-display font-medium text-theme-text tracking-tight opacity-20">--</span>
                      <span className="text-sm font-bold text-theme-text-sec opacity-20">%</span>
                    </div>
                  )}
                  <p className="text-xs font-medium text-theme-text-sec mt-1">
                    {latestHba1c ? `Tested ${safeFormat(latestHba1c.date, 'MMM d, yyyy')}` : 'Upload a lab report'}
                  </p>
                </div>
              </div>
            </div>
          </section>
            {/* WEIGHT CARD */}
        <WeightCard isPinned={pinnedSection === 'weight'} onPin={() => setPinnedSection('weight')} />
          </>
        )}
        {pinnedSection === 'glucose' && (
          <>
            {/* GLUCOSE DASHBOARD CARDS */}
        <section 
            onClick={() => onNavigate('glucose')}
            className="bg-theme-card px-5 py-5 sm:px-6 rounded-[28px] border border-theme-border/50 shadow-sm cursor-pointer hover:shadow-md transition-all group flex flex-col gap-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-[17px] font-bold text-theme-text">Glucose</h2>
              <button 
                onClick={(e) => { e.stopPropagation(); setPinnedSection('glucose'); }}
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center transition-colors",
                  pinnedSection === 'glucose' ? "text-blue-500 bg-blue-500/10" : "text-theme-text-sec hover:text-theme-text hover:bg-theme-bg"
                )}
                title="Pin to top"
              >
                <Pin size={16} className={pinnedSection === 'glucose' ? "fill-current" : ""} />
              </button>
            </div>
            <div className="flex min-h-[120px] relative overflow-hidden -mx-2">
              <div className="flex-1 px-2 sm:px-4 flex flex-col justify-between relative">
                <div className="absolute top-0 right-0 p-2 opacity-[0.03] group-hover:opacity-[0.05] transition-opacity">
                  <Droplet size={80} fill="currentColor" />
                </div>
                <div className="relative z-10 flex items-center justify-between mb-2">
                  <p className="text-[14px] font-semibold text-theme-text-sec">Today's Reading</p>
                  <div className="w-8 h-8 rounded-xl bg-theme-accent/10 border border-theme-accent/20 flex items-center justify-center">
                    <Droplet className="text-theme-accent" size={16} fill="currentColor" fillOpacity={0.2} />
                  </div>
                </div>
                
                <div className="relative z-10">
                  {todayUniqueReadings.length > 0 ? (
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-4xl font-display font-medium text-theme-text tracking-tight">{todayUniqueReadings[0].value}</span>
                      <span className="text-sm font-bold text-theme-text-sec">mg/dL</span>
                    </div>
                  ) : (
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-4xl font-display font-medium text-theme-text tracking-tight opacity-20">--</span>
                      <span className="text-sm font-bold text-theme-text-sec opacity-20">mg/dL</span>
                    </div>
                  )}
                  <p className="text-xs font-medium text-theme-text-sec mt-1">
                    {todayUniqueReadings.length > 0 ? `${todayUniqueReadings.length} reading${todayUniqueReadings.length > 1 ? 's' : ''} today` : 'No readings today'}
                  </p>
                </div>
              </div>

              <div className="w-[1px] bg-theme-border/50 my-2" />

              <div className="flex-1 px-2 sm:px-4 flex flex-col justify-between relative">
                <div className="absolute top-0 right-0 p-2 opacity-[0.03] group-hover:opacity-[0.05] transition-opacity">
                  <Hexagon size={80} fill="currentColor" />
                </div>
                <div className="relative z-10 flex items-center justify-between mb-2">
                  <p className="text-[14px] font-semibold text-theme-text-sec">Latest HbA1c</p>
                  <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                    <Hexagon className="text-purple-500" size={16} fill="currentColor" fillOpacity={0.2} />
                  </div>
                </div>

                <div className="relative z-10">
                  {latestHba1c ? (
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-4xl font-display font-medium text-theme-text tracking-tight">{latestHba1c.value}</span>
                      <span className="text-sm font-bold text-theme-text-sec">%</span>
                    </div>
                  ) : (
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-4xl font-display font-medium text-theme-text tracking-tight opacity-20">--</span>
                      <span className="text-sm font-bold text-theme-text-sec opacity-20">%</span>
                    </div>
                  )}
                  <p className="text-xs font-medium text-theme-text-sec mt-1">
                    {latestHba1c ? `Tested ${safeFormat(latestHba1c.date, 'MMM d, yyyy')}` : 'Upload a lab report'}
                  </p>
                </div>
              </div>
            </div>
          </section>
            {careRemindersNode}
            {/* 2. HEALTH SNAPSHOT */}
 <section 
 onClick={() => onNavigate('biomarkers')}
 className="bg-theme-card px-4 py-2 sm:px-6 sm:py-4 rounded-[28px] border border-theme-border/50 shadow-sm cursor-pointer hover:shadow-md transition-all relative group"
 >
        <button 
          onClick={(e) => { e.stopPropagation(); setPinnedSection('health'); }}
          className={cn(
            "absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full transition-colors z-20",
            pinnedSection === 'health' ? "text-blue-500 bg-blue-500/10" : "text-theme-text-sec hover:text-theme-text hover:bg-theme-bg"
          )}
          title="Pin to top"
        >
          <Pin size={16} className={pinnedSection === 'health' ? "fill-current" : ""} />
        </button>

 <div className="relative z-10 flex flex-col items-center">
 <DashboardHealthDial score={score} scoreDiff={scoreDiff} />
 </div>

 <div className="mt-8 mb-2 relative z-10 w-full flex justify-center">
 {score === null ? (
 <p className="text-sm text-theme-text-sec font-medium mt-6 pt-6 border-t border-theme-border/60">Upload a lab report to generate your Health Score</p>
 ) : (
 <div className="flex items-center justify-center gap-6 sm:gap-8 w-full animate-in fade-in slide-in-from-bottom-2 duration-700 mt-2">
      {/* Optimal */}
      <div className="flex items-center gap-2">
        <div className="relative flex items-center justify-center">
          <div className="absolute w-3 h-3 rounded-full bg-emerald-500/20 dark:bg-emerald-400/20 blur-[2px]" />
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 relative z-10" />
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-theme-text font-display font-medium text-[15px] leading-none">{optimalCount}</span>
          <span className="text-theme-text-sec font-sans text-[12px] font-medium">Optimal</span>
        </div>
      </div>
      
      {/* Borderline */}
      <div className="flex items-center gap-2">
        <div className="relative flex items-center justify-center">
          <div className="absolute w-3 h-3 rounded-full bg-amber-500/20 dark:bg-amber-400/20 blur-[2px]" />
          <div className="w-1.5 h-1.5 rounded-full bg-amber-500 dark:bg-amber-400 relative z-10" />
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-theme-text font-display font-medium text-[15px] leading-none">{borderlineCount}</span>
          <span className="text-theme-text-sec font-sans text-[12px] font-medium">Borderline</span>
        </div>
      </div>

      {/* Attention */}
      <div className="flex items-center gap-2">
        <div className="relative flex items-center justify-center">
          <div className="absolute w-3 h-3 rounded-full bg-red-500/20 dark:bg-red-400/20 blur-[2px]" />
          <div className="w-1.5 h-1.5 rounded-full bg-red-500 dark:bg-red-400 relative z-10" />
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-theme-text font-display font-medium text-[15px] leading-none">{highLowCount}</span>
          <span className="text-theme-text-sec font-sans text-[12px] font-medium">Attention</span>
        </div>
      </div>
    </div>
  )}
</div>
 </section>
            {/* WEIGHT CARD */}
        <WeightCard isPinned={pinnedSection === 'weight'} onPin={() => setPinnedSection('weight')} />
          </>
        )}
        {pinnedSection === 'weight' && (
          <>
            {/* WEIGHT CARD */}
        <WeightCard isPinned={pinnedSection === 'weight'} onPin={() => setPinnedSection('weight')} />
            {careRemindersNode}
            {/* 2. HEALTH SNAPSHOT */}
 <section 
 onClick={() => onNavigate('biomarkers')}
 className="bg-theme-card px-4 py-2 sm:px-6 sm:py-4 rounded-[28px] border border-theme-border/50 shadow-sm cursor-pointer hover:shadow-md transition-all relative group"
 >
        <button 
          onClick={(e) => { e.stopPropagation(); setPinnedSection('health'); }}
          className={cn(
            "absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full transition-colors z-20",
            pinnedSection === 'health' ? "text-blue-500 bg-blue-500/10" : "text-theme-text-sec hover:text-theme-text hover:bg-theme-bg"
          )}
          title="Pin to top"
        >
          <Pin size={16} className={pinnedSection === 'health' ? "fill-current" : ""} />
        </button>

 <div className="relative z-10 flex flex-col items-center">
 <DashboardHealthDial score={score} scoreDiff={scoreDiff} />
 </div>

 <div className="mt-8 mb-2 relative z-10 w-full flex justify-center">
 {score === null ? (
 <p className="text-sm text-theme-text-sec font-medium mt-6 pt-6 border-t border-theme-border/60">Upload a lab report to generate your Health Score</p>
 ) : (
 <div className="flex items-center justify-center gap-6 sm:gap-8 w-full animate-in fade-in slide-in-from-bottom-2 duration-700 mt-2">
      {/* Optimal */}
      <div className="flex items-center gap-2">
        <div className="relative flex items-center justify-center">
          <div className="absolute w-3 h-3 rounded-full bg-emerald-500/20 dark:bg-emerald-400/20 blur-[2px]" />
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 relative z-10" />
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-theme-text font-display font-medium text-[15px] leading-none">{optimalCount}</span>
          <span className="text-theme-text-sec font-sans text-[12px] font-medium">Optimal</span>
        </div>
      </div>
      
      {/* Borderline */}
      <div className="flex items-center gap-2">
        <div className="relative flex items-center justify-center">
          <div className="absolute w-3 h-3 rounded-full bg-amber-500/20 dark:bg-amber-400/20 blur-[2px]" />
          <div className="w-1.5 h-1.5 rounded-full bg-amber-500 dark:bg-amber-400 relative z-10" />
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-theme-text font-display font-medium text-[15px] leading-none">{borderlineCount}</span>
          <span className="text-theme-text-sec font-sans text-[12px] font-medium">Borderline</span>
        </div>
      </div>

      {/* Attention */}
      <div className="flex items-center gap-2">
        <div className="relative flex items-center justify-center">
          <div className="absolute w-3 h-3 rounded-full bg-red-500/20 dark:bg-red-400/20 blur-[2px]" />
          <div className="w-1.5 h-1.5 rounded-full bg-red-500 dark:bg-red-400 relative z-10" />
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-theme-text font-display font-medium text-[15px] leading-none">{highLowCount}</span>
          <span className="text-theme-text-sec font-sans text-[12px] font-medium">Attention</span>
        </div>
      </div>
    </div>
  )}
</div>
 </section>
            {/* GLUCOSE DASHBOARD CARDS */}
        <section 
            onClick={() => onNavigate('glucose')}
            className="bg-theme-card px-5 py-5 sm:px-6 rounded-[28px] border border-theme-border/50 shadow-sm cursor-pointer hover:shadow-md transition-all group flex flex-col gap-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-[17px] font-bold text-theme-text">Glucose</h2>
              <button 
                onClick={(e) => { e.stopPropagation(); setPinnedSection('glucose'); }}
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center transition-colors",
                  pinnedSection === 'glucose' ? "text-blue-500 bg-blue-500/10" : "text-theme-text-sec hover:text-theme-text hover:bg-theme-bg"
                )}
                title="Pin to top"
              >
                <Pin size={16} className={pinnedSection === 'glucose' ? "fill-current" : ""} />
              </button>
            </div>
            <div className="flex min-h-[120px] relative overflow-hidden -mx-2">
              <div className="flex-1 px-2 sm:px-4 flex flex-col justify-between relative">
                <div className="absolute top-0 right-0 p-2 opacity-[0.03] group-hover:opacity-[0.05] transition-opacity">
                  <Droplet size={80} fill="currentColor" />
                </div>
                <div className="relative z-10 flex items-center justify-between mb-2">
                  <p className="text-[14px] font-semibold text-theme-text-sec">Today's Reading</p>
                  <div className="w-8 h-8 rounded-xl bg-theme-accent/10 border border-theme-accent/20 flex items-center justify-center">
                    <Droplet className="text-theme-accent" size={16} fill="currentColor" fillOpacity={0.2} />
                  </div>
                </div>
                
                <div className="relative z-10">
                  {todayUniqueReadings.length > 0 ? (
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-4xl font-display font-medium text-theme-text tracking-tight">{todayUniqueReadings[0].value}</span>
                      <span className="text-sm font-bold text-theme-text-sec">mg/dL</span>
                    </div>
                  ) : (
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-4xl font-display font-medium text-theme-text tracking-tight opacity-20">--</span>
                      <span className="text-sm font-bold text-theme-text-sec opacity-20">mg/dL</span>
                    </div>
                  )}
                  <p className="text-xs font-medium text-theme-text-sec mt-1">
                    {todayUniqueReadings.length > 0 ? `${todayUniqueReadings.length} reading${todayUniqueReadings.length > 1 ? 's' : ''} today` : 'No readings today'}
                  </p>
                </div>
              </div>

              <div className="w-[1px] bg-theme-border/50 my-2" />

              <div className="flex-1 px-2 sm:px-4 flex flex-col justify-between relative">
                <div className="absolute top-0 right-0 p-2 opacity-[0.03] group-hover:opacity-[0.05] transition-opacity">
                  <Hexagon size={80} fill="currentColor" />
                </div>
                <div className="relative z-10 flex items-center justify-between mb-2">
                  <p className="text-[14px] font-semibold text-theme-text-sec">Latest HbA1c</p>
                  <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                    <Hexagon className="text-purple-500" size={16} fill="currentColor" fillOpacity={0.2} />
                  </div>
                </div>

                <div className="relative z-10">
                  {latestHba1c ? (
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-4xl font-display font-medium text-theme-text tracking-tight">{latestHba1c.value}</span>
                      <span className="text-sm font-bold text-theme-text-sec">%</span>
                    </div>
                  ) : (
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-4xl font-display font-medium text-theme-text tracking-tight opacity-20">--</span>
                      <span className="text-sm font-bold text-theme-text-sec opacity-20">%</span>
                    </div>
                  )}
                  <p className="text-xs font-medium text-theme-text-sec mt-1">
                    {latestHba1c ? `Tested ${safeFormat(latestHba1c.date, 'MMM d, yyyy')}` : 'Upload a lab report'}
                  </p>
                </div>
              </div>
            </div>
          </section>
          </>
        )}

        {/* FLOATING ACTION BUTTONS */}
      <div className="fixed bottom-24 md:bottom-10 left-6 sm:left-8 right-6 sm:right-8 z-40 flex items-center justify-between pointer-events-none">
        
        

        {/* QUICK ADD FLOATING BUTTON */}
        <div className="flex-1 flex justify-end">
          <button 
            onClick={() => setShowQuickAdd(true)}
            className="tour-quick-add pointer-events-auto w-14 h-14 bg-theme-text text-theme-bg rounded-full shadow-[0_8px_30px_rgba(0,0,0,0.12)] flex items-center justify-center hover:scale-105 active:scale-95 transition-all"
          >
            <Plus size={28} />
          </button>
        </div>
      </div>

      {/* QUICK ADD BOTTOM SHEET */}
      <AnimatePresence>
        {showQuickAdd && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowQuickAdd(false)}
              className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50"
            />
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 bg-theme-bg rounded-t-[32px] shadow-2xl z-50 p-6 sm:p-8 max-w-md mx-auto pb-safe"
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-[22px] font-display font-medium text-theme-text">Quick Add</h3>
                <button onClick={() => setShowQuickAdd(false)} className="p-2 -mr-2 text-theme-text-sec hover:text-theme-text transition-colors">
                  <X size={24} />
                </button>
              </div>
              
              <div className="flex flex-col pb-20 md:pb-6">
                <button 
                  onClick={() => { setQuickAddAction('report'); }}
                  className="flex items-center gap-4 py-5 border-b border-theme-border/50 hover:bg-theme-card-sec/50 transition-colors text-left group px-2 -mx-2 rounded-xl"
                >
                  <FileText size={24} className="text-emerald-500 shrink-0" />
                  <div className="flex-1">
                    <span className="text-[17px] font-medium text-theme-text block mb-0.5">Add Health Report</span>
                    <span className="text-[13px] font-medium text-theme-text-sec block">Upload a health report.</span>
                  </div>
                </button>
                
                <button 
                  onClick={() => { setQuickAddAction('glucose'); }}
                  className="flex items-center gap-4 py-5 border-b border-theme-border/50 hover:bg-theme-card-sec/50 transition-colors text-left group px-2 -mx-2 rounded-xl"
                >
                  <Droplet size={24} className="text-red-500 shrink-0" />
                  <div className="flex-1">
                    <span className="text-[17px] font-medium text-theme-text block mb-0.5">Log Glucose</span>
                    <span className="text-[13px] font-medium text-theme-text-sec block">Record blood sugar level</span>
                  </div>
                </button>

                <button 
                  onClick={() => { setQuickAddAction('weight'); }}
                  className="flex items-center gap-4 py-5 hover:bg-theme-card-sec/50 transition-colors text-left group px-2 -mx-2 rounded-xl"
                >
                  <Circle size={24} className="text-orange-500 shrink-0" />
                  <div className="flex-1">
                    <span className="text-[17px] font-medium text-theme-text block mb-0.5">Log Weight</span>
                    <span className="text-[13px] font-medium text-theme-text-sec block">Update your current weight</span>
                  </div>
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
      
      {quickAddAction === 'weight' && (
        <AddWeightModal 
          onClose={() => { setQuickAddAction('none'); setShowQuickAdd(false); }} 
          onAdd={async (weight, date) => {
            const existingEntry = weightEntries.find(w => w.date === date);
            try {
              await addWeightEntry({
                id: existingEntry ? existingEntry.id : crypto.randomUUID(),
                weight,
                date,
                createdAt: Date.now()
              });
              setQuickAddAction('none');
              setShowQuickAdd(false);
            } catch(e: any) {
              alert(e.message || "Failed to add weight");
            }
          }} 
        />
      )}
      {quickAddAction === 'glucose' && (
        <AddGlucoseModal 
          onClose={() => { setQuickAddAction('none'); setShowQuickAdd(false); }}
          onAdd={async (r) => {
            try {
              await addGlucoseReading(r);
              setQuickAddAction('none');
              setShowQuickAdd(false);
            } catch(e: any) {
              alert(e.message || "Failed to add glucose");
            }
          }}
        />
      )}
      {quickAddAction === 'report' && (
        <AddReportFlow 
          onClose={() => { setQuickAddAction('none'); }}
          onSuccess={() => { setQuickAddAction('none'); setShowQuickAdd(false); }}
        />
      )}
 </div>
 );
}
