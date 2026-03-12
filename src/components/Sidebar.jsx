"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUser } from "@auth0/nextjs-auth0/client";

export default function Sidebar() {
  const pathname = usePathname();
  const { user } = useUser();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close sidebar on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const navItems = [
    { href: "/dashboard", icon: "📊", label: "Dashboard" },
    { href: "/agent", icon: "🤖", label: "AI Agent" },
    { href: "/connections", icon: "🔗", label: "Connections" },
    { href: "/activity", icon: "📋", label: "Activity Ledger" },
    { href: "/permissions", icon: "🛡️", label: "Permissions" },
  ];

  return (
    <>
      {/* Hamburger button - visible only on mobile, hidden when sidebar open */}
      {!mobileOpen && (
        <button
          className="hamburger-btn"
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
        >
          <span className="hamburger-line" />
          <span className="hamburger-line" />
          <span className="hamburger-line" />
        </button>
      )}

      {/* Overlay backdrop */}
      {mobileOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside className={`sidebar ${mobileOpen ? "mobile-open" : ""}`}>
      {/* Close button inside sidebar - visible only on mobile */}
      <button
        className="sidebar-close-btn"
        onClick={() => setMobileOpen(false)}
        aria-label="Close menu"
      >
        ✕
      </button>

      <Link href="/dashboard" className="sidebar-brand">
        <div className="sidebar-brand-icon">AV</div>
        <span className="sidebar-brand-text">AgentVault</span>
        <span className="sidebar-brand-badge">Beta</span>
      </Link>

      <div className="sidebar-section">
        <div className="sidebar-section-label">Navigation</div>
        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`sidebar-link ${pathname === item.href ? "active" : ""}`}
            >
              <span className="sidebar-link-icon">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="sidebar-section">
        <div className="sidebar-section-label">Auth0 Token Vault</div>
        <nav className="sidebar-nav">
          <div className="sidebar-link" style={{ cursor: "default" }}>
            <span className="sidebar-link-icon">🔐</span>
            <span>
              Vault Active
              <span
                style={{
                  display: "inline-block",
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "#10b981",
                  marginLeft: 6,
                  verticalAlign: "middle",
                }}
              />
            </span>
          </div>
        </nav>
      </div>

      {user && (
        <div className="sidebar-user">
          <img
            src={user.picture || ""}
            alt={user.name || "User"}
            className="sidebar-user-avatar"
          />
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">{user.name}</div>
            <div className="sidebar-user-email">{user.email}</div>
          </div>
          <a href="/auth/logout" className="sidebar-logout-btn" title="Log out">
            ↗
          </a>
        </div>
      )}
    </aside>
    </>
  );
}
