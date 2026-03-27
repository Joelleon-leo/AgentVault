// AI Permission Firewall
// Intercepts ALL agent actions before execution.
// Validates: agent policies, rate limits, high-risk step-up authentication.
// Tokens are retrieved exclusively through Auth0 Token Vault — never stored or accessed directly by the agent.

import { getAgentPolicies, getAgentPermissions, addActivityEntry, getRecentActionCount } from "./store";
import { requestScopedToken } from "./token-vault";

// All possible actions per service with risk classification
export const SERVICE_ACTIONS = {
  github: {
    name: "GitHub",
    icon: "🐙",
    actions: [
      { id: "read_issues", label: "Read Issues", risk: "low" },
      { id: "read_repos", label: "Read Repositories", risk: "low" },
      { id: "read_prs", label: "Read Pull Requests", risk: "low" },
      { id: "create_issue", label: "Create Issues", risk: "medium" },
      { id: "delete_repo", label: "Delete Repository", risk: "high" },
    ],
  },
  gmail: {
    name: "Gmail",
    icon: "📧",
    actions: [
      { id: "read_email", label: "Read Emails", risk: "low" },
      { id: "send_email", label: "Send Email", risk: "medium" },
      { id: "bulk_send", label: "Bulk Send Emails", risk: "high" },
      { id: "delete_email", label: "Delete Emails", risk: "high" },
    ],
  },
  "google-drive": {
    name: "Google Drive",
    icon: "📁",
    actions: [
      { id: "read_files", label: "Read Files", risk: "low" },
      { id: "write_files", label: "Write Files", risk: "medium" },
      { id: "delete_files", label: "Delete Files", risk: "high" },
      { id: "manage_sharing", label: "Manage Sharing", risk: "high" },
    ],
  },
};

export function getActionRisk(serviceId, actionId) {
  const service = SERVICE_ACTIONS[serviceId];
  if (!service) return "unknown";
  const action = service.actions.find((a) => a.id === actionId);
  return action?.risk || "unknown";
}

// Main firewall interceptor — every agent action passes through here
export async function firewallCheck(userId, intent, options = {}) {
  const { serviceId, service, action, scopes } = intent;
  const { stepUpConfirmed } = options;

  // 1. Global agent kill-switch
  const permissions = await getAgentPermissions(userId);
  if (!permissions.enabled) {
    await logFirewall(userId, serviceId, action, "blocked", "AI agent is disabled by user");
    return {
      allowed: false,
      reason: "agent_disabled",
      message: "Action blocked: AI agent is disabled. Enable it in Permissions.",
    };
  }

  // 2. Agent policy check — does this service+action have a policy that allows it?
  const policies = await getAgentPolicies(userId);
  const policy = policies[serviceId];

  if (!policy || !policy.enabled) {
    await logFirewall(userId, serviceId, action, "blocked", `No active firewall policy for ${service}`);
    return {
      allowed: false,
      reason: "no_policy",
      message: `Action blocked: insufficient permissions. No active policy for ${service}. Configure it in the Permissions panel.`,
    };
  }

  if (!policy.allowedActions.includes(action)) {
    await logFirewall(userId, serviceId, action, "blocked", `Action "${action}" is not permitted for ${service}`);
    return {
      allowed: false,
      reason: "action_not_allowed",
      message: `Action blocked: insufficient permissions. "${action}" is not allowed for ${service}.`,
    };
  }

  // 3. Rate limiting
  const recentCount = await getRecentActionCount(userId);
  if (recentCount >= permissions.maxActionsPerHour) {
    await logFirewall(userId, serviceId, action, "blocked", `Rate limit exceeded (${recentCount}/${permissions.maxActionsPerHour} per hour)`);
    return {
      allowed: false,
      reason: "rate_limited",
      message: `Action blocked: rate limit exceeded. ${recentCount}/${permissions.maxActionsPerHour} actions used this hour.`,
    };
  }

  // 4. High-risk action → require step-up authentication (MFA)
  const risk = getActionRisk(serviceId, action);
  if (risk === "high" && !stepUpConfirmed) {
    await logFirewall(userId, serviceId, action, "step_up", `High-risk action "${action}" requires step-up authentication`);
    return {
      allowed: false,
      reason: "step_up_required",
      message: "Step-up authentication required. This is a high-risk action that requires MFA confirmation.",
      requiresMfa: true,
      riskLevel: "high",
      actionDescription: intent.description,
    };
  }

  // 5. Retrieve token from Auth0 Token Vault (agent never touches tokens directly)
  const tokenResult = await requestScopedToken(userId, serviceId, scopes);
  if (!tokenResult.success) {
    await logFirewall(userId, serviceId, action, "blocked", `Token Vault denied: ${tokenResult.message}`);
    return {
      allowed: false,
      reason: tokenResult.reason,
      message: tokenResult.message,
      missingScopes: tokenResult.missingScopes,
      currentScopes: tokenResult.currentScopes,
      allRequiredScopes: tokenResult.allRequiredScopes,
    };
  }

  // 6. All checks passed — action authorized
  await logFirewall(userId, serviceId, action, "allowed", `Firewall authorized: ${action} on ${service} [risk: ${risk}]`);

  return {
    allowed: true,
    token: tokenResult.token,
    riskLevel: risk,
  };
}

async function logFirewall(userId, serviceId, action, status, detail) {
  await addActivityEntry(userId, {
    type: "firewall",
    action,
    service: serviceId,
    serviceId,
    detail,
    status: status === "allowed" ? "success" : "blocked",
  });
}
