# AgentVault — Secure Authorization for AI Agents

> **Auth0 "Authorized to Act" Hackathon Submission**

AgentVault is a secure authorization gateway that sits between AI agents and user applications. Instead of giving agents direct, uncontrolled access to services, AgentVault enforces scoped permissions, manages OAuth tokens through Auth0 Token Vault, and logs every action in an immutable activity ledger.

## The Problem

Modern AI agents require access to many services (GitHub, Slack, Gmail, etc.) but:
- Often store credentials insecurely
- Give users no visibility into what the agent is doing
- Lack fine-grained permission controls
- Create risk of token leakage and uncontrolled automation

## The Solution

AgentVault introduces three key innovations:

### 🛡️ AI Permission Firewall
Agents must request permission before accessing any service. Every action goes through scope validation and consent checks before execution.

### 🔐 Token Vault Controlled Actions
All OAuth tokens are managed exclusively by Auth0 Token Vault. No credentials are ever exposed to the AI agent or stored outside the vault. Tokens are scoped, time-limited, and revocable.

### 📋 Agent Activity Ledger
Every action performed by an agent is immutably logged — token requests, API calls, approvals, and denials. Full audit trail visible to the user at all times.

## Architecture

```
User → Auth0 Login → Permission Firewall → Auth0 Token Vault → AI Agent → APIs
                          ↓                       ↓                ↓
                    Scope validation        Token issuance    Scoped API call
                          ↓                       ↓                ↓
                    ←←←←←←←←←←← Activity Ledger ←←←←←←←←←←←←←←←←←
```

## Example Flow

User says: *"Summarize my latest GitHub issues and send a report to Slack"*

1. Agent parses intent → needs GitHub `issues:read` and Slack `messages:write`
2. Permission Firewall validates scopes against user grants
3. Token Vault issues scoped tokens for each service
4. Agent reads GitHub issues via API
5. Agent generates summary
6. Agent sends report to Slack via API
7. All actions recorded in Activity Ledger

## Tech Stack

- **Next.js 15** (App Router, Turbopack)
- **Auth0** (`@auth0/nextjs-auth0` v4) — authentication & Token Vault
- **React 19** — UI
- **Tailwind CSS v4** — styling

## Pages

| Route | Description |
|---|---|
| `/` | Landing page with feature overview |
| `/dashboard` | Overview stats, architecture diagram, quick actions |
| `/agent` | Interactive AI agent chat interface |
| `/connections` | Connect/disconnect services with scoped permissions |
| `/activity` | Full activity ledger with filters |
| `/permissions` | Configure AI Permission Firewall settings |

## Getting Started

```bash
npm install
```

Create `.env.local` with your Auth0 credentials:

```env
AUTH0_SECRET=<your-secret>
AUTH0_BASE_URL=http://localhost:3000
AUTH0_ISSUER_BASE_URL=https://<your-domain>.auth0.com
AUTH0_CLIENT_ID=<your-client-id>
AUTH0_CLIENT_SECRET=<your-client-secret>
```

Run the dev server:

```bash
npm run dev
```

## Project Structure

```
src/
  app/
    page.jsx                    # Landing page
    (dashboard)/
      layout.jsx                # Authenticated layout with sidebar
      dashboard/page.jsx        # Dashboard
      agent/page.jsx            # AI Agent chat
      connections/page.jsx      # Service connections
      activity/page.jsx         # Activity ledger
      permissions/page.jsx      # Permission firewall config
    api/
      agent/execute/route.js    # Agent command execution
      connections/route.js      # Connection CRUD
      activity/route.js         # Activity log
      permissions/route.js      # Permission management
  lib/
    auth0.js                    # Auth0 client
    store.js                    # Data store & models
    token-vault.js              # Auth0 Token Vault integration
    agent-engine.js             # AI agent command processing
  components/
    Sidebar.jsx                 # Navigation sidebar
```
