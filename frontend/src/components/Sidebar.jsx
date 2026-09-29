/**
 * Sidebar.jsx
 *
 * Fixed left navigation sidebar for the Omnisage application.
 * Renders the app logo, tab navigation items (icon + label), and a
 * user profile card at the bottom. Highlights the currently active tab
 * with a glowing blue left-border accent. Collapses to icon-only on small screens.
 */

import React from 'react';
import {
  LayoutDashboard,
  ClipboardList,
  TrendingUp,
  Upload,
  Share2,
  Search,
  MessageSquare,
  Heart,
  User,
  LogOut,
} from 'lucide-react';

/** Navigation tab definitions */
const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard',  icon: LayoutDashboard },
  { id: 'search',    label: 'Search',     icon: Search          },
  { id: 'records',   label: 'Records',    icon: ClipboardList   },
  { id: 'analytics', label: 'Analytics',  icon: TrendingUp      },
  { id: 'upload',    label: 'Upload',     icon: Upload          },
  { id: 'share',     label: 'Share',      icon: Share2          },
  { id: 'chat',      label: 'AI Chat',    icon: MessageSquare   },
];

/**
 * Sidebar navigation component.
 *
 * @param {Object}   props
 * @param {string}   props.activeTab   - The currently active tab id.
 * @param {Function} props.onTabChange - Callback invoked with the new tab id.
 * @param {Object}   [props.user]      - The signed-in user's profile (id, email, full_name).
 * @param {Function} [props.onLogout]  - Callback invoked when the sign-out button is clicked.
 * @returns {JSX.Element}
 */
export default function Sidebar({ activeTab, onTabChange, user, onLogout }) {
  return (
    <aside className="sidebar">
      {/* ── Logo ─────────────────────────────────── */}
      <div className="sidebar-logo">
        <div className="logo-icon">
          <Heart className="h-4 w-4" />
        </div>
        <div className="logo-text">
          <span className="logo-name">Omnisage</span>
          <span className="logo-sub">Medical Ledger</span>
        </div>
      </div>

      {/* ── Navigation Items ─────────────────────── */}
      <nav className="sidebar-nav">
        <p className="nav-section-label">Navigation</p>
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              id={`nav-${id}`}
              onClick={() => onTabChange(id)}
              className={`nav-item ${isActive ? 'nav-item--active' : ''}`}
              title={label}
            >
              <span className="nav-item-icon">
                <Icon className="h-[18px] w-[18px]" />
              </span>
              <span className="nav-item-label">{label}</span>
              {isActive && <span className="nav-item-pip" />}
            </button>
          );
        })}
      </nav>

      {/* ── User Card ────────────────────────────── */}
      <div className="sidebar-user">
        <div className="user-avatar">
          <User className="h-4 w-4" />
        </div>
        <div className="user-info">
          <p className="user-name">{user?.full_name || user?.email || 'Account'}</p>
          <p className="user-status">
            <span className="status-dot" />
            Active Account
          </p>
        </div>
        {onLogout && (
          <button
            type="button"
            onClick={onLogout}
            className="sidebar-logout-btn"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        )}
      </div>
    </aside>
  );
}
