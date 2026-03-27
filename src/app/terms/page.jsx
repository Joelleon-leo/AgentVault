export const metadata = {
  title: "Terms of Service | AgentVault",
};

export default function TermsPage() {
  return (
    <main style={{ maxWidth: 860, margin: "0 auto", padding: "2rem 1rem", color: "#e5e7eb" }}>
      <h1 style={{ fontSize: "2rem", marginBottom: "1rem" }}>Terms of Service</h1>
      <p style={{ opacity: 0.9, marginBottom: "1rem" }}>Last updated: March 16, 2026</p>

      <p style={{ lineHeight: 1.7, marginBottom: "1rem" }}>
        By using AgentVault, you agree to use the service in compliance with all
        applicable laws and the terms of connected third-party platforms.
      </p>

      <h2 style={{ marginTop: "1.5rem", marginBottom: "0.5rem" }}>User responsibilities</h2>
      <ul style={{ lineHeight: 1.7, paddingLeft: "1.25rem" }}>
        <li>You are responsible for actions performed through your account.</li>
        <li>You must grant only the scopes you trust and require.</li>
        <li>You can revoke connections at any time from the Connections page.</li>
      </ul>

      <h2 style={{ marginTop: "1.5rem", marginBottom: "0.5rem" }}>Service availability</h2>
      <p style={{ lineHeight: 1.7, marginBottom: "1rem" }}>
        The service is provided as-is and may change over time. We may suspend
        abusive usage to protect users and platform integrity.
      </p>

      <h2 style={{ marginTop: "1.5rem", marginBottom: "0.5rem" }}>Contact</h2>
      <p style={{ lineHeight: 1.7 }}>
        Questions about these terms can be directed to the support email
        configured in the OAuth consent screen.
      </p>
    </main>
  );
}
