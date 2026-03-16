// Persistent data store for AgentVault
// Uses Neon (PostgreSQL) when DATABASE_URL is set.
// Falls back to local JSON file for local/demo resilience.

import fs from "fs";
import path from "path";
import { getOAuthProvider } from "./oauth-config";
import { ensureTables, getSQL } from "./db";

const DATA_DIR = path.join(process.cwd(), ".data");
const DATA_FILE = path.join(DATA_DIR, "store.json");

const useDatabase = !!process.env.DATABASE_URL;

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

  s.oauthStates = new Map();
  globalThis.__agentVaultStore = s;
  return s;
}

const store = initStore();

async function withDb(dbOperation, fallbackOperation) {
  if (!useDatabase) {
    return fallbackOperation();
  }

  try {
    await ensureTables();
    const sql = getSQL();
    return await dbOperation(sql);
  } catch (err) {
    console.error("Database operation failed, falling back to local store:", err.message);
    return fallbackOperation();
  }
}

function normalizeConnectionRow(row) {
  return {
    serviceId: row.service_id,
    serviceName: row.service_name,
    grantedScopes: Array.isArray(row.granted_scopes) ? row.granted_scopes : [],
    connectedAt: row.connected_at instanceof Date ? row.connected_at.toISOString() : String(row.connected_at),
    status: row.status,
    tokenVaultId: row.token_vault_id,
  };
}

function normalizeActivityRow(row) {
  return {
    id: row.id,
    userId: row.user_id,
    timestamp: row.timestamp instanceof Date ? row.timestamp.toISOString() : String(row.timestamp),
    type: row.type,
    action: row.action,
    service: row.service,
    serviceId: row.service_id,
    detail: row.detail,
    status: row.status || "success",
  };
}

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

export async function getUserConnections(userId) {
  return withDb(
    async (sql) => {
      const rows = await sql`
        SELECT service_id, service_name, granted_scopes, connected_at, status, token_vault_id
        FROM connections
        WHERE user_id = ${userId}
        ORDER BY connected_at DESC
      `;
      return rows.map(normalizeConnectionRow);
    },
    () => store.connections.get(userId) || []
  );
}

export async function connectService(userId, serviceId, grantedScopes) {
  const service = AVAILABLE_SERVICES.find((s) => s.id === serviceId);
  if (!service) return null;

  return withDb(
    async (sql) => {
      const tokenVaultId = `tv_${serviceId}_${Date.now()}`;
      await sql`
        INSERT INTO connections (user_id, service_id, service_name, granted_scopes, connected_at, status, token_vault_id)
        VALUES (${userId}, ${serviceId}, ${service.name}, ${JSON.stringify(grantedScopes)}::jsonb, NOW(), 'active', ${tokenVaultId})
        ON CONFLICT (user_id, service_id)
        DO UPDATE SET
          service_name = EXCLUDED.service_name,
          granted_scopes = EXCLUDED.granted_scopes,
          connected_at = NOW(),
          status = 'active'
      `;

      await addActivityEntry(userId, {
        type: "connection",
        action: "connected",
        service: service.name,
        serviceId,
        detail: `${service.name} connected with scopes: ${grantedScopes.join(", ")}`,
      });

      return getUserConnections(userId);
    },
    () => {
      const connections = store.connections.get(userId) || [];
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
  );
}

export async function disconnectService(userId, serviceId) {
  const service = AVAILABLE_SERVICES.find((s) => s.id === serviceId);

  return withDb(
    async (sql) => {
      await sql`
        DELETE FROM connections
        WHERE user_id = ${userId} AND service_id = ${serviceId}
      `;

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
    },
    () => {
      const connections = store.connections.get(userId) || [];
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
  );
}

const DEFAULT_PERMISSIONS = {
  enabled: true,
  requireApproval: true,
  maxActionsPerHour: 10,
  allowedServices: [],
  blockedActions: [],
};

export async function getAgentPermissions(userId) {
  return withDb(
    async (sql) => {
      const rows = await sql`
        SELECT settings
        FROM permissions
        WHERE user_id = ${userId}
        LIMIT 1
      `;
      if (!rows.length) return DEFAULT_PERMISSIONS;
      return { ...DEFAULT_PERMISSIONS, ...(rows[0].settings || {}) };
    },
    () => store.permissions.get(userId) || DEFAULT_PERMISSIONS
  );
}

export async function updateAgentPermissions(userId, permissions) {
  return withDb(
    async (sql) => {
      const current = await getAgentPermissions(userId);
      const updated = { ...current, ...permissions };

      await sql`
        INSERT INTO permissions (user_id, settings)
        VALUES (${userId}, ${JSON.stringify(updated)}::jsonb)
        ON CONFLICT (user_id)
        DO UPDATE SET settings = EXCLUDED.settings
      `;

      await addActivityEntry(userId, {
        type: "permission",
        action: "updated",
        service: "AgentVault",
        serviceId: "agentvault",
        detail: "Agent permissions updated",
      });

      return updated;
    },
    () => {
      const current = store.permissions.get(userId) || DEFAULT_PERMISSIONS;
      const updated = { ...current, ...permissions };
      store.permissions.set(userId, updated);

      addActivityEntry(userId, {
        type: "permission",
        action: "updated",
        service: "AgentVault",
        serviceId: "agentvault",
        detail: "Agent permissions updated",
      });

      saveToDisk();
      return updated;
    }
  );
}

const DEFAULT_AGENT_POLICIES = {
  github: { enabled: false, allowedActions: [] },
  gmail: { enabled: false, allowedActions: [] },
  "google-drive": { enabled: false, allowedActions: [] },
};

export async function getAgentPolicies(userId) {
  return withDb(
    async (sql) => {
      const rows = await sql`
        SELECT policies
        FROM agent_policies
        WHERE user_id = ${userId}
        LIMIT 1
      `;
      const fromDb = rows.length ? rows[0].policies || {} : {};
      return { ...DEFAULT_AGENT_POLICIES, ...fromDb };
    },
    () => ({ ...DEFAULT_AGENT_POLICIES, ...(store.policies.get(userId) || {}) })
  );
}

export async function updateAgentPolicies(userId, policyPatch) {
  return withDb(
    async (sql) => {
      const current = await getAgentPolicies(userId);
      const merged = { ...current };

      for (const [serviceId, patch] of Object.entries(policyPatch || {})) {
        merged[serviceId] = {
          ...(merged[serviceId] || { enabled: false, allowedActions: [] }),
          ...(patch || {}),
        };
      }

      await sql`
        INSERT INTO agent_policies (user_id, policies)
        VALUES (${userId}, ${JSON.stringify(merged)}::jsonb)
        ON CONFLICT (user_id)
        DO UPDATE SET policies = EXCLUDED.policies
      `;

      await addActivityEntry(userId, {
        type: "permission",
        action: "firewall_policy_updated",
        service: "AgentVault",
        serviceId: "agentvault",
        detail: "Firewall policies updated",
      });

      return merged;
    },
    () => {
      const current = { ...DEFAULT_AGENT_POLICIES, ...(store.policies.get(userId) || {}) };
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
  );
}

export async function addActivityEntry(userId, entry) {
  const logEntry = {
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    userId,
    timestamp: new Date().toISOString(),
    status: entry.status || "success",
    ...entry,
  };

  return withDb(
    async (sql) => {
      await sql`
        INSERT INTO activity_log (id, user_id, timestamp, type, action, service, service_id, detail, status)
        VALUES (
          ${logEntry.id},
          ${userId},
          ${logEntry.timestamp},
          ${logEntry.type || null},
          ${logEntry.action || null},
          ${logEntry.service || null},
          ${logEntry.serviceId || null},
          ${logEntry.detail || null},
          ${logEntry.status}
        )
      `;
      return logEntry;
    },
    () => {
      store.activityLog.unshift(logEntry);
      if (store.activityLog.length > 500) {
        store.activityLog = store.activityLog.slice(0, 500);
      }
      saveToDisk();
      return logEntry;
    }
  );
}

export async function getActivityLog(userId, limit = 50) {
  return withDb(
    async (sql) => {
      const rows = await sql`
        SELECT id, user_id, timestamp, type, action, service, service_id, detail, status
        FROM activity_log
        WHERE user_id = ${userId}
        ORDER BY timestamp DESC
        LIMIT ${limit}
      `;
      return rows.map(normalizeActivityRow);
    },
    () => store.activityLog.filter((entry) => entry.userId === userId).slice(0, limit)
  );
}

export async function getAllActivityLog(limit = 50) {
  return withDb(
    async (sql) => {
      const rows = await sql`
        SELECT id, user_id, timestamp, type, action, service, service_id, detail, status
        FROM activity_log
        ORDER BY timestamp DESC
        LIMIT ${limit}
      `;
      return rows.map(normalizeActivityRow);
    },
    () => store.activityLog.slice(0, limit)
  );
}

export async function getRecentActionCount(userId) {
  return withDb(
    async (sql) => {
      const rows = await sql`
        SELECT COUNT(*)::int AS count
        FROM activity_log
        WHERE user_id = ${userId}
          AND timestamp >= NOW() - INTERVAL '1 hour'
      `;
      return rows[0]?.count || 0;
    },
    () => {
      const oneHourAgo = Date.now() - 60 * 60 * 1000;
      return store.activityLog.filter((entry) => {
        if (entry.userId !== userId) return false;
        const ts = Date.parse(entry.timestamp);
        return Number.isFinite(ts) && ts >= oneHourAgo;
      }).length;
    }
  );
}

export async function createPendingRequest(userId, request) {
  const id = `req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const pending = {
    id,
    userId,
    createdAt: new Date().toISOString(),
    status: "pending",
    ...request,
  };

  return withDb(
    async (sql) => {
      await sql`
        INSERT INTO pending_requests (id, user_id, created_at, status, data)
        VALUES (${id}, ${userId}, ${pending.createdAt}, 'pending', ${JSON.stringify(request || {})}::jsonb)
      `;
      return pending;
    },
    () => {
      const userRequests = store.pendingRequests.get(userId) || [];
      userRequests.push(pending);
      store.pendingRequests.set(userId, userRequests);
      saveToDisk();
      return pending;
    }
  );
}

export async function getPendingRequests(userId) {
  return withDb(
    async (sql) => {
      const rows = await sql`
        SELECT id, user_id, created_at, status, resolved_at, data
        FROM pending_requests
        WHERE user_id = ${userId} AND status = 'pending'
        ORDER BY created_at DESC
      `;
      return rows.map((row) => ({
        id: row.id,
        userId: row.user_id,
        createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
        status: row.status,
        resolvedAt: row.resolved_at ? (row.resolved_at instanceof Date ? row.resolved_at.toISOString() : String(row.resolved_at)) : null,
        ...(row.data || {}),
      }));
    },
    () => (store.pendingRequests.get(userId) || []).filter((r) => r.status === "pending")
  );
}

export async function resolveRequest(userId, requestId, approved) {
  return withDb(
    async (sql) => {
      const rows = await sql`
        SELECT id, user_id, created_at, status, resolved_at, data
        FROM pending_requests
        WHERE user_id = ${userId} AND id = ${requestId}
        LIMIT 1
      `;
      if (!rows.length) return null;

      const existing = rows[0];
      await sql`
        UPDATE pending_requests
        SET status = ${approved ? "approved" : "denied"}, resolved_at = NOW()
        WHERE id = ${requestId} AND user_id = ${userId}
      `;

      const request = {
        id: existing.id,
        userId: existing.user_id,
        createdAt: existing.created_at instanceof Date ? existing.created_at.toISOString() : String(existing.created_at),
        resolvedAt: new Date().toISOString(),
        status: approved ? "approved" : "denied",
        ...(existing.data || {}),
      };

      await addActivityEntry(userId, {
        type: "agent_action",
        action: approved ? "approved" : "denied",
        service: request.service,
        serviceId: request.serviceId,
        detail: `Agent request to ${request.actionDescription} was ${approved ? "approved" : "denied"}`,
        status: approved ? "success" : "blocked",
      });

      return request;
    },
    () => {
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
  );
}

export async function storeOAuthToken(userId, serviceId, tokenData) {
  const payload = {
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token || null,
    tokenType: tokenData.token_type || "Bearer",
    expiresAt: tokenData.expires_in ? Date.now() + tokenData.expires_in * 1000 : null,
    scope: tokenData.scope || "",
    storedAt: Date.now(),
  };

  return withDb(
    async (sql) => {
      await sql`
        INSERT INTO tokens (user_id, service_id, access_token, refresh_token, token_type, expires_at, scope, stored_at)
        VALUES (
          ${userId},
          ${serviceId},
          ${payload.accessToken},
          ${payload.refreshToken},
          ${payload.tokenType},
          ${payload.expiresAt},
          ${payload.scope},
          ${payload.storedAt}
        )
        ON CONFLICT (user_id, service_id)
        DO UPDATE SET
          access_token = EXCLUDED.access_token,
          refresh_token = EXCLUDED.refresh_token,
          token_type = EXCLUDED.token_type,
          expires_at = EXCLUDED.expires_at,
          scope = EXCLUDED.scope,
          stored_at = EXCLUDED.stored_at
      `;
      return payload;
    },
    () => {
      const key = `${userId}:${serviceId}`;
      store.tokens.set(key, payload);
      saveToDisk();
      return payload;
    }
  );
}

export async function getOAuthToken(userId, serviceId) {
  return withDb(
    async (sql) => {
      const rows = await sql`
        SELECT access_token, refresh_token, token_type, expires_at, scope, stored_at
        FROM tokens
        WHERE user_id = ${userId} AND service_id = ${serviceId}
        LIMIT 1
      `;
      if (!rows.length) return null;
      const token = rows[0];
      const expiresAt = token.expires_at === null ? null : Number(token.expires_at);
      const expired = !!(expiresAt && Date.now() > expiresAt - 60000);

      return {
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        tokenType: token.token_type || "Bearer",
        expiresAt,
        scope: token.scope || "",
        storedAt: token.stored_at === null ? null : Number(token.stored_at),
        expired,
      };
    },
    () => {
      const key = `${userId}:${serviceId}`;
      const token = store.tokens.get(key);
      if (!token) return null;
      if (token.expiresAt && Date.now() > token.expiresAt - 60000) {
        return { ...token, expired: true };
      }
      return { ...token, expired: false };
    }
  );
}

export async function deleteOAuthToken(userId, serviceId) {
  return withDb(
    async (sql) => {
      await sql`
        DELETE FROM tokens
        WHERE user_id = ${userId} AND service_id = ${serviceId}
      `;
      return true;
    },
    () => {
      const key = `${userId}:${serviceId}`;
      store.tokens.delete(key);
      saveToDisk();
      return true;
    }
  );
}

export async function getAllTokenMetadata(userId) {
  const connections = await getUserConnections(userId);
  const metadata = {};

  for (const connection of connections) {
    const token = await getOAuthToken(userId, connection.serviceId);
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
  const current = await getOAuthToken(userId, serviceId);
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

    await storeOAuthToken(userId, serviceId, {
      ...refreshed,
      refresh_token: refreshed.refresh_token || current.refreshToken,
    });

    await addActivityEntry(userId, {
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

export function storeOAuthState(state, data) {
  store.oauthStates.set(state, { ...data, createdAt: Date.now() });

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
  if (Date.now() - data.createdAt > 10 * 60 * 1000) return null;
  return data;
}
