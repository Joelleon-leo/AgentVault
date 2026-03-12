"use client";

import { useState } from "react";

const SERVICE_ACTIONS = {
  github: {
    name: "GitHub",
    icon: "🐙",
    actions: [
      { id: "read_issues", label: "Read Issues", risk: "low" },
      { id: "read_repos", label: "Read Repositories", risk: "low" },
      { id: "read_prs", label: "Read Pull Requests", risk: "low" },
      { id: "create_issue", label: "Create Issues", risk: "medium" },
      { id: "delete_repo", label: "Delete Repository", risk: "high" },
    ],
  },
  gmail: {
    name: "Gmail",
    icon: "📧",
    actions: [
      { id: "read_email", label: "Read Emails", risk: "low" },
      { id: "send_email", label: "Send Email", risk: "medium" },
      { id: "bulk_send", label: "Bulk Send Emails", risk: "high" },
      { id: "delete_email", label: "Delete Emails", risk: "high" },
    ],
  },
  "google-drive": {
    name: "Google Drive",
    icon: "📁",
    actions: [
      { id: "read_files", label: "Read Files", risk: "low" },
      { id: "write_files", label: "Write Files", risk: "medium" },
      { id: "delete_files", label: "Delete Files", risk: "high" },
      { id: "manage_sharing", label: "Manage Sharing", risk: "high" },
    ],
  },
};

const RISK_STYLES = {
  low: { label: "Low", color: "#4ade80", bg: "rgba(34,197,94,0.15)", border: "rgba(34,197,94,0.3)" },
  medium: { label: "Medium", color: "#fbbf24", bg: "rgba(251,191,36,0.15)", border: "rgba(251,191,36,0.3)" },
  high: { label: "High", color: "#ef4444", bg: "rgba(239,68,68,0.15)", border: "rgba(239,68,68,0.3)" },
};

export default function PermissionsClient({ initialPermissions, initialPolicies }) {
  const [permissions, setPermissions] = useState(initialPermissions);
  const [policies, setPolicies] = useState(initialPolicies);
  const [saving, setSaving] = useState(false);

  const updatePermission = async (field, value) => {
    const updated = { ...permissions, [field]: value };
    setPermissions(updated);
    setSaving(true);
    try {
      await fetch("/api/permissions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleServicePolicy = async (serviceId, enabled) => {
    const updated = {
      ...policies,
      [serviceId]: { ...policies[serviceId], enabled },
    };
    setPolicies(updated);
    setSaving(true);
    try {
      await fetch("/api/firewall", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [serviceId]: { ...policies[serviceId], enabled } }),
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleAction = async (serviceId, actionId) => {
    const current = policies[serviceId]?.allowedActions || [];
    const newActions = current.includes(actionId)
      ? current.filter((a) => a !== actionId)
      : [...current, actionId];
    const updated = {
      ...policies,
      [serviceId]: { ...policies[serviceId], allowedActions: newActions },
    };
    setPolicies(updated);
    setSaving(true);
    try {
      await fetch("/api/firewall", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          [serviceId]: { ...policies[serviceId], allowedActions: newActions },
        }),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h1>Agent Permissions</h1>
        <p>
          Configure the AI Permission Firewall. Control what the agent can and
          cannot do. Every action is intercepted and validated before execution.
        </p>
      </div>

      {/* Global firewall settings */}
      <div className="card" style={{ padding: 0, overflow: "hidden", maxWidth: 700 }}>
        <div
          style={{
            padding: "1rem 1.25rem",
            borderBottom: "1px solid var(--border-color)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 600 }}>
            🛡️ AI Permission Firewall
          </h3>
          {saving && (
            <span style={{ fontSize: "0.75rem", color: "var(--accent-blue)", fontWeight: 500 }}>
              Saving…
            </span>
          )}
        </div>

        <div className="permission-row">
          <div>
            <div className="permission-label">Enable AI Agent</div>
            <div className="permission-desc">
              Allow the AI agent to process requests and interact with your
              connected services.
            </div>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={permissions.enabled}
              onChange={(e) => updatePermission("enabled", e.target.checked)}
            />
            <span className="toggle-slider" />
          </label>
        </div>

        <div className="permission-row">
          <div>
            <div className="permission-label">Require Approval for Actions</div>
            <div className="permission-desc">
              Agent must request explicit approval before performing write
              operations (send, create, delete).
            </div>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={permissions.requireApproval}
              onChange={(e) => updatePermission("requireApproval", e.target.checked)}
            />
            <span className="toggle-slider" />
          </label>
        </div>

        <div className="permission-row">
          <div>
            <div className="permission-label">Rate Limit</div>
            <div className="permission-desc">
              Maximum number of agent actions allowed per hour.
            </div>
          </div>
          <select
            value={permissions.maxActionsPerHour}
            onChange={(e) =>
              updatePermission("maxActionsPerHour", parseInt(e.target.value, 10))
            }
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-color)",
              borderRadius: "var(--radius-sm)",
              padding: "0.4rem 0.75rem",
              color: "var(--text-primary)",
              fontSize: "0.85rem",
              fontFamily: "inherit",
            }}
          >
            <option value={5}>5 / hour</option>
            <option value={10}>10 / hour</option>
            <option value={25}>25 / hour</option>
            <option value={50}>50 / hour</option>
            <option value={100}>100 / hour</option>
          </select>
        </div>
      </div>

      {/* Agent Firewall Policies — per service */}
      <div style={{ marginTop: "2rem" }}>
        <h3 style={{ margin: "0 0 1rem", fontSize: "1rem", fontWeight: 600 }}>
          🔒 Agent Firewall Policies
        </h3>
        <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "1rem" }}>
          Define exactly which actions the AI agent can perform on each service.
          High-risk actions require step-up MFA authentication.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem", maxWidth: 700 }}>
          {Object.entries(SERVICE_ACTIONS).map(([serviceId, serviceDef]) => {
            const policy = policies[serviceId] || { enabled: false, allowedActions: [] };
            return (
              <div
                key={serviceId}
                className="card"
                style={{
                  padding: 0,
                  overflow: "hidden",
                  opacity: policy.enabled ? 1 : 0.6,
                  transition: "opacity 0.2s",
                }}
              >
                <div
                  style={{
                    padding: "0.85rem 1.25rem",
                    borderBottom: "1px solid var(--border-color)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span style={{ fontSize: "1.2rem" }}>{serviceDef.icon}</span>
                    <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>{serviceDef.name}</span>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={policy.enabled}
                      onChange={(e) => toggleServicePolicy(serviceId, e.target.checked)}
                    />
                    <span className="toggle-slider" />
                  </label>
                </div>
                {policy.enabled && (
                  <div style={{ padding: "0.75rem 1.25rem" }}>
                    <div
                      style={{
                        fontSize: "0.7rem",
                        fontWeight: 600,
                        color: "var(--text-muted)",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        marginBottom: "0.5rem",
                      }}
                    >
                      Allowed Actions
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                      {serviceDef.actions.map((action) => {
                        const isAllowed = policy.allowedActions.includes(action.id);
                        const riskStyle = RISK_STYLES[action.risk];
                        return (
                          <label
                            key={action.id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "0.6rem",
                              padding: "0.4rem 0.5rem",
                              borderRadius: "var(--radius-sm)",
                              cursor: "pointer",
                              background: isAllowed ? "rgba(255,255,255,0.03)" : "transparent",
                              transition: "background 0.15s",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={isAllowed}
                              onChange={() => toggleAction(serviceId, action.id)}
                              style={{ accentColor: "var(--accent-blue)" }}
                            />
                            <span style={{ flex: 1, fontSize: "0.82rem" }}>{action.label}</span>
                            <span
                              style={{
                                fontSize: "0.62rem",
                                fontWeight: 600,
                                padding: "2px 8px",
                                borderRadius: "4px",
                                background: riskStyle.bg,
                                color: riskStyle.color,
                                border: `1px solid ${riskStyle.border}`,
                                textTransform: "uppercase",
                              }}
                            >
                              {riskStyle.label}
                              {action.risk === "high" && " — MFA"}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Architecture Diagram */}
      <div className="arch-diagram" style={{ marginTop: "2rem" }}>
        <h3
          style={{
            margin: "0 0 1rem",
            fontSize: "1rem",
            fontWeight: 600,
          }}
        >
          How the Permission Firewall Works
        </h3>
        <div className="arch-flow">
          <div className="arch-node">
            <div className="arch-node-icon">🤖</div>
            <div className="arch-node-label">Agent Request</div>
            <div className="arch-node-sub">&quot;Read GitHub issues&quot;</div>
          </div>
          <div className="arch-arrow">→</div>
          <div className="arch-node firewall">
            <div className="arch-node-icon">🛡️</div>
            <div className="arch-node-label">Firewall Check</div>
            <div className="arch-node-sub">Policy + Rate Limit</div>
          </div>
          <div className="arch-arrow">→</div>
          <div className="arch-node" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)" }}>
            <div className="arch-node-icon">⚠️</div>
            <div className="arch-node-label">Risk Check</div>
            <div className="arch-node-sub">Step-up MFA if high</div>
          </div>
          <div className="arch-arrow">→</div>
          <div className="arch-node vault">
            <div className="arch-node-icon">🔐</div>
            <div className="arch-node-label">Token Vault</div>
            <div className="arch-node-sub">Issue scoped token</div>
          </div>
          <div className="arch-arrow">→</div>
          <div className="arch-node">
            <div className="arch-node-icon">✅</div>
            <div className="arch-node-label">Execute</div>
            <div className="arch-node-sub">API call made</div>
          </div>
        </div>
      </div>
    </div>
  );
}
