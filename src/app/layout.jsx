import { Auth0Provider } from "@auth0/nextjs-auth0/client";
import "./globals.css";

export const metadata = {
  title: "AgentVault — Secure Authorization for AI Agents",
  description:
    "A secure authorization gateway for AI agents. Connect apps, grant scoped permissions, and monitor agent actions — powered by Auth0 Token Vault.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Auth0Provider>{children}</Auth0Provider>
      </body>
    </html>
  );
}