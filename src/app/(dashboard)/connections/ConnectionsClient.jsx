"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";

export default function ConnectionsClient({ available, initialConnected, initialTokenMeta }) {
  const [connected, setConnected] = useState(initialConnected);
  const [tokenMeta, setTokenMeta] = useState(initialTokenMeta || {});
  const [selectedScopes, setSelectedScopes] = useState({});
  const [loading, setLoading] = useState(null);
  const [notification, setNotification] = useState(null);
  const searchParams = useSearchParams();

  // Handle OAuth callback notifications
  useEffect(() => {
    const connectedService = searchParams.get("connected");
    const error = searchParams.get("error");
    if (connectedService) {
      setNotification({ type: "success", message: `${connectedService} connected successfully via OAuth!` });
      // Refresh connections
      fetch("/api/connections")
        .then((r) => r.json())
        .then((data) => {
          if (data.connected) setConnected(data.connected);
          if (data.tokenMeta) setTokenMeta(data.tokenMeta);
        });
      // Clear URL params
      window.history.replaceState({}, "", "/connections");
    } else if (error) {
      setNotification({ type: "error", message: `OAuth error: ${decodeURIComponent(error)}` });
      window.history.replaceState({}, "", "/connections");
    }
  }, [searchParams]);

  // Auto-dismiss notification
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const isConnected = (serviceId) =>
    connected.some((c) => c.serviceId === serviceId);

  const getConnection = (serviceId) =>
    connected.find((c) => c.serviceId === serviceId);

  const toggleScope = (serviceId, scope) => {
    setSelectedScopes((prev) => {
      const current = prev[serviceId] || [];
      return {
        ...prev,
        [serviceId]: current.includes(scope)
          ? current.filter((s) => s !== scope)
          : [...current, scope],
      };
    });
  };

  const handleConnect = async (serviceId) => {
    const scopes = selectedScopes[serviceId];
    if (!scopes || scopes.length === 0) return;

    const service = available.find((s) => s.id === serviceId);

    // If real OAuth is configured, redirect to OAuth flow
    if (service?.oauthConfigured) {
      setLoading(serviceId);
      const scopeParam = scopes.join(",");
      window.location.href = `/api/oauth/${serviceId}?scopes=${encodeURIComponent(scopeParam)}`;
      return;
    }

    // Fallback: simulated connection (for services without OAuth configured)
    setLoading(serviceId);
    try {
      const res = await fetch("/api/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceId, scopes }),
      });
      const data = await res.json();
      if (data.connections) {
        setConnected(data.connections);
        setNotification({ type: "success", message: `${service?.name || serviceId} connected (demo mode)` });
      }
    } finally {
      setLoading(null);
    }
  };

  const handleDisconnect = async (serviceId) => {
    setLoading(serviceId);
    try {
      const res = await fetch(`/api/connections?serviceId=${encodeURIComponent(serviceId)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.connections) {
        setConnected(data.connections);
        setSelectedScopes((prev) => ({ ...prev, [serviceId]: [] }));
        const service = available.find((s) => s.id === serviceId);
        setNotification({ type: "success", message: `${service?.name || serviceId} disconnected. Tokens revoked.` });
      } else {
        setNotification({ type: "error", message: data.error || "Failed to disconnect" });
      }
    } catch (err) {
      setNotification({ type: "error", message: "Network error while disconnecting" });
    } finally {
      setLoading(null);
    }
  };

  const serviceIcons = {
    github: "🐙",
    "google-drive": "📁",
    gmail: "📧",
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h1>Connected Services</h1>
        <p>
          Link your apps to let AI agents access them securely through Auth0
          Token Vault. All tokens are stored and managed exclusively in the
          vault.
        </p>
      </div>

      {/* Notification banner */}
      {notification && (
        <div className={`notification-banner ${notification.type}`}>
          <span>{notification.type === "success" ? "✅" : "❌"} {notification.message}</span>
          <button onClick={() => setNotification(null)} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: "1.1rem" }}>✕</button>
        </div>
      )}

      <div className="card-grid">
        {available.map((service) => {
          const conn = getConnection(service.id);
          const currentScopes =
            selectedScopes[service.id] || conn?.grantedScopes || [];
          const isActive = isConnected(service.id);
          const isLoading = loading === service.id;

          return (
            <div
              key={service.id}
              className={`connection-card ${isActive ? "connected" : ""}`}
            >
              <div className="connection-header">
                <div
                  className="connection-icon"
                  style={{
                    background: service.bgColor,
                    color: service.color,
                  }}
                >
                  {serviceIcons[service.id] || "🔗"}
                </div>
                <div className="connection-info">
                  <div className="connection-name">{service.name}</div>
                  <div className="connection-desc">{service.description}</div>
                </div>
                <span
                  className={`connection-status ${isActive ? "active" : "inactive"}`}
                >
                  {isActive ? "Connected" : "Not Connected"}
                </span>
              </div>
              {/* OAuth mode indicator */}
              <div style={{ marginTop: "0.25rem" }}>
                {service.oauthConfigured ? (
                  <span className="vault-badge" style={{ fontSize: "0.65rem" }}>🔑 Real OAuth</span>
                ) : (
                  <span style={{ fontSize: "0.65rem", color: "var(--text-muted)", background: "rgba(255,255,255,0.05)", padding: "2px 8px", borderRadius: "4px" }}>⚡ Demo Mode</span>
                )}
              </div>

              {/* Scopes */}
              <div>
                <div
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    color: "var(--text-muted)",
                    marginBottom: "0.4rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  Permissions (scopes)
                </div>
                <div className="scope-list">
                  {service.scopes.map((scope) => (
                    <button
                      key={scope}
                      className={`scope-tag ${currentScopes.includes(scope) ? "selected" : ""}`}
                      onClick={() => toggleScope(service.id, scope)}
                      disabled={isActive}
                    >
                      {scope}
                    </button>
                  ))}
                </div>
              </div>

              {/* Token Vault Info when connected */}
              {isActive && conn && (
                <div style={{ background: "var(--bg-surface)", borderRadius: "var(--radius-sm)", padding: "0.6rem 0.75rem", fontSize: "0.72rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.35rem" }}>
                    <span className="vault-badge">🔐 Token Vault</span>
                    <span style={{ color: "var(--text-muted)" }}>
                      ID: {conn.tokenVaultId}
                    </span>
                  </div>
                  {tokenMeta[service.id] && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", color: "var(--text-secondary)" }}>
                      <span suppressHydrationWarning>
                        ⏱️ Expires:{" "}
                        {tokenMeta[service.id].expiresAt
                          ? tokenMeta[service.id].expired
                            ? <span style={{ color: "var(--accent-red)", fontWeight: 600 }}>Expired — will auto-refresh</span>
                            : new Date(tokenMeta[service.id].expiresAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
                          : "Non-expiring"}
                      </span>
                      {tokenMeta[service.id].hasRefreshToken && (
                        <span style={{ color: "var(--accent-green)" }}>🔄 Auto-refresh enabled</span>
                      )}
                      <span suppressHydrationWarning>
                        📅 Stored: {new Date(tokenMeta[service.id].storedAt).toLocaleDateString([], { month: "short", day: "numeric" })}
                      </span>
                    </div>
                  )}
                  {conn.grantedScopes && (
                    <div style={{ marginTop: "0.35rem", display: "flex", flexWrap: "wrap", gap: "0.25rem" }}>
                      {(Array.isArray(conn.grantedScopes) ? conn.grantedScopes : JSON.parse(conn.grantedScopes || "[]")).map((s) => (
                        <span key={s} style={{ background: "rgba(59,130,246,0.15)", color: "var(--accent-blue)", padding: "1px 6px", borderRadius: "3px", fontSize: "0.65rem" }}>
                          {s}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Action button */}
              <div>
                {isActive ? (
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => handleDisconnect(service.id)}
                    disabled={isLoading}
                  >
                    {isLoading ? "Disconnecting…" : "Disconnect & Revoke Tokens"}
                  </button>
                ) : (
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => handleConnect(service.id)}
                    disabled={isLoading || currentScopes.length === 0}
                  >
                    {isLoading
                      ? "Connecting…"
                      : service.oauthConfigured
                        ? `Connect with OAuth${currentScopes.length > 0 ? ` (${currentScopes.length} scopes)` : ""}`
                        : `Connect${currentScopes.length > 0 ? ` (${currentScopes.length} scopes)` : ""}`}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
