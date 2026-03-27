export const metadata = {
  title: "Privacy Policy | AgentVault",
};

export default function PrivacyPage() {
  return (
    <main style={{ maxWidth: 860, margin: "0 auto", padding: "2rem 1rem", color: "#e5e7eb" }}>
      <h1 style={{ fontSize: "2rem", marginBottom: "1rem" }}>Privacy Policy</h1>
      <p style={{ opacity: 0.9, marginBottom: "1rem" }}>Last updated: March 16, 2026</p>

      <p style={{ lineHeight: 1.7, marginBottom: "1rem" }}>
        AgentVault connects to third-party services only after explicit user consent.
        We request only the scopes required for enabled features and store OAuth
        credentials securely.
      </p>

      <h2 style={{ marginTop: "1.5rem", marginBottom: "0.5rem" }}>What we collect</h2>
      <ul style={{ lineHeight: 1.7, paddingLeft: "1.25rem" }}>
        <li>Basic account profile from your identity provider</li>
        <li>Connection metadata for linked services</li>
        <li>Activity logs for auditing and security</li>
      </ul>

      <h2 style={{ marginTop: "1.5rem", marginBottom: "0.5rem" }}>How we use data</h2>
      <ul style={{ lineHeight: 1.7, paddingLeft: "1.25rem" }}>
        <li>Authenticate users and maintain secure sessions</li>
        <li>Perform requested actions through connected APIs</li>
        <li>Enforce permission and firewall policies</li>
      </ul>

      <h2 style={{ marginTop: "1.5rem", marginBottom: "0.5rem" }}>Contact</h2>
      <p style={{ lineHeight: 1.7 }}>
        For privacy questions, contact the app owner at the support email listed
        on the Google OAuth consent screen.
      </p>
    </main>
  );
}
