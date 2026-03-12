"use client";

import Link from "next/link";
import { useState, useEffect } from "react";

export default function DashboardClient({
  connections,
  activity,
  permissions,
  userName,
}) {
  const connectedCount = connections.length;
  const [actionsToday, setActionsToday] = useState(0);
  const blockedCount = activity.filter((a) => a.status === "blocked").length;
  const firewallEvents = activity.filter((a) => a.type === "firewall").length;

  useEffect(() => {
    const today = new Date().toDateString();
    setActionsToday(activity.filter((a) => new Date(a.timestamp).toDateString() === today).length);
  }, [activity]);

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h1>Welcome back, {userName?.split(" ")[0] || "User"}</h1>
        <p>Here&apos;s an overview of your AgentVault activity and connected services.</p>
      </div>

      {/* Stats Row */}
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-icon blue">🔗</div>
          <div className="stat-content">
            <div className="stat-value">{connectedCount}</div>
            <div className="stat-label">Connected Apps</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green">✅</div>
          <div className="stat-content">
            <div className="stat-value">{actionsToday}</div>
            <div className="stat-label">Actions Today</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon red">🚫</div>
          <div className="stat-content">
            <div className="stat-value">{blockedCount}</div>
            <div className="stat-label">Blocked Attempts</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon orange">🔥</div>
          <div className="stat-content">
            <div className="stat-value">{firewallEvents}</div>
            <div className="stat-label">Firewall Events</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon purple">🔐</div>
          <div className="stat-content">
            <div className="stat-value">{permissions.enabled ? "ON" : "OFF"}</div>
            <div className="stat-label">Agent Status</div>
          </div>
        </div>
      </div>

      {/* Architecture Diagram */}
      <div className="arch-diagram">
        <h3 style={{ margin: "0 0 1.25rem", fontSize: "1rem", fontWeight: 600 }}>
          AgentVault Architecture
        </h3>
        <div className="arch-flow">
          <div className="arch-node">
            <div className="arch-node-icon">👤</div>
            <div className="arch-node-label">User</div>
            <div className="arch-node-sub">Authenticated</div>
          </div>
          <div className="arch-arrow">→</div>
          <div className="arch-node firewall">
            <div className="arch-node-icon">🛡️</div>
            <div className="arch-node-label">Permission Firewall</div>
            <div className="arch-node-sub">Scope validation</div>
          </div>
          <div className="arch-arrow">→</div>
          <div className="arch-node vault">
            <div className="arch-node-icon">🔐</div>
            <div className="arch-node-label">Auth0 Token Vault</div>
            <div className="arch-node-sub">OAuth tokens</div>
          </div>
          <div className="arch-arrow">→</div>
          <div className="arch-node">
            <div className="arch-node-icon">🤖</div>
            <div className="arch-node-label">AI Agent</div>
            <div className="arch-node-sub">Scoped access</div>
          </div>
          <div className="arch-arrow">→</div>
          <div className="arch-node">
            <div className="arch-node-icon">📋</div>
            <div className="arch-node-label">Activity Log</div>
            <div className="arch-node-sub">Full audit trail</div>
          </div>
          <div className="arch-arrow">→</div>
          <div className="arch-node">
            <div className="arch-node-icon">🌐</div>
            <div className="arch-node-label">APIs</div>
            <div className="arch-node-sub">GitHub, Gmail...</div>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", marginTop: "1.5rem" }}>
        {/* Quick Actions */}
        <div className="card">
          <h3 style={{ margin: "0 0 1rem", fontSize: "1rem", fontWeight: 600 }}>
            Quick Actions
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <Link href="/agent" className="btn btn-primary" style={{ textAlign: "center" }}>
              🤖 Talk to AI Agent
            </Link>
            <Link href="/connections" className="btn btn-ghost" style={{ textAlign: "center" }}>
              🔗 Manage Connections
            </Link>
            <Link href="/activity" className="btn btn-ghost" style={{ textAlign: "center" }}>
              📋 View Activity Log
            </Link>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "1rem 1.25rem 0.5rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 600 }}>
              Recent Activity
            </h3>
            <Link href="/activity" style={{ fontSize: "0.78rem", color: "var(--accent-blue)" }}>
              View all →
            </Link>
          </div>
          {activity.length === 0 ? (
            <div className="empty-state" style={{ padding: "2rem" }}>
              <div className="empty-state-icon">📋</div>
              <div className="empty-state-desc">No activity yet. Try talking to the AI Agent!</div>
            </div>
          ) : (
            <div className="activity-list">
              {activity.slice(0, 5).map((entry) => (
                <div key={entry.id} className="activity-item">
                  <div className={`activity-icon ${entry.status === "blocked" ? "blocked" : entry.status === "success" ? "success" : "info"}`}>
                    {entry.status === "blocked" ? "🚫" : entry.type === "token_vault" ? "🔐" : entry.type === "agent_action" ? "🤖" : "✅"}
                  </div>
                  <div className="activity-body">
                    <div className="activity-title">{entry.detail}</div>
                    <div className="activity-detail">{entry.service} · {entry.action}</div>
                  </div>
                  <div className="activity-time" suppressHydrationWarning>
                    {new Date(entry.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
