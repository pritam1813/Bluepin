import React, { useState } from 'react';
import { friendlyFirebaseError } from '../lib/friendlyFirebaseError';

export function AddWeightModal({ onClose, onAdd }: { onClose: () => void, onAdd: (weight: number, date: string) => Promise<void> }) {
  const [newWeight, setNewWeight] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLogWeight = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWeight || isNaN(Number(newWeight)) || Number(newWeight) <= 0) return;
    const todayStr = new Date().toISOString().split('T')[0];
    setIsSubmitting(true);
    try { await onAdd(Number(newWeight), todayStr); } catch(err: any) { alert(friendlyFirebaseError(err, "Failed to add weight")); } finally { setIsSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm transition-opacity">
      <div className="bg-theme-card rounded-3xl w-full max-w-sm shadow-2xl p-6 animate-in zoom-in-95 duration-200">
        <h3 className="text-xl font-bold text-theme-text mb-6">Log Weight</h3>
        <form onSubmit={handleLogWeight} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-theme-text mb-1">Weight (kg)</label>
            <input 
              type="number" step="0.1" min="0"
              value={newWeight} onChange={e => setNewWeight(e.target.value)}
              autoFocus required
              className="w-full text-2xl px-4 py-3 bg-theme-card-sec border border-theme-border rounded-xl focus:ring-2 focus:ring-theme-accent outline-none transition-all"
              placeholder="0.0"
            />
          </div>
          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose} className="flex-1 py-3 px-4 bg-theme-card-sec text-theme-text rounded-xl font-medium hover:bg-theme-border transition-colors">Cancel</button>
            <button type="submit" disabled={!newWeight || isSubmitting} className="flex-1 py-3 px-4 bg-theme-accent text-white disabled:opacity-50 rounded-xl font-medium hover:bg-theme-accent/90 transition-colors shadow-sm">Save</button>
          </div>
        </form>
      </div>
    </div>
  );
}
