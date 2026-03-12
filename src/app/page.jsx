import { auth0 } from "@/lib/auth0";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function Home() {
  const session = await auth0.getSession();

  // If already logged in, redirect to dashboard
  if (session?.user) {
    redirect("/dashboard");
  }

  return (
    <div className="landing-page">
      {/* Nav */}
      <nav className="landing-nav">
        <div className="landing-logo">
          <div className="sidebar-brand-icon">AV</div>
          <span className="sidebar-brand-text">AgentVault</span>
        </div>
        <a href="/auth/login" className="btn btn-primary btn-sm">
          Sign In
        </a>
      </nav>

      {/* Hero */}
      <section className="landing-hero">
        <div className="landing-badge">
          🔐 Powered by Auth0 Token Vault
        </div>
        <h1 className="landing-title">
          Secure Authorization{" "}
          <span className="gradient-text">for AI Agents</span>
        </h1>
        <p className="landing-subtitle">
          AgentVault is a controlled intermediary layer between AI agents and
          your apps. Connect services, grant scoped permissions, and monitor
          every action — all secured by Auth0 Token Vault.
        </p>
        <div className="landing-cta">
          <a href="/auth/login" className="btn btn-primary btn-lg">
            Get Started →
          </a>
          <a href="#features" className="btn btn-ghost btn-lg">
            How It Works
          </a>
        </div>
      </section>

      {/* Architecture */}
      <div className="arch-diagram" style={{ marginBottom: "3rem" }}>
        <h3 style={{ margin: "0 0 1.25rem", fontSize: "1rem", fontWeight: 600, textAlign: "center" }}>
          How AgentVault Works
        </h3>
        <div className="arch-flow">
          <div className="arch-node">
            <div className="arch-node-icon">👤</div>
            <div className="arch-node-label">User</div>
            <div className="arch-node-sub">Auth0 login</div>
          </div>
          <div className="arch-arrow">→</div>
          <div className="arch-node firewall">
            <div className="arch-node-icon">🛡️</div>
            <div className="arch-node-label">Permission Firewall</div>
            <div className="arch-node-sub">Scope check</div>
          </div>
          <div className="arch-arrow">→</div>
          <div className="arch-node vault">
            <div className="arch-node-icon">🔐</div>
            <div className="arch-node-label">Auth0 Token Vault</div>
            <div className="arch-node-sub">OAuth management</div>
          </div>
          <div className="arch-arrow">→</div>
          <div className="arch-node">
            <div className="arch-node-icon">🤖</div>
            <div className="arch-node-label">AI Agent</div>
            <div className="arch-node-sub">Controlled access</div>
          </div>
          <div className="arch-arrow">→</div>
          <div className="arch-node">
            <div className="arch-node-icon">🌐</div>
            <div className="arch-node-label">APIs</div>
            <div className="arch-node-sub">GitHub, Gmail, etc.</div>
          </div>
        </div>
      </div>

      {/* Features */}
      <section id="features" className="landing-features">
        <div className="feature-card">
          <div className="feature-icon" style={{ background: "var(--accent-amber-glow)", color: "var(--accent-amber)" }}>
            🛡️
          </div>
          <div className="feature-title">AI Permission Firewall</div>
          <div className="feature-desc">
            AI agents must request explicit permission before accessing any
            service. Every action goes through scope validation and consent
            checks.
          </div>
        </div>

        <div className="feature-card">
          <div className="feature-icon" style={{ background: "var(--accent-purple-glow)", color: "var(--accent-purple)" }}>
            🔐
          </div>
          <div className="feature-title">Token Vault Controlled</div>
          <div className="feature-desc">
            All OAuth tokens are managed exclusively by Auth0 Token Vault. No
            credentials are ever exposed to the AI agent or stored
            outside the vault.
          </div>
        </div>

        <div className="feature-card">
          <div className="feature-icon" style={{ background: "var(--accent-blue-glow)", color: "var(--accent-blue)" }}>
            📋
          </div>
          <div className="feature-title">Agent Activity Ledger</div>
          <div className="feature-desc">
            Every action performed by an agent is immutably logged. Full audit
            trail of token requests, API calls, approvals, and denials.
          </div>
        </div>
      </section>
    </div>
  );
}