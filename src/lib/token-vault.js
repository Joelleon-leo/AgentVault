// Token Vault integration layer
// Manages real OAuth tokens and validates agent access.
// Wraps token storage with auth policy checks.

import { getUserConnections, addActivityEntry, getOAuthToken, refreshOAuthToken } from "./store";

// Simulates checking if the Token Vault has a valid token for a service
export async function checkTokenVault(userId, serviceId) {
  const connections = await getUserConnections(userId);
  const connection = connections.find(
    (c) => c.serviceId === serviceId && c.status === "active"
  );

  if (!connection) {
    return {
      authorized: false,
      reason: "no_connection",
      message: `No active connection found for this service. User must connect it first.`,
    };
  }

  return {
    authorized: true,
    tokenVaultId: connection.tokenVaultId,
    scopes: connection.grantedScopes,
    connectedAt: connection.connectedAt,
  };
}

// Simulates requesting a scoped token from Token Vault
export async function requestScopedToken(userId, serviceId, requiredScopes) {
  const vaultCheck = await checkTokenVault(userId, serviceId);

  if (!vaultCheck.authorized) {
    return { success: false, ...vaultCheck };
  }

  // Check that all required scopes are granted
  const missingScopes = requiredScopes.filter(
    (s) => !vaultCheck.scopes.includes(s)
  );

  if (missingScopes.length > 0) {
    await addActivityEntry(userId, {
      type: "token_vault",
      action: "scope_denied",
      service: serviceId,
      serviceId,
      detail: `Token request denied - missing scopes: ${missingScopes.join(", ")}`,
      status: "blocked",
    });

    return {
      success: false,
      reason: "insufficient_scopes",
      missingScopes,
      currentScopes: vaultCheck.scopes,
      allRequiredScopes: requiredScopes,
      message: `Missing required scopes: ${missingScopes.join(", ")}`,
    };
  }

  // Simulate token issuance — but use real access token if available
  let realToken = await getOAuthToken(userId, serviceId);

  // Auto-refresh expired tokens
  if (realToken?.expired && realToken?.refreshToken) {
    const refreshed = await refreshOAuthToken(userId, serviceId);
    if (refreshed) {
      realToken = refreshed;
    }
  }

  const token = {
    accessToken: realToken?.accessToken || `vault_${serviceId}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    expiresIn: realToken?.expiresAt ? Math.floor((realToken.expiresAt - Date.now()) / 1000) : 3600,
    scopes: requiredScopes,
    issuedAt: new Date().toISOString(),
    tokenVaultId: vaultCheck.tokenVaultId,
    isReal: !!realToken?.accessToken,
  };

  await addActivityEntry(userId, {
    type: "token_vault",
    action: "token_issued",
    service: serviceId,
    serviceId,
    detail: `Scoped token issued for: ${requiredScopes.join(", ")}`,
    status: "success",
  });

  return { success: true, token };
}

// Simulates revoking a token in the vault
export async function revokeToken(userId, serviceId) {
  await addActivityEntry(userId, {
    type: "token_vault",
    action: "token_revoked",
    service: serviceId,
    serviceId,
    detail: `All tokens for ${serviceId} revoked from vault`,
    status: "success",
  });

  return { success: true };
}

// Validates an agent's permission to perform an action
export async function validateAgentAction(userId, serviceId, action, scopes) {
  const tokenResult = await requestScopedToken(userId, serviceId, scopes);

  if (!tokenResult.success) {
    return {
      allowed: false,
      reason: tokenResult.reason,
      message: tokenResult.message,
    };
  }

  return {
    allowed: true,
    token: tokenResult.token,
    action,
  };
}
