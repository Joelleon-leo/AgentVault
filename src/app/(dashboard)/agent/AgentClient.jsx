"use client";

import { useState, useRef, useEffect } from "react";

export default function AgentClient() {
  const [messages, setMessages] = useState([
    {
      role: "agent",
      content:
        "Hello! I'm the AgentVault AI assistant. I can interact with your connected services securely through Auth0 Token Vault.\n\nAll actions pass through the AI Permission Firewall before execution.\n\nTry asking me something like:\n• \"Summarize my latest GitHub issues\"\n• \"Read my latest emails\"\n• \"Check my Google Drive files\"\n• \"Delete my GitHub repository\" (blocked by firewall)",
    },
  ]);
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [stepUpModal, setStepUpModal] = useState(null);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaError, setMfaError] = useState("");
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const executeCommand = async (userMessage, extraBody = {}) => {
    setIsProcessing(true);
    try {
      const res = await fetch("/api/agent/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage, ...extraBody }),
      });

      const data = await res.json();

      if (data.steps) {
        // Check for step-up auth required
        const stepUpStep = data.steps.find((s) => s.type === "step_up_required");
        if (stepUpStep) {
          setStepUpModal({
            message: userMessage,
            actionDescription: stepUpStep.actionDescription,
            service: stepUpStep.service,
            riskLevel: stepUpStep.riskLevel,
          });
        }
        setMessages((prev) => [
          ...prev,
          { role: "agent", steps: data.steps },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "agent", content: data.error || "Something went wrong." },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "agent", content: "Failed to process your request. Please try again." },
      ]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim() || isProcessing) return;

    const userMessage = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    await executeCommand(userMessage);
  };

  const handleStepUpConfirm = async () => {
    if (!stepUpModal) return;
    // Validate MFA code — accept any 6-digit code for demo (in production, Auth0 verifies this)
    if (!/^\d{6}$/.test(mfaCode)) {
      setMfaError("Please enter a valid 6-digit code");
      return;
    }
    const { message } = stepUpModal;
    setStepUpModal(null);
    setMfaCode("");
    setMfaError("");
    setMessages((prev) => [
      ...prev,
      { role: "user", content: "✅ MFA verified — re-executing with step-up authentication" },
    ]);
    await executeCommand(message, { stepUpConfirmed: true });
  };

  const suggestions = [
    "Summarize my latest GitHub issues",
    "Read my latest emails",
    "Check my Google Drive files",
    "Delete my GitHub repository",
  ];

  return (
    <div className="agent-container animate-fade-in">
      <div className="page-header" style={{ marginBottom: "0.5rem" }}>
        <h1>🤖 AI Agent</h1>
        <p>
          Interact with your services through a secure, permission-controlled AI
          agent.
        </p>
      </div>

      {/* Messages */}
      <div className="agent-messages">
        {messages.map((msg, idx) => (
          <div key={idx} className={`agent-msg ${msg.role === "user" ? "user" : ""}`}>
            <div className={`agent-msg-avatar ${msg.role === "user" ? "user-avatar" : "ai"}`}>
              {msg.role === "user" ? "👤" : "🤖"}
            </div>
            <div>
              {msg.content && (
                <div className="agent-msg-bubble">
                  {msg.content.split("\n").map((line, i) => (
                    <span key={i}>
                      {line}
                      {i < msg.content.split("\n").length - 1 && <br />}
                    </span>
                  ))}
                </div>
              )}
              {msg.steps && (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: msg.content ? "0.5rem" : 0 }}>
                  {msg.steps.map((step, si) => (
                    <AgentStep key={si} step={step} />
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {isProcessing && (
          <div className="agent-msg">
            <div className="agent-msg-avatar ai">🤖</div>
            <div className="agent-msg-bubble animate-pulse">
              Processing your request through Token Vault…
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Suggestions (only if 1 message) */}
      {messages.length === 1 && (
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", padding: "0.5rem 0" }}>
          {suggestions.map((s) => (
            <button
              key={s}
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setInput(s);
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} className="agent-input-bar">
        <input
          type="text"
          className="agent-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask the agent to do something…"
          disabled={isProcessing}
          maxLength={500}
        />
        <button
          type="submit"
          className="btn btn-primary"
          disabled={isProcessing || !input.trim()}
        >
          {isProcessing ? "…" : "Send"}
        </button>
      </form>

      {/* Step-Up Authentication Modal */}
      {stepUpModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            backdropFilter: "blur(4px)",
          }}
          onClick={() => { setStepUpModal(null); setMfaCode(""); setMfaError(""); }}
        >
          <div
            className="card"
            style={{
              maxWidth: 440,
              width: "90%",
              padding: "2rem",
              textAlign: "center",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: "3rem", marginBottom: "0.5rem" }}>🔐</div>
            <h2 style={{ margin: "0 0 0.25rem", fontSize: "1.2rem", fontWeight: 700 }}>
              Auth0 Step-Up Authentication
            </h2>
            <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", margin: "0 0 0.75rem" }}>
              Multi-Factor Authentication required by the Permission Firewall
            </p>
            <div
              style={{
                background: "rgba(239,68,68,0.1)",
                border: "1px solid rgba(239,68,68,0.3)",
                borderRadius: "var(--radius-sm)",
                padding: "0.75rem",
                marginBottom: "1rem",
                fontSize: "0.8rem",
                textAlign: "left",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", marginBottom: "0.25rem" }}>
                <span style={{ color: "var(--accent-red)", fontWeight: 700, fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  ⚠️ High-Risk Action Detected
                </span>
              </div>
              <strong>Action:</strong> {stepUpModal.actionDescription}
              <br />
              <strong>Service:</strong> {stepUpModal.service}
              <br />
              <strong>Risk Level:</strong>{" "}
              <span style={{ color: "var(--accent-red)", fontWeight: 600 }}>
                {stepUpModal.riskLevel?.toUpperCase()}
              </span>
            </div>
            <div style={{ textAlign: "left", marginBottom: "0.75rem" }}>
              <label style={{ fontSize: "0.78rem", fontWeight: 600, display: "block", marginBottom: "0.35rem" }}>
                Enter 6-digit MFA code from your authenticator app
              </label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={mfaCode}
                onChange={(e) => { setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6)); setMfaError(""); }}
                placeholder="000000"
                autoFocus
                style={{
                  width: "100%",
                  padding: "0.6rem 0.75rem",
                  fontSize: "1.4rem",
                  fontFamily: "monospace",
                  letterSpacing: "0.5em",
                  textAlign: "center",
                  background: "var(--bg-surface)",
                  border: mfaError ? "1px solid var(--accent-red)" : "1px solid var(--border-color)",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--text-primary)",
                  outline: "none",
                }}
                onKeyDown={(e) => { if (e.key === "Enter") handleStepUpConfirm(); }}
              />
              {mfaError && (
                <p style={{ color: "var(--accent-red)", fontSize: "0.72rem", margin: "0.25rem 0 0" }}>
                  {mfaError}
                </p>
              )}
              <p style={{ color: "var(--text-muted)", fontSize: "0.68rem", margin: "0.35rem 0 0" }}>
                For demo purposes, enter any 6 digits. In production, Auth0 MFA validates the code via your enrolled authenticator.
              </p>
            </div>
            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center" }}>
              <button
                className="btn btn-ghost"
                onClick={() => { setStepUpModal(null); setMfaCode(""); setMfaError(""); }}
              >
                Cancel
              </button>
              <button
                className="btn btn-danger"
                onClick={handleStepUpConfirm}
                disabled={mfaCode.length !== 6}
              >
                🔐 Verify &amp; Execute
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AgentStep({ step }) {
  const iconMap = {
    firewall_check: "🛡️",
    firewall_blocked: "🚫",
    step_up_required: "⚠️",
    auth_check: "🔑",
    authorized: "✅",
    denied: "🚫",
    blocked: "🚫",
    error: "⚠️",
    result: "📄",
    summary: "🧠",
    logged: "📋",
    response: "💬",
  };

  const renderContent = () => {
    if (step.type === "result" && Array.isArray(step.content)) {
      return (
        <div style={{ overflowX: "auto" }}>
          <table className="agent-data-table">
            <thead>
              <tr>
                {Object.keys(step.content[0] || {}).map((key) => (
                  <th key={key}>{key}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {step.content.map((row, i) => (
                <tr key={i}>
                  {Object.values(row).map((val, j) => (
                    <td key={j}>
                      {Array.isArray(val) ? val.join(", ") : String(val)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    if (step.type === "summary" && typeof step.content === "string") {
      return (
        <div className="agent-step-detail" style={{ whiteSpace: "pre-wrap" }}>
          {step.content}
        </div>
      );
    }

    return <div className="agent-step-detail">{String(step.content)}</div>;
  };

  // Default scopes for async auth connect
  const asyncAuthScopes = {
    github: "repo:read,issues:read,pr:read",
    gmail: "mail:read,mail:send",
    "google-drive": "files:read",
  };

  return (
    <div className={`agent-step ${step.type}`}>
      <div className="agent-step-icon">{iconMap[step.type] || "ℹ️"}</div>
      <div className="agent-step-content">
        <div className="agent-step-title">
          {step.title}
          {step.type === "result" && (
            <span style={{
              marginLeft: "0.5rem",
              fontSize: "0.65rem",
              padding: "2px 8px",
              borderRadius: "4px",
              fontWeight: 600,
              background: step.isRealData ? "rgba(34, 197, 94, 0.2)" : "rgba(251, 191, 36, 0.2)",
              color: step.isRealData ? "#4ade80" : "#fbbf24",
              border: `1px solid ${step.isRealData ? "rgba(34, 197, 94, 0.3)" : "rgba(251, 191, 36, 0.3)"}`,
            }}>
              {step.isRealData ? "🔴 LIVE DATA" : "⚡ DEMO DATA"}
            </span>
          )}
        </div>
        {renderContent()}
        {step.asyncAuth && step.serviceId && (
          <a
            href={`/api/oauth/${step.serviceId}?scopes=${encodeURIComponent(asyncAuthScopes[step.serviceId] || "")}`}
            className="btn btn-primary btn-sm"
            style={{ marginTop: "0.5rem", display: "inline-block", textDecoration: "none" }}
          >
            🔗 Connect {step.service} Now
          </a>
        )}
        {step.tokenInfo && (
          <div style={{ marginTop: "0.35rem" }}>
            <span className="vault-badge">
              🔐 Vault: {step.tokenInfo.tokenVaultId}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
