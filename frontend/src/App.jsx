/**
 * App.jsx
 *
 * Root application shell for the Omnisage Medical Record Aggregator.
 *
 * Responsibilities:
 *  - Detects whether the current URL is a /share/:uuid guest route and,
 *    if so, renders the read-only shared-portal view.
 *  - Otherwise renders the main app shell: a fixed Sidebar on the left
 *    and the active tab page on the right.
 *  - Owns the global records state and propagates it to all pages.
 */

import React, { useState, useEffect } from 'react';
import { ShieldCheck, Lock } from 'lucide-react';

import Sidebar          from './components/Sidebar';
import AuthPage         from './pages/AuthPage';
import DashboardPage    from './pages/DashboardPage';
import RecordsPage      from './pages/RecordsPage';
import AnalyticsPage    from './pages/AnalyticsPage';
import UploadPage       from './pages/UploadPage';
import SharePage        from './pages/SharePage';
import ChatPage         from './pages/ChatPage';
import SearchPage       from './pages/SearchPage';
import RecordDetailModal from './components/RecordDetailModal';
import HealthTimeline   from './components/HealthTimeline';

import { apiService } from './services/apiService';

/**
 * Root App component — shell router and global state owner.
 *
 * @returns {JSX.Element}
 */
export default function App() {
  /* ── Global state ──────────────────────────────── */
  const [records,        setRecords]        = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [activeTab,      setActiveTab]      = useState('dashboard');
  const [selectedRecord, setSelectedRecord] = useState(null);

  /* ── Auth state ─────────────────────────────────── */
  const [currentUser,   setCurrentUser]   = useState(null);
  const [authChecking,  setAuthChecking]  = useState(true);
  const [greeting,      setGreeting]      = useState(null); // transient "Welcome, X" banner

  /* ── Guest share-link state ────────────────────── */
  const [shareToken,       setShareToken]       = useState(null);
  const [sharedRecords,    setSharedRecords]    = useState([]);
  const [passcode,         setPasscode]         = useState('');
  const [passcodeRequired, setPasscodeRequired] = useState(false);
  const [shareError,       setShareError]       = useState(null);

  /* ── Mount: detect /share/:uuid route, else resume/require a session ─── */
  useEffect(() => {
    const match = window.location.pathname.match(/^\/share\/([a-f0-9-]+)/i);
    if (match) {
      setShareToken(match[1]);
      setAuthChecking(false);
      loadSharedPortal(match[1]);
      return;
    }
    resumeSession();
  }, []);

  /* ── Auth handling ──────────────────────────────── */

  /**
   * On load, tries to restore a session from a previously stored token.
   * Falls back to showing the login/sign-up page if none exists or it's expired.
   */
  const resumeSession = async () => {
    if (!apiService.hasStoredToken()) {
      setAuthChecking(false);
      return;
    }
    try {
      const user = await apiService.getCurrentUser();
      setCurrentUser(user);
      loadDashboard();
    } catch (err) {
      console.warn('Stored session is no longer valid; showing login.');
    } finally {
      setAuthChecking(false);
    }
  };

  /**
   * Called by AuthPage once login or account creation succeeds.
   * Greets the user by name and loads their records.
   *
   * @param {Object} user - The authenticated user's profile.
   */
  const handleAuthSuccess = (user) => {
    setCurrentUser(user);
    const firstName = (user.full_name || user.email || '').trim().split(' ')[0];
    setGreeting(`Welcome${firstName ? `, ${firstName}` : ''}!`);
    setTimeout(() => setGreeting(null), 4000);
    loadDashboard();
  };

  /**
   * Signs the current user out, clears local state, and returns to the login page.
   */
  const handleLogout = async () => {
    try {
      await apiService.logout();
    } catch (err) {
      console.warn('Logout request failed (token cleared locally regardless):', err);
    }
    setCurrentUser(null);
    setRecords([]);
    setSelectedRecord(null);
    setActiveTab('dashboard');
  };

  /* ── Data fetching ─────────────────────────────── */

  /**
   * Fetches all medical records for the authenticated user.
   */
  const loadDashboard = async () => {
    setLoading(true);
    try {
      const data = await apiService.getRecords();
      setRecords(data);
    } catch (err) {
      console.error('Failed to load records:', err);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Fetches records accessible through a guest sharing link.
   *
   * @param {string} token - The sharing link UUID.
   * @param {string} [code] - Optional passcode.
   */
  const loadSharedPortal = async (token, code) => {
    setLoading(true);
    setShareError(null);
    try {
      const data = await apiService.getSharedRecords(token, code);
      setSharedRecords(data);
      setPasscodeRequired(false);
    } catch (err) {
      if (err.response?.status === 401) {
        setPasscodeRequired(true);
      } else {
        setShareError(err.response?.data?.detail || 'This shared link is invalid or has expired.');
      }
    } finally {
      setLoading(false);
    }
  };

  /* ── Record CRUD callbacks ─────────────────────── */

  /** Prepends a newly uploaded record to the global list. */
  const handleUploadSuccess = (newRecord) =>
    setRecords(prev => [newRecord, ...prev]);

  /**
   * Applies in-place update or removal to the records list.
   *
   * @param {Object|null} updatedRecord - Updated record or null if deleted.
   */
  const handleRecordUpdate = (updatedRecord) => {
    if (updatedRecord) {
      setRecords(prev => prev.map(r => r.id === updatedRecord.id ? updatedRecord : r));
      setSelectedRecord(updatedRecord);
    } else {
      setRecords(prev => prev.filter(r => r.id !== selectedRecord?.id));
      setSelectedRecord(null);
    }
  };

  /* ── Page renderer ─────────────────────────────── */

  /**
   * Returns the active page component based on the current sidebar tab.
   */
  const renderPage = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <DashboardPage
            records={records}
            loading={loading}
            onRecordSelect={setSelectedRecord}
            onTabChange={setActiveTab}
            user={currentUser}
          />
        );
      case 'records':
        return (
          <RecordsPage
            records={records}
            loading={loading}
            onRecordSelect={setSelectedRecord}
          />
        );
      case 'analytics':
        return <AnalyticsPage records={records} loading={loading} />;
      case 'upload':
        return <UploadPage onUploadSuccess={handleUploadSuccess} />;
      case 'share':
        return <SharePage records={records} />;
      case 'search':
        return <SearchPage records={records} onRecordSelect={setSelectedRecord} />;
      case 'chat':
        return <ChatPage />;
      default:
        return null;
    }
  };

  /* ── Guest shared-portal render ──────────────────── */
  if (shareToken) {
    return (
      <div className="min-h-screen flex flex-col p-4 md:p-8">
        {/* Guest Header */}
        <header className="w-full max-w-5xl mx-auto flex items-center justify-between pb-6 border-b border-white/5 mb-8">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-primary-500 rounded-xl text-white font-bold text-sm shadow-lg">
              Ω
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">Omnisage</h1>
              <p className="text-[10px] text-primary-500 font-semibold uppercase tracking-wider flex items-center">
                <ShieldCheck className="h-3.5 w-3.5 mr-1" /> Secure Shared Clinic Portal
              </p>
            </div>
          </div>
          <button
            onClick={() => window.location.href = '/'}
            className="text-xs text-slate-400 hover:text-white underline"
          >
            Access Main Portal
          </button>
        </header>

        <main className="flex-1 w-full max-w-5xl mx-auto">
          {loading ? (
            <div className="page-loading">
              <div className="spinner" />
              <p>Decrypting clinical records…</p>
            </div>
          ) : passcodeRequired ? (
            <div className="max-w-md mx-auto glass-panel p-8 space-y-6 mt-10">
              <div className="flex flex-col items-center text-center space-y-2">
                <div className="p-3.5 bg-primary-500/10 border border-primary-500/20 text-primary-500 rounded-full">
                  <Lock className="h-6 w-6" />
                </div>
                <h2 className="text-lg font-bold text-white">Security Passcode Required</h2>
                <p className="text-xs text-slate-400">
                  This shared medical portfolio is passcode-protected.
                </p>
              </div>
              <form
                onSubmit={e => { e.preventDefault(); loadSharedPortal(shareToken, passcode); }}
                className="space-y-4"
              >
                <input
                  type="password"
                  placeholder="Enter passcode"
                  value={passcode}
                  onChange={e => setPasscode(e.target.value)}
                  className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-sm text-center text-white focus:border-primary-500 focus:outline-none"
                  required
                />
                <button
                  type="submit"
                  className="w-full py-3 bg-primary-500 hover:bg-primary-600 text-white rounded-xl font-semibold text-xs tracking-wider uppercase transition-all"
                >
                  Decrypt Records
                </button>
              </form>
            </div>
          ) : shareError ? (
            <div className="max-w-md mx-auto glass-panel p-8 text-center space-y-4 mt-10">
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-500 rounded-full inline-block">
                <Lock className="h-6 w-6" />
              </div>
              <h2 className="text-lg font-bold text-white">Access Denied</h2>
              <p className="text-xs text-slate-400 leading-relaxed">{shareError}</p>
              <button
                onClick={() => window.location.href = '/'}
                className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl transition-all"
              >
                Back to Dashboard
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="glass-panel p-5 border-l-4 border-l-blue-500 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-white">Temporary Patient Portfolio</h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Viewing {sharedRecords.length} records approved for sharing.
                  </p>
                </div>
                <span className="text-xs text-slate-400 bg-slate-900 px-3 py-1.5 rounded-lg border border-white/5 shrink-0">
                  Read-Only Clinician Session
                </span>
              </div>
              <HealthTimeline records={sharedRecords} onRecordSelect={setSelectedRecord} />
            </div>
          )}
        </main>

        {selectedRecord && (
          <RecordDetailModal
            record={selectedRecord}
            onClose={() => setSelectedRecord(null)}
            onUpdate={rec => {
              if (rec) {
                setSharedRecords(prev => prev.map(r => r.id === rec.id ? rec : r));
                setSelectedRecord(rec);
              } else {
                setSharedRecords(prev => prev.filter(r => r.id !== selectedRecord.id));
                setSelectedRecord(null);
              }
            }}
          />
        )}
      </div>
    );
  }

  /* ── Resolving a stored session ────────────────── */
  if (authChecking) {
    return (
      <div className="page-loading" style={{ minHeight: '100vh' }}>
        <div className="spinner" />
        <p>Loading Omnisage…</p>
      </div>
    );
  }

  /* ── Not logged in: login / create-account page ──── */
  if (!currentUser) {
    return <AuthPage onAuthSuccess={handleAuthSuccess} />;
  }

  /* ── Main patient portal shell ─────────────────── */
  return (
    <div className="app-shell">
      {/* Fixed Left Sidebar */}
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        user={currentUser}
        onLogout={handleLogout}
      />

      {/* Scrollable Main Content */}
      <main className="app-main">
        {renderPage()}
      </main>

      {/* Transient post-login greeting */}
      {greeting && (
        <div className="toast-greeting">{greeting}</div>
      )}

      {/* Global detail modal (triggered from any tab) */}
      {selectedRecord && (
        <RecordDetailModal
          record={selectedRecord}
          onClose={() => setSelectedRecord(null)}
          onUpdate={handleRecordUpdate}
        />
      )}
    </div>
  );
}
