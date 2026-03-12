"use client";

import { useState, useEffect } from "react";

export default function ActivityClient({ initialLog }) {
  const [log, setLog] = useState(initialLog);
  const [filter, setFilter] = useState("all");

  // Refresh log periodically
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/activity?limit=100");
        const data = await res.json();
        if (data.log) setLog(data.log);
      } catch {
        // silent
      }
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const filteredLog = filter === "all" ? log : log.filter((e) => e.type === filter);

  const typeIcons = {
    connection: "🔗",
    token_vault: "🔐",
    agent_action: "🤖",
    permission: "🛡️",
    firewall: "🔥",
  };

  const statusClasses = {
    success: "success",
    blocked: "blocked",
    warning: "warning",
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h1>Activity Ledger</h1>
        <p>
          Complete audit trail of all agent actions, token vault operations, and
          permission changes. Every action is immutably logged.
        </p>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
        {[
          { key: "all", label: "All" },
          { key: "firewall", label: "🔥 Firewall" },
          { key: "agent_action", label: "🤖 Agent Actions" },
          { key: "token_vault", label: "🔐 Token Vault" },
          { key: "connection", label: "🔗 Connections" },
          { key: "permission", label: "🛡️ Permissions" },
        ].map((f) => (
          <button
            key={f.key}
            className={`btn btn-sm ${filter === f.key ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Activity List */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {filteredLog.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📋</div>
            <div className="empty-state-title">No activity recorded</div>
            <div className="empty-state-desc">
              Start using the AI Agent or connect services to see activity logged
              here.
            </div>
          </div>
        ) : (
          <div className="activity-list">
            {filteredLog.map((entry) => (
              <div key={entry.id} className="activity-item">
                <div
                  className={`activity-icon ${statusClasses[entry.status] || "info"}`}
                >
                  {typeIcons[entry.type] || "ℹ️"}
                </div>
                <div className="activity-body">
                  <div className="activity-title">{entry.detail}</div>
                  <div className="activity-detail">
                    {entry.service && (
                      <span
                        style={{
                          background: "var(--bg-surface)",
                          padding: "0.1rem 0.4rem",
                          borderRadius: 4,
                          marginRight: "0.5rem",
                          fontSize: "0.7rem",
                        }}
                      >
                        {entry.service}
                      </span>
                    )}
                    {entry.action}
                    {entry.status === "blocked" && (
                      <span
                        style={{
                          color: "var(--accent-red)",
                          fontWeight: 600,
                          marginLeft: "0.5rem",
                        }}
                      >
                        BLOCKED
                      </span>
                    )}
                  </div>
                </div>
                <div className="activity-time" suppressHydrationWarning>
                  {new Date(entry.timestamp).toLocaleString([], {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
