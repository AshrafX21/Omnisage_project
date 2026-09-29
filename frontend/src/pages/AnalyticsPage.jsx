/**
 * AnalyticsPage.jsx
 *
 * The "Analytics" tab of the Omnisage sidebar navigation.
 * The user picks which uploaded reports to include, then presses "Generate"
 * to produce a summary grid and trend chart of every biometric actually
 * found in exactly those reports (not a fixed hardcoded list, and not
 * recomputed live on every checkbox click — only when Generate is pressed).
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { TrendingUp, Activity, Check, FileText, Sparkles } from 'lucide-react';
import VitalsChart from '../components/VitalsChart';

/** Shared category → color mapping, matching Dashboard/Records tabs */
const CATEGORY_STYLE = {
  'Lab Report':   'text-blue-400 bg-blue-500/10 border-blue-500/20',
  'Prescription': 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  'Doctor Note':  'text-violet-400 bg-violet-500/10 border-violet-500/20',
  'Imaging':      'text-amber-400 bg-amber-500/10 border-amber-500/20',
  'Other':        'text-slate-400 bg-slate-500/10 border-slate-500/20',
};

/**
 * AnalyticsPage — biometrics trends tab with report selection + Generate.
 *
 * @param {Object}  props
 * @param {Array}   props.records - All user medical records.
 * @param {boolean} props.loading - Whether records are still loading.
 * @returns {JSX.Element}
 */
export default function AnalyticsPage({ records, loading }) {
  /* ── Which reports are CHECKED in the picker right now ──────────── */
  const [selectedIds, setSelectedIds] = useState(() => new Set(records.map(r => r.id)));
  // Tracks every record id we've already synced selection state for, so a
  // record the user explicitly unchecked doesn't get silently re-checked
  // just because some *other* record was uploaded or deleted later.
  const seenIdsRef = useRef(new Set(records.map(r => r.id)));

  useEffect(() => {
    const currentIds = new Set(records.map(r => r.id));
    setSelectedIds(prev => {
      const next = new Set(prev);
      let changed = false;

      // Newly-uploaded records (never synced before) start out checked.
      records.forEach(r => {
        if (!seenIdsRef.current.has(r.id)) {
          next.add(r.id);
          changed = true;
        }
      });

      // Deleted records drop out of the checked set entirely.
      prev.forEach(id => {
        if (!currentIds.has(id)) {
          next.delete(id);
          changed = true;
        }
      });

      seenIdsRef.current = currentIds;
      return changed ? next : prev;
    });
  }, [records]);

  const toggleRecord = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedIds(new Set(records.map(r => r.id)));
  const selectNone = () => setSelectedIds(new Set());

  /* ── Which reports were selected THE LAST TIME "Generate" was pressed ──
   * Deliberately separate from `selectedIds` (the live checkboxes):
   * toggling a checkbox alone does not change what's shown below — only
   * pressing Generate does. `null` means "nothing generated yet". */
  const [appliedIds, setAppliedIds] = useState(null);
  const hasGenerated = appliedIds !== null;

  const handleGenerate = () => setAppliedIds(new Set(selectedIds));

  const appliedRecords = useMemo(() => {
    if (appliedIds === null) return [];
    return records.filter(r => appliedIds.has(r.id));
  }, [records, appliedIds]);

  /* Collect one latest reading per unique vital metric across the generated reports */
  const latestByMetric = useMemo(() => {
    const map = {};
    [...appliedRecords].reverse().forEach(r => {
      (r.vitals || []).forEach(v => {
        if (!map[v.metric]) map[v.metric] = { ...v, date: r.record_date };
      });
    });
    return Object.values(map);
  }, [appliedRecords]);

  const noBiometricsInSelection = hasGenerated && appliedRecords.length > 0 && latestByMetric.length === 0;

  if (loading) {
    return (
      <div className="page-loading">
        <div className="spinner" />
        <p>Loading analytics data…</p>
      </div>
    );
  }

  return (
    <div className="page-content">

      {/* ── Page Header ────────────────────────────── */}
      <div className="page-header">
        <div className="page-header-left">
          <div className="page-header-icon icon-violet">
            <TrendingUp className="h-5 w-5" />
          </div>
          <div>
            <h1 className="page-title">Health Analytics</h1>
            <p className="page-sub">Select reports and generate a summary of every biometric they contain</p>
          </div>
        </div>
      </div>

      {/* ── Report Selector ────────────────────────── */}
      {records.length > 0 && (
        <div className="glass-panel p-5 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="text-sm font-semibold text-white">Select Reports</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Choose one or more reports, then press Generate to pull out their biometrics.
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs font-medium">
              <button onClick={selectAll} className="text-primary-400 hover:text-primary-300">
                Select all
              </button>
              <span className="text-slate-700">|</span>
              <button onClick={selectNone} className="text-slate-400 hover:text-slate-300">
                Clear
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {records.map(r => {
              const active = selectedIds.has(r.id);
              return (
                <button
                  key={r.id}
                  onClick={() => toggleRecord(r.id)}
                  title={r.file_name}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs transition-all max-w-[260px] ${
                    active
                      ? 'bg-primary-500/10 border-primary-500/30 text-white'
                      : 'bg-slate-900/40 border-white/5 text-slate-500 hover:text-slate-300'
                  }`}
                >
                  <span className={`shrink-0 h-3.5 w-3.5 rounded border flex items-center justify-center ${
                    active ? 'bg-primary-500 border-primary-500' : 'border-slate-600'
                  }`}>
                    {active && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
                  </span>
                  <FileText className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                  <span className="font-medium truncate">{r.file_name}</span>
                  <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] border ${CATEGORY_STYLE[r.category] || CATEGORY_STYLE.Other}`}>
                    {r.category}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="pt-1">
            <button
              onClick={handleGenerate}
              disabled={selectedIds.size === 0}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                selectedIds.size === 0
                  ? 'bg-slate-800/50 text-slate-600 cursor-not-allowed'
                  : 'bg-primary-500 text-white hover:bg-primary-400 shadow-md shadow-primary-500/20'
              }`}
              title={selectedIds.size === 0 ? 'Select at least one report first' : undefined}
            >
              <Sparkles className="h-4 w-4" />
              Generate {selectedIds.size > 0 ? `(${selectedIds.size} report${selectedIds.size > 1 ? 's' : ''})` : ''}
            </button>
          </div>
        </div>
      )}

      {/* ── Nothing generated yet ─────────────────────── */}
      {records.length > 0 && !hasGenerated && (
        <div className="empty-state mt-4">
          <Sparkles className="h-10 w-10 text-slate-700 mb-3" />
          <p className="empty-state-title">Nothing generated yet</p>
          <p className="empty-state-sub">
            Select one or more reports above and press Generate to see their biometrics.
          </p>
        </div>
      )}

      {/* ── Generated with zero reports selected ──────── */}
      {hasGenerated && appliedRecords.length === 0 && (
        <div className="empty-state mt-4">
          <FileText className="h-10 w-10 text-slate-700 mb-3" />
          <p className="empty-state-title">No reports selected</p>
          <p className="empty-state-sub">
            Select one or more reports above, then press Generate.
          </p>
        </div>
      )}

      {/* ── Generated, but the selected report(s) have no extractable biometrics ── */}
      {noBiometricsInSelection && (
        <div className="empty-state mt-4">
          <Activity className="h-10 w-10 text-slate-700 mb-3" />
          <p className="empty-state-title">
            There are no biometrics in the selected report{appliedRecords.length > 1 ? 's' : ''}
          </p>
          <p className="empty-state-sub">
            Try selecting a different report, or upload a digital lab report / clinical note with extractable vitals.
          </p>
        </div>
      )}

      {/* ── Current Vitals Summary + Chart — only once biometrics were actually found ── */}
      {hasGenerated && latestByMetric.length > 0 && (
        <>
          <div className="analytics-vitals-grid">
            {latestByMetric.map((vit, i) => (
              <div key={i} className="analytics-vital-card">
                <div className="analytics-vital-header">
                  <span className="analytics-vital-metric">{vit.metric}</span>
                  <span className={`analytics-vital-status ${
                    vit.status === 'Normal' ? 'status-normal' : 'status-alert'
                  }`}>
                    {vit.status || 'Normal'}
                  </span>
                </div>
                <p className="analytics-vital-value">
                  {vit.value}
                  <span className="analytics-vital-unit"> {vit.unit}</span>
                </p>
                {vit.date && (
                  <p className="analytics-vital-date">
                    As of {new Date(vit.date).toLocaleDateString()}
                  </p>
                )}
              </div>
            ))}
          </div>

          <VitalsChart records={appliedRecords} />
        </>
      )}

      {records.length === 0 && (
        <div className="empty-state mt-4">
          <Activity className="h-10 w-10 text-slate-700 mb-3" />
          <p className="empty-state-title">No analytics data available</p>
          <p className="empty-state-sub">
            Upload digital lab reports or clinical notes to automatically extract and chart your biometric data.
          </p>
        </div>
      )}
    </div>
  );
}
