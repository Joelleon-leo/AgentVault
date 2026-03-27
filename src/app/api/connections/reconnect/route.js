import { auth0 } from "@/lib/auth0";
import { NextResponse } from "next/server";
import { getOAuthProvider, isOAuthConfigured } from "@/lib/oauth-config";
import { storeOAuthState } from "@/lib/store";
import crypto from "crypto";

// POST /api/connections/reconnect — initiate OAuth re-auth with additional scopes
export async function POST(request) {
  const session = await auth0.getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { serviceId, requiredScopes } = body;

  if (!serviceId || !requiredScopes || !Array.isArray(requiredScopes)) {
    return NextResponse.json(
      { error: "Missing or invalid serviceId or requiredScopes" },
      { status: 400 }
    );
  }

  const provider = getOAuthProvider(serviceId);
  if (!provider) {
    return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
  }

  if (!isOAuthConfigured(serviceId)) {
    return NextResponse.json(
      { error: `OAuth not configured for ${serviceId}` },
      { status: 400 }
    );
  }

  // Generate CSRF state token
  const state = crypto.randomBytes(32).toString("hex");
  storeOAuthState(state, {
    userId: session.user.sub,
    serviceId,
    internalScopes: requiredScopes,
  });

  const clientId = process.env[provider.clientIdEnv];
  const baseUrl = (
    process.env.OAUTH_BASE_URL ||
    process.env.APP_BASE_URL ||
    process.env.AUTH0_BASE_URL ||
    new URL(request.url).origin
  ).replace(/\/+$/, "");

  const redirectUri = `${baseUrl}/api/oauth/${serviceId}/callback`;
  const oauthScopes = provider.getOAuthScopes(requiredScopes);

  const authParams = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: oauthScopes,
    state,
    response_type: "code",
  });

  // Google-specific params
  if (serviceId === "gmail" || serviceId === "google-drive") {
    authParams.set("access_type", "offline");
    authParams.set("prompt", "consent");
  }

  // Force re-authentication for OAuth providers that support it
  // This ensures user re-authorizes with new scopes
  if (serviceId === "github") {
    // GitHub doesn't have a direct force param, but the new scopes trigger a new prompts
  }

  return NextResponse.json({
    authUrl: `${provider.authUrl}?${authParams.toString()}`,
  });
}
