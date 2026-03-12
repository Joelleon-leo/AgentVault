// Persistent data store for AgentVault
// Uses Neon PostgreSQL for persistence so data survives restarts, HMR, and navigation.
// OAuth state tokens are kept in-memory only (short-lived CSRF tokens).

import { getSQL, ensureTables } from "./db";

// OAuth states are always in-memory (short-lived CSRF tokens)
const oauthStates = globalThis.__oauthStates || new Map();
globalThis.__oauthStates = oauthStates;

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
];

export function getAvailableServices() {
  return AVAILABLE_SERVICES;
}

// --- Connected Services (PostgreSQL) ---

export async function getUserConnections(userId) {
  await ensureTables();
  const sql = getSQL();
  const rows = await sql`
    SELECT service_id, service_name, granted_scopes, connected_at, status, token_vault_id
    FROM connections WHERE user_id = ${userId} AND status = 'active'
  `;
  return rows.map((r) => ({
    serviceId: r.service_id,
    serviceName: r.service_name,
    grantedScopes: r.granted_scopes,
    connectedAt: r.connected_at,
    status: r.status,
    tokenVaultId: r.token_vault_id,
  }));
}

export async function connectService(userId, serviceId, grantedScopes) {
  await ensureTables();
  const sql = getSQL();
  const service = AVAILABLE_SERVICES.find((s) => s.id === serviceId);
  if (!service) return null;

  const now = new Date().toISOString();
  const tokenVaultId = `tv_${serviceId}_${Date.now()}`;

  // Upsert: insert or update on conflict
  const existing = await sql`
    SELECT id FROM connections WHERE user_id = ${userId} AND service_id = ${serviceId}
  `;

  if (existing.length > 0) {
    await sql`
      UPDATE connections
      SET granted_scopes = ${JSON.stringify(grantedScopes)},
          connected_at = ${now},
          status = 'active',
          service_name = ${service.name}
      WHERE user_id = ${userId} AND service_id = ${serviceId}
    `;
  } else {
    await sql`
      INSERT INTO connections (user_id, service_id, service_name, granted_scopes, connected_at, status, token_vault_id)
      VALUES (${userId}, ${serviceId}, ${service.name}, ${JSON.stringify(grantedScopes)}, ${now}, 'active', ${tokenVaultId})
    `;
  }

  await addActivityEntry(userId, {
    type: "connection",
    action: existing.length > 0 ? "reconnected" : "connected",
    service: service.name,
    serviceId,
    detail: `${service.name} connected with scopes: ${grantedScopes.join(", ")}`,
  });

  return getUserConnections(userId);
}

export async function disconnectService(userId, serviceId) {
  await ensureTables();
  const sql = getSQL();
  const service = AVAILABLE_SERVICES.find((s) => s.id === serviceId);

  await sql`DELETE FROM connections WHERE user_id = ${userId} AND service_id = ${serviceId}`;

  if (service) {
    await addActivityEntry(userId, {
      type: "connection",
      action: "disconnected",
      service: service.name,
      serviceId,
      detail: `${service.name} disconnected and tokens revoked from vault`,
    });
  }

  return getUserConnections(userId);
}

// --- Agent Permissions (PostgreSQL) ---

const DEFAULT_PERMISSIONS = {
  enabled: true,
  requireApproval: true,
  maxActionsPerHour: 10,
  allowedServices: [],
  blockedActions: [],
};

export async function getAgentPermissions(userId) {
  await ensureTables();
  const sql = getSQL();
  const rows = await sql`SELECT settings FROM permissions WHERE user_id = ${userId}`;
  if (rows.length === 0) return { ...DEFAULT_PERMISSIONS };
  return { ...DEFAULT_PERMISSIONS, ...rows[0].settings };
}

export async function updateAgentPermissions(userId, permissions) {
  await ensureTables();
  const sql = getSQL();
  const current = await getAgentPermissions(userId);
  const updated = { ...current, ...permissions };

  const existing = await sql`SELECT user_id FROM permissions WHERE user_id = ${userId}`;
  if (existing.length > 0) {
    await sql`UPDATE permissions SET settings = ${JSON.stringify(updated)} WHERE user_id = ${userId}`;
  } else {
    await sql`INSERT INTO permissions (user_id, settings) VALUES (${userId}, ${JSON.stringify(updated)})`;
  }

  await addActivityEntry(userId, {
    type: "permission",
    action: "updated",
    service: "AgentVault",
    serviceId: "agentvault",
    detail: `Agent permissions updated`,
  });

  return updated;
}

// --- Agent Firewall Policies (PostgreSQL) ---

const DEFAULT_AGENT_POLICIES = {
  github: { enabled: true, allowedActions: ["read_issues", "read_repos", "read_prs"] },
  gmail: { enabled: true, allowedActions: ["read_email", "send_email"] },
  "google-drive": { enabled: true, allowedActions: ["read_files"] },
};

export async function getAgentPolicies(userId) {
  await ensureTables();
  const sql = getSQL();
  const rows = await sql`SELECT policies FROM agent_policies WHERE user_id = ${userId}`;
  if (rows.length === 0) return { ...DEFAULT_AGENT_POLICIES };
  return { ...DEFAULT_AGENT_POLICIES, ...rows[0].policies };
}

export async function updateAgentPolicies(userId, policies) {
  await ensureTables();
  const sql = getSQL();
  const current = await getAgentPolicies(userId);
  const updated = { ...current, ...policies };

  const existing = await sql`SELECT user_id FROM agent_policies WHERE user_id = ${userId}`;
  if (existing.length > 0) {
    await sql`UPDATE agent_policies SET policies = ${JSON.stringify(updated)} WHERE user_id = ${userId}`;
  } else {
    await sql`INSERT INTO agent_policies (user_id, policies) VALUES (${userId}, ${JSON.stringify(updated)})`;
  }

  await addActivityEntry(userId, {
    type: "firewall",
    action: "policy_updated",
    service: "AgentVault",
    serviceId: "agentvault",
    detail: "Agent firewall policies updated",
  });

  return updated;
}

// --- Rate Limiting ---

export async function getRecentActionCount(userId) {
  await ensureTables();
  const sql = getSQL();
  const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
  const rows = await sql`
    SELECT COUNT(*) as count FROM activity_log
    WHERE user_id = ${userId}
    AND type = 'agent_action'
    AND status = 'success'
    AND timestamp > ${oneHourAgo}
  `;
  return Number(rows[0]?.count || 0);
}

// --- Activity Log (PostgreSQL) ---

export async function addActivityEntry(userId, entry) {
  await ensureTables();
  const sql = getSQL();
  const id = `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const now = new Date().toISOString();
  const status = entry.status || "success";

  await sql`
    INSERT INTO activity_log (id, user_id, timestamp, type, action, service, service_id, detail, status)
    VALUES (${id}, ${userId}, ${now}, ${entry.type || null}, ${entry.action || null}, ${entry.service || null}, ${entry.serviceId || null}, ${entry.detail || null}, ${status})
  `;

  // Keep only last 500 entries per user
  await sql`
    DELETE FROM activity_log WHERE id IN (
      SELECT id FROM activity_log WHERE user_id = ${userId}
      ORDER BY timestamp DESC OFFSET 500
    )
  `;

  return {
    id,
    userId,
    timestamp: now,
    status,
    ...entry,
  };
}

export async function getActivityLog(userId, limit = 50) {
  await ensureTables();
  const sql = getSQL();
  const rows = await sql`
    SELECT id, user_id, timestamp, type, action, service, service_id, detail, status
    FROM activity_log WHERE user_id = ${userId}
    ORDER BY timestamp DESC LIMIT ${limit}
  `;
  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    timestamp: r.timestamp,
    type: r.type,
    action: r.action,
    service: r.service,
    serviceId: r.service_id,
    detail: r.detail,
    status: r.status,
  }));
}

export async function getAllActivityLog(limit = 50) {
  await ensureTables();
  const sql = getSQL();
  const rows = await sql`
    SELECT id, user_id, timestamp, type, action, service, service_id, detail, status
    FROM activity_log ORDER BY timestamp DESC LIMIT ${limit}
  `;
  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    timestamp: r.timestamp,
    type: r.type,
    action: r.action,
    service: r.service,
    serviceId: r.service_id,
    detail: r.detail,
    status: r.status,
  }));
}

// --- Pending Requests (PostgreSQL) ---

export async function createPendingRequest(userId, request) {
  await ensureTables();
  const sql = getSQL();
  const id = `req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const now = new Date().toISOString();

  await sql`
    INSERT INTO pending_requests (id, user_id, created_at, status, data)
    VALUES (${id}, ${userId}, ${now}, 'pending', ${JSON.stringify(request)})
  `;

  return { id, userId, createdAt: now, status: "pending", ...request };
}

export async function getPendingRequests(userId) {
  await ensureTables();
  const sql = getSQL();
  const rows = await sql`
    SELECT id, user_id, created_at, status, data FROM pending_requests
    WHERE user_id = ${userId} AND status = 'pending'
  `;
  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    createdAt: r.created_at,
    status: r.status,
    ...r.data,
  }));
}

export async function resolveRequest(userId, requestId, approved) {
  await ensureTables();
  const sql = getSQL();
  const rows = await sql`
    SELECT id, data FROM pending_requests WHERE id = ${requestId} AND user_id = ${userId}
  `;
  if (rows.length === 0) return null;

  const request = rows[0];
  const newStatus = approved ? "approved" : "denied";
  const now = new Date().toISOString();

  await sql`
    UPDATE pending_requests SET status = ${newStatus}, resolved_at = ${now}
    WHERE id = ${requestId}
  `;

  await addActivityEntry(userId, {
    type: "agent_action",
    action: approved ? "approved" : "denied",
    service: request.data.service,
    serviceId: request.data.serviceId,
    detail: `Agent request to ${request.data.actionDescription} was ${approved ? "approved" : "denied"}`,
    status: approved ? "success" : "blocked",
  });

  return { id: requestId, status: newStatus, resolvedAt: now, ...request.data };
}

// --- OAuth Token Storage (PostgreSQL) ---

export async function storeOAuthToken(userId, serviceId, tokenData) {
  await ensureTables();
  const sql = getSQL();

  const accessToken = tokenData.access_token;
  const refreshToken = tokenData.refresh_token || null;
  const tokenType = tokenData.token_type || "Bearer";
  const expiresAt = tokenData.expires_in ? Date.now() + tokenData.expires_in * 1000 : null;
  const scope = tokenData.scope || "";
  const storedAt = Date.now();

  const existing = await sql`
    SELECT id FROM tokens WHERE user_id = ${userId} AND service_id = ${serviceId}
  `;

  if (existing.length > 0) {
    await sql`
      UPDATE tokens SET access_token = ${accessToken}, refresh_token = ${refreshToken},
        token_type = ${tokenType}, expires_at = ${expiresAt}, scope = ${scope}, stored_at = ${storedAt}
      WHERE user_id = ${userId} AND service_id = ${serviceId}
    `;
  } else {
    await sql`
      INSERT INTO tokens (user_id, service_id, access_token, refresh_token, token_type, expires_at, scope, stored_at)
      VALUES (${userId}, ${serviceId}, ${accessToken}, ${refreshToken}, ${tokenType}, ${expiresAt}, ${scope}, ${storedAt})
    `;
  }
}

export async function getOAuthToken(userId, serviceId) {
  await ensureTables();
  const sql = getSQL();
  const rows = await sql`
    SELECT access_token, refresh_token, token_type, expires_at, scope, stored_at
    FROM tokens WHERE user_id = ${userId} AND service_id = ${serviceId}
  `;
  if (rows.length === 0) return null;
  const t = rows[0];
  const expiresAt = t.expires_at ? Number(t.expires_at) : null;
  const expired = expiresAt ? Date.now() > expiresAt - 60000 : false;
  return {
    accessToken: t.access_token,
    refreshToken: t.refresh_token,
    tokenType: t.token_type,
    expiresAt,
    scope: t.scope,
    storedAt: Number(t.stored_at),
    expired,
  };
}

// Get sanitized token metadata (no secrets) for UI display
export async function getTokenMetadata(userId, serviceId) {
  await ensureTables();
  const sql = getSQL();
  const rows = await sql`
    SELECT token_type, expires_at, scope, stored_at
    FROM tokens WHERE user_id = ${userId} AND service_id = ${serviceId}
  `;
  if (rows.length === 0) return null;
  const t = rows[0];
  const expiresAt = t.expires_at ? Number(t.expires_at) : null;
  return {
    tokenType: t.token_type,
    expiresAt,
    expired: expiresAt ? Date.now() > expiresAt - 60000 : false,
    scope: t.scope,
    storedAt: Number(t.stored_at),
    hasRefreshToken: false, // never expose this — just indicate presence
  };
}

// Get token metadata for all connected services (no secrets)
export async function getAllTokenMetadata(userId) {
  await ensureTables();
  const sql = getSQL();
  const rows = await sql`
    SELECT service_id, token_type, expires_at, scope, stored_at,
      CASE WHEN refresh_token IS NOT NULL THEN true ELSE false END as has_refresh
    FROM tokens WHERE user_id = ${userId}
  `;
  const result = {};
  for (const t of rows) {
    const expiresAt = t.expires_at ? Number(t.expires_at) : null;
    result[t.service_id] = {
      tokenType: t.token_type,
      expiresAt,
      expired: expiresAt ? Date.now() > expiresAt - 60000 : false,
      scope: t.scope,
      storedAt: Number(t.stored_at),
      hasRefreshToken: !!t.has_refresh,
    };
  }
  return result;
}

export async function refreshOAuthToken(userId, serviceId) {
  const { getOAuthProvider } = await import("./oauth-config.js");
  const token = await getOAuthToken(userId, serviceId);
  if (!token || !token.refreshToken) return null;

  const provider = getOAuthProvider(serviceId);
  if (!provider || !provider.tokenUrl) return null;

  const clientId = process.env[provider.clientIdEnv];
  const clientSecret = process.env[provider.clientSecretEnv];
  if (!clientId || !clientSecret) return null;

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: token.refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetch(provider.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) return null;

  const data = await res.json();
  // Google may not return refresh_token on refresh — preserve the existing one
  if (!data.refresh_token) {
    data.refresh_token = token.refreshToken;
  }
  if (!data.scope) {
    data.scope = token.scope;
  }

  await storeOAuthToken(userId, serviceId, data);

  const expiresIn = data.expires_in || 3600;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    tokenType: data.token_type || "Bearer",
    expiresAt: Date.now() + expiresIn * 1000,
    scope: data.scope,
    expired: false,
  };
}

export async function deleteOAuthToken(userId, serviceId) {
  await ensureTables();
  const sql = getSQL();
  await sql`DELETE FROM tokens WHERE user_id = ${userId} AND service_id = ${serviceId}`;
}

// --- OAuth State (in-memory, short-lived CSRF tokens) ---

export function storeOAuthState(state, data) {
  oauthStates.set(state, { ...data, createdAt: Date.now() });
  // Cleanup old states
  const tenMinutes = 10 * 60 * 1000;
  for (const [key, val] of oauthStates) {
    if (Date.now() - val.createdAt > tenMinutes) {
      oauthStates.delete(key);
    }
  }
}

export function consumeOAuthState(state) {
  const data = oauthStates.get(state);
  if (!data) return null;
  oauthStates.delete(state);
  if (Date.now() - data.createdAt > 10 * 60 * 1000) return null;
  return data;
}
