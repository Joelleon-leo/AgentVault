// AI Agent Engine
// Processes user commands, determines required services/scopes,
// passes every action through the AI Permission Firewall before execution.

import { firewallCheck } from "./firewall";
import {
  addActivityEntry,
  createPendingRequest,
  getAgentPermissions,
  getUserConnections,
} from "./store";
import {
  githubListIssues,
  githubListRepos,
  githubListPRs,
  gmailListMessages,
  gmailSendMessage,
  driveListFiles,
} from "./services";

// Map of service+scope to real API function
const REAL_API_CALLS = {
  github: {
    "issues:read": (token) => githubListIssues(token),
    "repo:read": (token) => githubListRepos(token),
    "pr:read": (token) => githubListPRs(token),
  },
  gmail: {
    "mail:read": (token) => gmailListMessages(token),
    "mail:send": (token, params) => gmailSendMessage(token, params),
  },
  "google-drive": {
    "files:read": (token) => driveListFiles(token),
  },
};

// Fallback simulated responses (used when no real token exists)
const FALLBACK_RESPONSES = {
  github: {
    "issues:read": () => ({
      data: [
        { id: 1, title: "Fix authentication flow for OAuth2", state: "open", labels: ["bug", "auth"], created: "2h ago", repo: "acme/web-app" },
        { id: 2, title: "Add rate limiting to API endpoints", state: "open", labels: ["enhancement", "security"], created: "5h ago", repo: "acme/api-server" },
        { id: 3, title: "Update dependencies to patch CVE-2026-1234", state: "open", labels: ["security", "critical"], created: "1d ago", repo: "acme/web-app" },
        { id: 4, title: "Implement webhook retry logic", state: "open", labels: ["feature"], created: "2d ago", repo: "acme/integrations" },
        { id: 5, title: "Database migration script fails on PostgreSQL 16", state: "open", labels: ["bug"], created: "3d ago", repo: "acme/api-server" },
      ],
    }),
    "repo:read": () => ({
      data: [
        { name: "acme/web-app", language: "TypeScript", stars: 142, lastPush: "2h ago" },
        { name: "acme/api-server", language: "Python", stars: 89, lastPush: "1d ago" },
        { name: "acme/integrations", language: "JavaScript", stars: 34, lastPush: "3d ago" },
      ],
    }),
    "pr:read": () => ({
      data: [
        { id: 101, title: "feat: Add SSO support", state: "open", author: "jsmith", repo: "acme/web-app" },
        { id: 102, title: "fix: Resolve race condition in queue", state: "open", author: "adev", repo: "acme/api-server" },
      ],
    }),
  },
  "google-drive": {
    "files:read": () => ({
      data: [
        { name: "Q1 Planning.docx", modified: "1d ago", type: "document" },
        { name: "Architecture Diagram.png", modified: "3d ago", type: "image" },
        { name: "Budget 2026.xlsx", modified: "1w ago", type: "spreadsheet" },
      ],
    }),
  },
  gmail: {
    "mail:read": () => ({
      data: [
        { from: "team@acme.com", subject: "Sprint Review Notes", date: "2h ago", unread: true },
        { from: "alerts@github.com", subject: "Security alert for acme/web-app", date: "5h ago", unread: true },
        { from: "notifications@slack.com", subject: "New message in #incidents", date: "1d ago", unread: false },
      ],
    }),
    "mail:send": () => ({
      data: { sent: true, timestamp: new Date().toISOString() },
    }),
  },
};

// Parse user intent from natural language
function parseUserIntent(message) {
  const lower = message.toLowerCase();

  const intents = [];

  // Detect if an email address is present — strong signal for Gmail
  const hasEmailAddress = /[\w.+-]+@[\w-]+\.[\w.]+/.test(message);

  // GitHub intents — only if explicitly mentioned
  if (lower.includes("github") || lower.includes("issue") || lower.includes("repository") || lower.includes("repo") || lower.includes("pull request") || lower.match(/\bprs?\b/)) {
    if (lower.includes("issue")) {
      intents.push({
        service: "GitHub",
        serviceId: "github",
        action: "read_issues",
        scopes: ["issues:read"],
        description: "Read GitHub issues",
      });
    }
    if (lower.includes("repo")) {
      intents.push({
        service: "GitHub",
        serviceId: "github",
        action: "read_repos",
        scopes: ["repo:read"],
        description: "Read GitHub repositories",
      });
    }
    if (lower.includes("pull request") || lower.match(/\bprs?\b/)) {
      intents.push({
        service: "GitHub",
        serviceId: "github",
        action: "read_prs",
        scopes: ["pr:read"],
        description: "Read GitHub pull requests",
      });
    }
    // If "github" mentioned but no specific resource, default to issues
    if (intents.filter(i => i.serviceId === "github").length === 0) {
      intents.push({
        service: "GitHub",
        serviceId: "github",
        action: "read_issues",
        scopes: ["issues:read"],
        description: "Read GitHub issues",
      });
    }
  }

  // Google Drive intents — only if explicitly mentioned
  if (lower.includes("drive") || (lower.includes("document") && !lower.includes("email")) || (lower.includes("file") && !lower.includes("email"))) {
    intents.push({
      service: "Google Drive",
      serviceId: "google-drive",
      action: "read_files",
      scopes: ["files:read"],
      description: "Read Google Drive files",
    });
  }

  // Gmail intents — match email/gmail/mail OR "send" with an email address
  const isGmailIntent = lower.includes("email") || lower.includes("gmail") || lower.includes("mail") || lower.includes("inbox")
    || (hasEmailAddress && (lower.includes("send") || lower.includes("write") || lower.includes("compose")));

  if (isGmailIntent) {
    if (lower.includes("send") || lower.includes("write") || lower.includes("compose") || hasEmailAddress) {
      const emailParams = parseEmailParams(message);
      intents.push({
        service: "Gmail",
        serviceId: "gmail",
        action: "send_email",
        scopes: ["mail:send"],
        description: "Send an email via Gmail",
        params: emailParams,
      });
    } else {
      intents.push({
        service: "Gmail",
        serviceId: "gmail",
        action: "read_email",
        scopes: ["mail:read"],
        description: "Read Gmail messages",
      });
    }
  }

  // High-risk intent detection
  if (lower.includes("delete") && (lower.includes("repo") || lower.includes("repository"))) {
    // Remove any existing github read intents — this is a destructive action
    const filtered = intents.filter((i) => i.serviceId !== "github");
    intents.length = 0;
    intents.push(...filtered, {
      service: "GitHub",
      serviceId: "github",
      action: "delete_repo",
      scopes: ["repo:write"],
      description: "Delete a GitHub repository",
    });
  }
  if (lower.includes("delete") && (lower.includes("email") || lower.includes("mail"))) {
    const filtered = intents.filter((i) => i.serviceId !== "gmail");
    intents.length = 0;
    intents.push(...filtered, {
      service: "Gmail",
      serviceId: "gmail",
      action: "delete_email",
      scopes: ["mail:manage"],
      description: "Delete emails from Gmail",
    });
  }
  if ((lower.includes("bulk") || lower.includes("mass")) && lower.includes("send")) {
    const filtered = intents.filter((i) => i.serviceId !== "gmail");
    intents.length = 0;
    intents.push(...filtered, {
      service: "Gmail",
      serviceId: "gmail",
      action: "bulk_send",
      scopes: ["mail:send"],
      description: "Bulk send emails via Gmail",
    });
  }
  if (lower.includes("delete") && (lower.includes("file") || lower.includes("drive"))) {
    const filtered = intents.filter((i) => i.serviceId !== "google-drive");
    intents.length = 0;
    intents.push(...filtered, {
      service: "Google Drive",
      serviceId: "google-drive",
      action: "delete_files",
      scopes: ["files:delete"],
      description: "Delete Google Drive files",
    });
  }

  // Summarize intents
  if (lower.includes("summarize") || lower.includes("summary")) {
    if (intents.length === 0) {
      // Default: summarize GitHub issues
      intents.push({
        service: "GitHub",
        serviceId: "github",
        action: "read_issues",
        scopes: ["issues:read"],
        description: "Read GitHub issues for summary",
      });
    }
  }

  return intents;
}

// Extract email recipient, subject, and body from natural language
function parseEmailParams(message) {
  // Extract email address
  const emailMatch = message.match(/[\w.+-]+@[\w-]+\.[\w.]+/);
  const to = emailMatch ? emailMatch[0] : null;

  // Extract subject — look for "subject: ..." or "about ..."
  const subjectMatch = message.match(/subject[:\s]+["']?([^"'\n]+)["']?/i)
    || message.match(/about\s+["']([^"']+)["']/i);
  
  // Extract body — look for "saying ..." or "message: ..." or "body: ..."
  const bodyMatch = message.match(/saying\s+["']?(.+?)["']?\s*$/i)
    || message.match(/message[:\s]+["']?(.+?)["']?\s*$/i)
    || message.match(/body[:\s]+["']?(.+?)["']?\s*$/i)
    || message.match(/that\s+["'](.+?)["']/i);

  // Build subject from what we can extract
  let subject = subjectMatch ? subjectMatch[1].trim() : "Message from AgentVault";
  let body = bodyMatch ? bodyMatch[1].trim() : message;

  // If no explicit body found, use everything after the email address as body
  if (!bodyMatch && to) {
    const afterEmail = message.split(to).pop() || "";
    const cleaned = afterEmail.replace(/^\s*(saying|that|with message|message|body|:)\s*/i, "").trim();
    if (cleaned) body = cleaned;
  }

  return { to, subject, body };
}

// Execute agent command — all actions pass through the AI Permission Firewall
export async function executeAgentCommand(userId, message, options = {}) {
  const intents = parseUserIntent(message);

  if (intents.length === 0) {
    // Try to give a helpful response based on what the user said
    const lower = message.toLowerCase();
    let helpText = "";

    if (lower.includes("help") || lower.includes("what can you do") || lower.includes("how")) {
      helpText = "Here's what I can do for you:\n\n" +
        "📧 **Gmail** — \"Read my emails\" or \"Send an email to user@example.com saying hello\"\n" +
        "🐙 **GitHub** — \"Show my GitHub issues\" or \"List my repos\" or \"Show my pull requests\"\n" +
        " **Google Drive** — \"Show my Drive files\"\n\n" +
        "Make sure to connect the service first on the Connections page!";
    } else if (lower.includes("hi") || lower.includes("hello") || lower.includes("hey")) {
      helpText = "Hello! 👋 I'm your AgentVault AI assistant.\n\n" +
        "I can interact with your connected services securely. Try:\n" +
        "• \"Read my latest emails\"\n" +
        "• \"Show my GitHub issues\"\n" +
        "• \"Send an email to friend@example.com saying meeting at 3pm\"";
    } else if (lower.includes("connect") || lower.includes("link") || lower.includes("setup")) {
      helpText = "To connect a service, go to the **Connections** page from the sidebar.\n\n" +
        "Once connected, come back here and I can interact with that service on your behalf through the Token Vault.";
    } else {
      helpText = `I'm not sure how to help with "${message}".\n\n` +
        "I can interact with your connected services. Try:\n" +
        "• \"Read my latest emails\" (Gmail)\n" +
        "• \"Show my GitHub issues\" (GitHub)\n" +
        "• \"Send an email to user@example.com saying hello\" (Gmail)\n" +
        "• \"Show my Drive files\" (Google Drive)\n\n" +
        "Tip: Mention the service name (Gmail, GitHub, Drive) for best results.";
    }

    return {
      success: true,
      steps: [
        {
          type: "response",
          content: helpText,
        },
      ],
    };
  }

  const permissions = await getAgentPermissions(userId);
  const connections = await getUserConnections(userId);
  const steps = [];

  for (const intent of intents) {
    // Step 1: Check if service is connected
    const connection = connections.find((c) => c.serviceId === intent.serviceId);
    if (!connection) {
      steps.push({
        type: "blocked",
        service: intent.service,
        serviceId: intent.serviceId,
        title: `${intent.service} Not Connected`,
        content: `Cannot access ${intent.service} — it is not connected. Use the button below to start the OAuth flow, or go to the Connections page.`,
        icon: "disconnected",
        asyncAuth: true,
      });
      continue;
    }

    // Step 2: AI Permission Firewall
    steps.push({
      type: "firewall_check",
      service: intent.service,
      serviceId: intent.serviceId,
      title: `🛡️ Permission Firewall — ${intent.service}`,
      content: `Checking firewall policy, rate limits, and risk level for: ${intent.action}`,
      icon: "firewall",
    });

    const firewallResult = await firewallCheck(userId, intent, options);

    if (!firewallResult.allowed) {
      if (firewallResult.reason === "step_up_required") {
        steps.push({
          type: "step_up_required",
          service: intent.service,
          serviceId: intent.serviceId,
          title: `⚠️ Step-Up Authentication Required`,
          content: firewallResult.message,
          icon: "mfa",
          actionDescription: firewallResult.actionDescription,
          riskLevel: firewallResult.riskLevel,
        });
      } else {
        steps.push({
          type: "firewall_blocked",
          service: intent.service,
          serviceId: intent.serviceId,
          title: `🚫 Firewall Blocked — ${intent.service}`,
          content: firewallResult.message,
          icon: "denied",
          reason: firewallResult.reason,
        });
      }
      continue;
    }

    steps.push({
      type: "authorized",
      service: intent.service,
      serviceId: intent.serviceId,
      title: `${intent.service} Access Granted`,
      content: `Firewall passed [risk: ${firewallResult.riskLevel}] → Token Vault issued scoped token for: ${intent.scopes.join(", ")}`,
      icon: "approved",
      tokenInfo: {
        tokenVaultId: firewallResult.token.tokenVaultId,
        scopes: firewallResult.token.scopes,
        expiresIn: firewallResult.token.expiresIn,
      },
    });

    // Step 3: Execute action — use real API if token is real, otherwise fallback
    const scopeKey = intent.scopes[0];
    let resultData = null;
    let isRealData = false;

    if (firewallResult.token.isReal) {
      // Real API call using the real OAuth token from Token Vault
      const realApiCall = REAL_API_CALLS[intent.serviceId]?.[scopeKey];
      if (realApiCall) {
        try {
          resultData = await realApiCall(firewallResult.token.accessToken, intent.params || {});
          isRealData = true;
        } catch (apiErr) {
          steps.push({
            type: "error",
            service: intent.service,
            serviceId: intent.serviceId,
            title: `${intent.service} API Error`,
            content: `Failed to call ${intent.service} API: ${apiErr.message}`,
            icon: "error",
          });
          continue;
        }
      }
    }

    // Fallback to simulated data if no real token or no real API handler
    if (!resultData) {
      const fallbackResponses = FALLBACK_RESPONSES[intent.serviceId];
      const responseGenerator = fallbackResponses?.[scopeKey];
      if (responseGenerator) {
        resultData = responseGenerator().data;
      }
    }

    if (resultData) {
      await addActivityEntry(userId, {
        type: "agent_action",
        action: "executed",
        service: intent.service,
        serviceId: intent.serviceId,
        detail: `Agent executed: ${intent.description}${isRealData ? " (live data)" : " (demo data)"}`,
        status: "success",
      });

      steps.push({
        type: "result",
        service: intent.service,
        serviceId: intent.serviceId,
        title: `${intent.description}`,
        content: resultData,
        icon: "success",
        isRealData,
      });
    }
  }

  // If user asked for a summary, add a generated summary
  if (message.toLowerCase().includes("summar")) {
    const issueResults = steps.filter(
      (s) => s.type === "result" && s.serviceId === "github"
    );
    if (issueResults.length > 0) {
      const issues = issueResults[0].content;
      steps.push({
        type: "summary",
        title: "AI Summary Generated",
        content: generateSummary(issues),
        icon: "ai",
      });
    }
  }

  // Step 4: Log complete action
  steps.push({
    type: "logged",
    title: "Action Recorded",
    content: `All ${steps.filter((s) => s.type === "result").length} actions have been recorded in the Activity Ledger for your review.`,
    icon: "ledger",
  });

  return { success: true, steps };
}

function generateSummary(issues) {
  if (!Array.isArray(issues)) return "No data available to summarize.";
  
  const critical = issues.filter((i) => i.labels?.includes("critical") || i.labels?.includes("security"));
  const bugs = issues.filter((i) => i.labels?.includes("bug"));
  const features = issues.filter((i) => i.labels?.includes("feature") || i.labels?.includes("enhancement"));

  return `📊 **Issue Summary Report**

**Total Open Issues:** ${issues.length}
**Critical/Security:** ${critical.length} issue(s) requiring immediate attention
**Bugs:** ${bugs.length} bug(s) to be addressed
**Features/Enhancements:** ${features.length} feature request(s)

**Priority Items:**
${critical.map((i) => `• ⚠️ [${i.repo}] ${i.title}`).join("\n")}

**Recent Bugs:**
${bugs.map((i) => `• 🐛 [${i.repo}] ${i.title}`).join("\n")}

**Feature Requests:**
${features.map((i) => `• ✨ [${i.repo}] ${i.title}`).join("\n")}

*Report generated by AgentVault AI at ${new Date().toLocaleTimeString()}*`;
}
