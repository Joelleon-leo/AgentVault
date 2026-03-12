// OAuth configuration for real service connections
// Maps our internal scopes to real OAuth scopes for each provider

export const OAUTH_PROVIDERS = {
  github: {
    authUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    apiBase: "https://api.github.com",
    clientIdEnv: "GITHUB_CLIENT_ID",
    clientSecretEnv: "GITHUB_CLIENT_SECRET",
    // Map internal scopes to GitHub OAuth scopes
    scopeMap: {
      "repo:read": "repo",
      "repo:write": "repo",
      "issues:read": "repo",
      "issues:write": "repo",
      "pr:read": "repo",
      "pr:write": "repo",
    },
    getOAuthScopes(internalScopes) {
      const oauthScopes = new Set();
      for (const s of internalScopes) {
        if (this.scopeMap[s]) oauthScopes.add(this.scopeMap[s]);
      }
      return [...oauthScopes].join(" ");
    },
  },
  gmail: {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    apiBase: "https://gmail.googleapis.com",
    clientIdEnv: "GOOGLE_CLIENT_ID",
    clientSecretEnv: "GOOGLE_CLIENT_SECRET",
    scopeMap: {
      "mail:read": "https://www.googleapis.com/auth/gmail.readonly",
      "mail:send": "https://www.googleapis.com/auth/gmail.send",
      "mail:manage": "https://www.googleapis.com/auth/gmail.modify",
      "contacts:read": "https://www.googleapis.com/auth/contacts.readonly",
    },
    getOAuthScopes(internalScopes) {
      const oauthScopes = new Set();
      for (const s of internalScopes) {
        if (this.scopeMap[s]) oauthScopes.add(this.scopeMap[s]);
      }
      return [...oauthScopes].join(" ");
    },
  },
  "google-drive": {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    apiBase: "https://www.googleapis.com",
    clientIdEnv: "GOOGLE_CLIENT_ID",
    clientSecretEnv: "GOOGLE_CLIENT_SECRET",
    scopeMap: {
      "files:read": "https://www.googleapis.com/auth/drive.readonly",
      "files:write": "https://www.googleapis.com/auth/drive.file",
      "files:delete": "https://www.googleapis.com/auth/drive.file",
      "sharing:manage": "https://www.googleapis.com/auth/drive",
    },
    getOAuthScopes(internalScopes) {
      const oauthScopes = new Set();
      for (const s of internalScopes) {
        if (this.scopeMap[s]) oauthScopes.add(this.scopeMap[s]);
      }
      return [...oauthScopes].join(" ");
    },
  },
};

export function getOAuthProvider(serviceId) {
  return OAUTH_PROVIDERS[serviceId] || null;
}

export function isOAuthConfigured(serviceId) {
  const provider = OAUTH_PROVIDERS[serviceId];
  if (!provider) return false;
  return !!(process.env[provider.clientIdEnv] && process.env[provider.clientSecretEnv]);
}
