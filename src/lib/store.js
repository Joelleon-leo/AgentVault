// Persistent data store for AgentVault
// Uses a JSON file on disk so data survives server restarts and HMR reloads.
// OAuth state tokens are kept in-memory only (short-lived CSRF tokens).
// In production, replace with a real database (PostgreSQL, MongoDB, etc.).

import fs from "fs";
import path from "path";
import { getOAuthProvider } from "./oauth-config";

const DATA_DIR = path.join(process.cwd(), ".data");
const DATA_FILE = path.join(DATA_DIR, "store.json");

// ---- Persistence helpers ----

function loadFromDisk() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, "utf-8");
      const data = JSON.parse(raw);
      return {
        connections: new Map(Object.entries(data.connections || {})),
        tokens: new Map(Object.entries(data.tokens || {})),
        permissions: new Map(Object.entries(data.permissions || {})),
        policies: new Map(Object.entries(data.policies || {})),
        activityLog: data.activityLog || [],
        pendingRequests: new Map(Object.entries(data.pendingRequests || {})),
      };
    }
  } catch (err) {
    console.error("Failed to load store from disk, starting fresh:", err.message);
  }
  return null;
}

function saveToDisk() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const data = {
      connections: Object.fromEntries(store.connections),
      tokens: Object.fromEntries(store.tokens),
      permissions: Object.fromEntries(store.permissions),
      policies: Object.fromEntries(store.policies),
      activityLog: store.activityLog,
      pendingRequests: Object.fromEntries(store.pendingRequests),
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to save store to disk:", err.message);
  }
}

// ---- Initialize store (survives HMR via globalThis) ----

function initStore() {
  if (globalThis.__agentVaultStore) {
    return globalThis.__agentVaultStore;
  }

  const diskData = loadFromDisk();

  const s = diskData || {
    connections: new Map(),
    tokens: new Map(),
    permissions: new Map(),
    policies: new Map(),
    activityLog: [],
    pendingRequests: new Map(),
  };

  // OAuth states are always in-memory (short-lived CSRF tokens)
  s.oauthStates = new Map();

  globalThis.__agentVaultStore = s;
  return s;
}

const store = initStore();

// --- Connected Services ---

const AVAILABLE_SERVICES = [
  {
    id: "github",
    name: "GitHub",
    icon: "github",
    description: "Access repositories, issues, pull requests, and code.",
    scopes: ["repo:read", "repo:write", "issues:read", "issues:write", "pr:read", "pr:write"],
    color: "#f0f6fc",
    bgColor: "#161b22",
  },
  {
    id: "slack",
    name: "Slack",
    icon: "slack",
    description: "Send messages, read channels, and manage notifications.",
    scopes: ["channels:read", "messages:write", "messages:read", "files:write"],
    color: "#e8d5f5",
    bgColor: "#4a154b",
  },
  {
    id: "google-drive",
    name: "Google Drive",
    icon: "google-drive",
    description: "Read, create, and manage files and documents.",
    scopes: ["files:read", "files:write", "files:delete", "sharing:manage"],
    color: "#e8f5e9",
    bgColor: "#1b5e20",
  },
  {
    id: "gmail",
    name: "Gmail",
    icon: "gmail",
    description: "Read emails, send messages, and manage labels.",
    scopes: ["mail:read", "mail:send", "mail:manage", "contacts:read"],
    color: "#fce4ec",
    bgColor: "#b71c1c",
  },
  {
    id: "notion",
    name: "Notion",
    icon: "notion",
    description: "Access pages, databases, and workspace content.",
    scopes: ["pages:read", "pages:write", "databases:read", "databases:write"],
    color: "#f5f5f5",
    bgColor: "#191919",
  },
  {
    id: "jira",
    name: "Jira",
    icon: "jira",
    description: "Manage projects, issues, and sprints.",
    scopes: ["issues:read", "issues:write", "projects:read", "sprints:manage"],
    color: "#e3f2fd",
    bgColor: "#0052cc",
  },
];

export function getAvailableServices() {
  return AVAILABLE_SERVICES;
}

export function getUserConnections(userId) {
  return store.connections.get(userId) || [];
}

export function connectService(userId, serviceId, grantedScopes) {
  const connections = store.connections.get(userId) || [];
  const service = AVAILABLE_SERVICES.find((s) => s.id === serviceId);
  if (!service) return null;

  const existing = connections.find((c) => c.serviceId === serviceId);
  if (existing) {
    existing.grantedScopes = grantedScopes;
    existing.connectedAt = new Date().toISOString();
    existing.status = "active";
  } else {
    connections.push({
      serviceId,
      serviceName: service.name,
      grantedScopes,
      connectedAt: new Date().toISOString(),
      status: "active",
      tokenVaultId: `tv_${serviceId}_${Date.now()}`,
    });
  }

  store.connections.set(userId, connections);
  addActivityEntry(userId, {
    type: "connection",
    action: existing ? "reconnected" : "connected",
    service: service.name,
    serviceId,
    detail: `${service.name} connected with scopes: ${grantedScopes.join(", ")}`,
  });

  saveToDisk();
  return connections;
}

export function disconnectService(userId, serviceId) {
  const connections = store.connections.get(userId) || [];
  const service = AVAILABLE_SERVICES.find((s) => s.id === serviceId);
  const updated = connections.filter((c) => c.serviceId !== serviceId);
  store.connections.set(userId, updated);

  if (service) {
    addActivityEntry(userId, {
      type: "connection",
      action: "disconnected",
      service: service.name,
      serviceId,
      detail: `${service.name} disconnected and tokens revoked from vault`,
    });
  }

  saveToDisk();
  return updated;
}

// --- Agent Permissions ---

export function getAgentPermissions(userId) {
  return store.permissions.get(userId) || {
    enabled: true,
    requireApproval: true,
    maxActionsPerHour: 10,
    allowedServices: [],
    blockedActions: [],
  };
}

export function updateAgentPermissions(userId, permissions) {
  const current = getAgentPermissions(userId);
  const updated = { ...current, ...permissions };
  store.permissions.set(userId, updated);

  addActivityEntry(userId, {
    type: "permission",
    action: "updated",
    service: "AgentVault",
    serviceId: "agentvault",
    detail: `Agent permissions updated`,
  });

  saveToDisk();
  return updated;
}

// --- Firewall Policies ---

const DEFAULT_AGENT_POLICIES = {
  github: {
    enabled: false,
    allowedActions: [],
  },
  gmail: {
    enabled: false,
    allowedActions: [],
  },
  "google-drive": {
    enabled: false,
    allowedActions: [],
  },
};

export function getAgentPolicies(userId) {
  const stored = store.policies.get(userId);
  return {
    ...DEFAULT_AGENT_POLICIES,
    ...(stored || {}),
  };
}

export function updateAgentPolicies(userId, policyPatch) {
  const current = getAgentPolicies(userId);
  const merged = { ...current };

  for (const [serviceId, patch] of Object.entries(policyPatch || {})) {
    merged[serviceId] = {
      ...(merged[serviceId] || { enabled: false, allowedActions: [] }),
      ...(patch || {}),
    };
  }

  store.policies.set(userId, merged);

  addActivityEntry(userId, {
    type: "permission",
    action: "firewall_policy_updated",
    service: "AgentVault",
    serviceId: "agentvault",
    detail: "Firewall policies updated",
  });

  saveToDisk();
  return merged;
}

// --- Activity Log ---

export function addActivityEntry(userId, entry) {
  const logEntry = {
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    userId,
    timestamp: new Date().toISOString(),
    status: entry.status || "success",
    ...entry,
  };
  store.activityLog.unshift(logEntry);

  // Keep only last 500 entries
  if (store.activityLog.length > 500) {
    store.activityLog = store.activityLog.slice(0, 500);
  }

  saveToDisk();
  return logEntry;
}

export function getActivityLog(userId, limit = 50) {
  return store.activityLog
    .filter((entry) => entry.userId === userId)
    .slice(0, limit);
}

export function getAllActivityLog(limit = 50) {
  return store.activityLog.slice(0, limit);
}

export function getRecentActionCount(userId) {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  return store.activityLog.filter((entry) => {
    if (entry.userId !== userId) return false;
    const ts = Date.parse(entry.timestamp);
    return Number.isFinite(ts) && ts >= oneHourAgo;
  }).length;
}

// --- Pending Requests ---

export function createPendingRequest(userId, request) {
  const id = `req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const pending = {
    id,
    userId,
    createdAt: new Date().toISOString(),
    status: "pending",
    ...request,
  };

  const userRequests = store.pendingRequests.get(userId) || [];
  userRequests.push(pending);
  store.pendingRequests.set(userId, userRequests);

  saveToDisk();
  return pending;
}

export function getPendingRequests(userId) {
  return (store.pendingRequests.get(userId) || []).filter(
    (r) => r.status === "pending"
  );
}

export function resolveRequest(userId, requestId, approved) {
  const userRequests = store.pendingRequests.get(userId) || [];
  const request = userRequests.find((r) => r.id === requestId);
  if (!request) return null;

  request.status = approved ? "approved" : "denied";
  request.resolvedAt = new Date().toISOString();
  saveToDisk();

  addActivityEntry(userId, {
    type: "agent_action",
    action: approved ? "approved" : "denied",
    service: request.service,
    serviceId: request.serviceId,
    detail: `Agent request to ${request.actionDescription} was ${approved ? "approved" : "denied"}`,
    status: approved ? "success" : "blocked",
  });

  return request;
}

// --- OAuth Token Storage ---

export function storeOAuthToken(userId, serviceId, tokenData) {
  const key = `${userId}:${serviceId}`;
  store.tokens.set(key, {
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token || null,
    tokenType: tokenData.token_type || "Bearer",
    expiresAt: tokenData.expires_in
      ? Date.now() + tokenData.expires_in * 1000
      : null,
    scope: tokenData.scope || "",
    storedAt: Date.now(),
  });
  saveToDisk();
}

export function getOAuthToken(userId, serviceId) {
  const key = `${userId}:${serviceId}`;
  const token = store.tokens.get(key);
  if (!token) return null;
  // Check expiry (with 60s buffer)
  if (token.expiresAt && Date.now() > token.expiresAt - 60000) {
    return { ...token, expired: true };
  }
  return { ...token, expired: false };
}

export function deleteOAuthToken(userId, serviceId) {
  const key = `${userId}:${serviceId}`;
  store.tokens.delete(key);
  saveToDisk();
}

export function getAllTokenMetadata(userId) {
  const connections = getUserConnections(userId);
  const metadata = {};

  for (const connection of connections) {
    const token = getOAuthToken(userId, connection.serviceId);
    if (!token) continue;

    metadata[connection.serviceId] = {
      tokenType: token.tokenType,
      hasRefreshToken: !!token.refreshToken,
      expiresAt: token.expiresAt,
      expired: !!token.expired,
      storedAt: token.storedAt,
      scope: token.scope,
    };
  }

  return metadata;
}

export async function refreshOAuthToken(userId, serviceId) {
  const current = getOAuthToken(userId, serviceId);
  if (!current?.refreshToken) {
    return null;
  }

  const provider = getOAuthProvider(serviceId);
  if (!provider) {
    return null;
  }

  const clientId = process.env[provider.clientIdEnv];
  const clientSecret = process.env[provider.clientSecretEnv];
  if (!clientId || !clientSecret) {
    return null;
  }

  try {
    const params = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: current.refreshToken,
    });

    const res = await fetch(provider.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: params.toString(),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`Refresh token exchange failed for ${serviceId}:`, errText);
      return null;
    }

    const refreshed = await res.json();
    if (refreshed.error) {
      console.error(`Refresh token error for ${serviceId}:`, refreshed.error_description || refreshed.error);
      return null;
    }

    storeOAuthToken(userId, serviceId, {
      ...refreshed,
      refresh_token: refreshed.refresh_token || current.refreshToken,
    });

    addActivityEntry(userId, {
      type: "token_vault",
      action: "oauth_token_refreshed",
      service: serviceId,
      serviceId,
      detail: `OAuth access token refreshed for ${serviceId}`,
      status: "success",
    });

    return getOAuthToken(userId, serviceId);
  } catch (err) {
    console.error(`Refresh OAuth token failed for ${serviceId}:`, err);
    return null;
  }
}

// --- OAuth State (CSRF protection) ---

export function storeOAuthState(state, data) {
  // Auto-expire states after 10 minutes
  store.oauthStates.set(state, { ...data, createdAt: Date.now() });
  // Cleanup old states
  const tenMinutes = 10 * 60 * 1000;
  for (const [key, val] of store.oauthStates) {
    if (Date.now() - val.createdAt > tenMinutes) {
      store.oauthStates.delete(key);
    }
  }
}

export function consumeOAuthState(state) {
  const data = store.oauthStates.get(state);
  if (!data) return null;
  store.oauthStates.delete(state);
  // Reject if older than 10 minutes
  if (Date.now() - data.createdAt > 10 * 60 * 1000) return null;
  return data;
}
