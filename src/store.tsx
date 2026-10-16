import React, { createContext, useContext, useState, useEffect, ReactNode, useRef } from "react";
import { AppState, GlucoseReading, LabReport, WeightEntry, Goal, GoalLog, UserProfile } from "./types";
import { DEFAULT_GOALS, DUMMY_GLUCOSE_READINGS } from "./data";
import { auth, db, handleFirestoreError, OperationType } from "./lib/firebase";
import { friendlyFirebaseError } from "./lib/friendlyFirebaseError";
import { doc, collection, onSnapshot, setDoc, deleteDoc, serverTimestamp, updateDoc, getDoc, getDocs, deleteField, runTransaction, writeBatch, query, orderBy, limit } from "firebase/firestore";

const defaultState: AppState = {
  glucoseReadings: DUMMY_GLUCOSE_READINGS,
  labReports: [],
  weightEntries: [],
  goals: DEFAULT_GOALS,
  goalLogs: {},
  profile: { heightCm: 170 }, // Default height
  deletedDummyGlucoseIds: [],
};

interface AppContextType extends AppState {
  addGlucoseReading: (reading: GlucoseReading) => void;
  removeGlucoseReading: (id: string) => void;
  addLabReport: (report: LabReport) => void;
  updateLabReport: (id: string, updates: Partial<LabReport>) => void;
  removeLabReport: (id: string) => void;
  addWeightEntry: (entry: WeightEntry) => void;
  updateProfile: (profile: Partial<UserProfile>) => void;
  toggleGoalActive: (goalId: string, isActive: boolean) => void;
  addCustomGoal: (goal: Goal) => void;
  removeGoal: (id: string) => void;
  logGoal: (date: string, goalId: string, completed: boolean, value?: number) => void;
          }

function removeUndefined<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }
  // Check if it's a Firebase FieldValue or Date to prevent breaking it
  if (typeof obj === 'object' && (obj.constructor.name === 'FieldValueImpl' || obj.constructor.name === 'ServerTimestampTransform' || obj.constructor.name === 'FieldValue' || obj instanceof Date || (obj as any).isEqual)) {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(removeUndefined) as unknown as T;
  }
  if (typeof obj === 'object') {
    const newObj: any = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        if ((obj as any)[key] !== undefined) {
          newObj[key] = removeUndefined((obj as any)[key]);
        }
      }
    }
    return newObj as T;
  }
  return obj;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<AppState>(defaultState);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth.currentUser) return;
    const uid = auth.currentUser.uid;
    const unsubProfile = onSnapshot(doc(db, "users", uid), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setState(s => ({ ...s, profile: { heightCm: data.height || 170, ...data } }));
      }
    }, (err) => handleFirestoreError(err, OperationType.GET, "users/" + uid));

    const unsubGlucose = onSnapshot(collection(db, `users/${uid}/glucoseReadings`), (snapshot) => {
      const readings = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      // Inject dummy data for demonstration
      setState(s => {
        const deletedIds = s.deletedDummyGlucoseIds || [];
        const combined = [...DUMMY_GLUCOSE_READINGS.filter(d => !deletedIds.includes(d.id)), ...readings];
        return { ...s, glucoseReadings: combined };
      });
    }, (err) => handleFirestoreError(err, OperationType.LIST, `users/${uid}/glucoseReadings`));

    const unsubReports = onSnapshot(collection(db, `users/${uid}/labReports`), (snapshot) => {
      const reports = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      setState(s => ({ ...s, labReports: reports }));
    }, (err) => handleFirestoreError(err, OperationType.LIST, `users/${uid}/labReports`));

    const unsubWeight = onSnapshot(collection(db, `users/${uid}/weightLogs`), (snapshot) => {
      const logs = snapshot.docs.map(doc => {
        const data = doc.data();
        let createdAt = data.createdAt;
        if (createdAt && typeof createdAt.toMillis === 'function') {
          createdAt = createdAt.toMillis();
        } else if (createdAt && createdAt.seconds) {
          createdAt = createdAt.seconds * 1000;
        } else if (createdAt && typeof createdAt === 'object' && Object.keys(createdAt).length === 0) {
          createdAt = new Date(data.date).getTime();
        }
        return { id: doc.id, ...data, createdAt } as any;
      });
      setState(s => ({ ...s, weightEntries: logs }));
    }, (err) => handleFirestoreError(err, OperationType.LIST, `users/${uid}/weightLogs`));

    const unsubGoals = onSnapshot(collection(db, `users/${uid}/goals`), (snapshot) => {
      const loadedGoals = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      const mergedGoals = [...DEFAULT_GOALS];
      loadedGoals.forEach(loaded => {
        const idx = mergedGoals.findIndex(g => g.id === loaded.id);
        if (idx !== -1) {
          mergedGoals[idx] = { ...mergedGoals[idx], ...loaded };
        } else {
          mergedGoals.push(loaded);
        }
      });
      setState(s => ({ ...s, goals: mergedGoals }));
    }, (err) => handleFirestoreError(err, OperationType.LIST, `users/${uid}/goals`));

    const unsubLogs = onSnapshot(collection(db, `users/${uid}/dailyLogs`), (snapshot) => {
      const logs: any = {};
      snapshot.docs.forEach(docSnap => {
        const data = docSnap.data();
        if (!logs[data.date]) logs[data.date] = {};
        logs[data.date][data.goalId] = { completed: data.completed, value: data.value, updatedAt: data.updatedAt };
      });
      setState(s => ({ ...s, goalLogs: logs }));
    }, (err) => handleFirestoreError(err, OperationType.LIST, `users/${uid}/dailyLogs`));

    setLoading(false);
    return () => {
      unsubProfile(); unsubGlucose(); unsubReports(); unsubWeight(); unsubGoals(); unsubLogs();
    };
  }, []);

  const stateRef = useRef(state);
  stateRef.current = state;

  const uid = auth.currentUser?.uid;

  
  
  const getDiabetesStatusFromHbA1c = (val: number): 'Yes' | 'Pre diabetes' | 'No' => {
    if (val >= 6.5) return 'Yes';
    if (val >= 5.7) return 'Pre diabetes';
    return 'No';
  };

  const updateLimits = async (batch: any, type: 'glucose' | 'report_add' | 'report_delete', userId: string, deletedReportId?: string) => {
    const limitsRef = doc(db, `users/${userId}/stats/limits`);
    const snap = await getDoc(limitsRef);
    const data = snap.exists() ? snap.data() : {};

    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;
    const day = now.getUTCDate();

    let updatePayload: any = {};

    if (type === 'glucose') {
      const isNewDay = data.gYear !== year || data.gMonth !== month || data.gDay !== day;
      const currentCount = isNewDay ? 0 : (data.gCount || 0);
      
      if (currentCount >= 10) {
        throw new Error("Daily limit of 10 glucose readings exceeded.");
      }
      
      updatePayload = {
        gYear: year,
        gMonth: month,
        gDay: day,
        gCount: currentCount + 1
      };
    } else if (type === 'report_add') {
      const isNewDay = data.rYear !== year || data.rMonth !== month || data.rDay !== day;
      const currentCount = isNewDay ? 0 : (data.rCount || 0);
      const totalCount = data.rTotal || 0;
      
      if (currentCount >= 20) {
        throw new Error("Daily limit of 20 health reports exceeded.");
      }
      if (totalCount >= 100) {
        throw new Error("Maximum limit of 100 health reports exceeded.");
      }
      
      updatePayload = {
        rYear: year,
        rMonth: month,
        rDay: day,
        rCount: currentCount + 1,
        rTotal: totalCount + 1
      };
    } else if (type === 'report_delete') {
      const totalCount = data.rTotal || 0;
      updatePayload = {
        rTotal: Math.max(0, totalCount - 1),
        deletedReportId: deletedReportId
      };
    }

    batch.set(limitsRef, updatePayload, { merge: true });
  };


  const addGlucoseReading = async (reading: GlucoseReading) => {
    if (reading.value < 0 || reading.value > 1000 || isNaN(reading.value)) {
      throw new Error("Invalid glucose value. Must be between 0 and 1000.");
    }
    if (!uid) {
      setState(s => ({ ...s, glucoseReadings: [reading, ...s.glucoseReadings] }));
      return;
    }
    try {
      const batch = writeBatch(db);
      await updateLimits(batch, 'glucose', uid);
      const ref = doc(db, `users/${uid}/glucoseReadings`, reading.id);
      batch.set(ref, removeUndefined({
        ...reading,
        userId: uid,
        createdAt: serverTimestamp()
      }));
      
      // Auto-update diabetes status if HbA1c
      if (reading.timing === 'HbA1c' as any) {
        const newStatus = getDiabetesStatusFromHbA1c(reading.value);
        if (stateRef.current.profile.diabetesStatus !== newStatus) {
           const profRef = doc(db, `users/${uid}`);
           batch.update(profRef, { diabetesStatus: newStatus });
        }
      }
      await batch.commit();
    } catch (e: any) {
      alert(friendlyFirebaseError(e, "Failed to add glucose reading"));
      handleFirestoreError(e, OperationType.CREATE, `users/${uid}/glucoseReadings`);
    }
  };
  const removeGlucoseReading = async (id: string) => {
    if (id.startsWith('dummy-') || !uid) {
      setState(s => {
        const deletedIds = [...(s.deletedDummyGlucoseIds || []), id];
        const combined = s.glucoseReadings.filter(r => r.id !== id);
        return { ...s, glucoseReadings: combined, deletedDummyGlucoseIds: deletedIds };
      });
      return;
    }
    await deleteDoc(doc(db, `users/${uid}/glucoseReadings`, id)).catch(e => handleFirestoreError(e, OperationType.DELETE, `users/${uid}/glucoseReadings/${id}`));
  };

  const addLabReport = async (report: LabReport) => {
    if (!uid) return;
    try {
      const batch = writeBatch(db);
      await updateLimits(batch, 'report_add', uid);
      const ref = doc(db, `users/${uid}/labReports`, report.id);
      batch.set(ref, removeUndefined({
        ...report,
        userId: uid,
        createdAt: serverTimestamp()
      }));
      // also we need to add biomarkers if they exist
      for (const bm of report.biomarkers) {
        const safeId = bm.name.replace(/[^a-zA-Z0-9]/g, "");
        const bmRef = doc(db, `users/${uid}/biomarkers`, `${report.id}_${safeId}`);
        batch.set(bmRef, removeUndefined({
          userId: uid,
          reportId: report.id,
          name: bm.name,
          value: bm.value,
          reportDate: report.date,
          status: bm.status,
          createdAt: serverTimestamp()
        }));
      }
      
      // Auto-update diabetes status if HbA1c exists in lab report
      const hba1cBiomarker = report.biomarkers.find(b => b.name.toLowerCase().includes('hba1c') || b.name.toLowerCase().includes('a1c'));
      if (hba1cBiomarker && typeof hba1cBiomarker.value === 'number' && !isNaN(hba1cBiomarker.value)) {
         const val = hba1cBiomarker.value;
         const newStatus = getDiabetesStatusFromHbA1c(val);
         if (stateRef.current.profile.diabetesStatus !== newStatus) {
            const profRef = doc(db, `users/${uid}`);
            batch.update(profRef, { diabetesStatus: newStatus });
         }
      }
      await batch.commit();
    } catch (e: any) {
      alert(friendlyFirebaseError(e, "Failed to add report"));
      handleFirestoreError(e, OperationType.CREATE, `users/${uid}/labReports`);
    }
  };
  const removeLabReport = async (id: string) => {
    if (!uid) return;
    try {
      const batch = writeBatch(db);
      await updateLimits(batch, 'report_delete', uid, id);
      const ref = doc(db, `users/${uid}/labReports`, id);
      batch.delete(ref);
      await batch.commit();
    } catch (e: any) {
      alert(friendlyFirebaseError(e, "Failed to delete report"));
      handleFirestoreError(e, OperationType.DELETE, `users/${uid}/labReports/${id}`);
    }
  };

  const updateLabReport = async (reportId: string, updates: Partial<LabReport>) => {
    if (!uid) return;
    const ref = doc(db, `users/${uid}/labReports`, reportId);
    await updateDoc(ref, removeUndefined({
      ...updates,
      updatedAt: serverTimestamp()
    })).catch(e => handleFirestoreError(e, OperationType.UPDATE, ref.path));
  };

  const addWeightEntry = async (entry: WeightEntry) => {
    if (!uid) return;
    const ref = doc(db, `users/${uid}/weightLogs`, entry.id);
    await setDoc(ref, removeUndefined({
      ...entry,
      userId: uid,
      createdAt: serverTimestamp()
    })).catch(e => handleFirestoreError(e, OperationType.CREATE, ref.path));
  };
  
  const updateProfile = async (profile: Partial<UserProfile>) => {
    if (!uid) return;
    const ref = doc(db, `users`, uid);
    await updateDoc(ref, removeUndefined({
      ...profile,
      updatedAt: serverTimestamp()
    })).catch(e => handleFirestoreError(e, OperationType.UPDATE, ref.path));
  };

  const toggleGoalActive = async (goalId: string, isActive: boolean) => {
    if (!uid) return;
    const existingGoal = state.goals.find(g => g.id === goalId);
    if (!existingGoal) return;
    const ref = doc(db, `users/${uid}/goals`, goalId);
    
    // Create local YYYY-MM-DD
    const d = new Date();
    const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    await setDoc(ref, removeUndefined({
      ...existingGoal,
      userId: uid,
      isActive,
      status: isActive ? "active" : "archived",
      createdAt: existingGoal.createdAt || Date.now(),
      activeHistory: {
        ...(existingGoal.activeHistory || {}),
        [todayStr]: isActive
      }
    }), { merge: true }).catch(e => handleFirestoreError(e, OperationType.UPDATE, ref.path));
  };

  const addCustomGoal = async (goal: Goal) => {
    if (!uid) return;
    const ref = doc(db, `users/${uid}/goals`, goal.id);
    
    // Create local YYYY-MM-DD
    const d = new Date();
    const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    await setDoc(ref, removeUndefined({
      ...goal,
      userId: uid,
      status: "active",
      createdAt: Date.now(),
      activeHistory: {
        [todayStr]: true
      }
    })).catch(e => handleFirestoreError(e, OperationType.CREATE, ref.path));
  };

  const removeGoal = async (id: string) => {
    if (!uid) return;
    await deleteDoc(doc(db, `users/${uid}/goals`, id)).catch(e => handleFirestoreError(e, OperationType.DELETE, `users/${uid}/goals/${id}`));
  };

  const logGoal = async (date: string, goalId: string, completed: boolean, value?: number) => {
    if (!uid) return;
    const logId = `${date}_${goalId}`;
    const ref = doc(db, `users/${uid}/dailyLogs`, logId);
    await setDoc(ref, removeUndefined({
      userId: uid,
      goalId,
      date,
      completed,
      value: value || 0,
      createdAt: serverTimestamp(),
      updatedAt: Date.now()
    }), { merge: true }).catch(e => handleFirestoreError(e, OperationType.CREATE, ref.path));
  };


    
  
  if (loading) return null;


  return (
    <AppContext.Provider value={{
      ...state,
      addGlucoseReading, removeGlucoseReading,
      addLabReport, updateLabReport, removeLabReport,
      addWeightEntry,
      updateProfile,
      toggleGoalActive, addCustomGoal, removeGoal, logGoal,
      
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppStore = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error("useAppStore must be used within AppProvider");
  return context;
};
