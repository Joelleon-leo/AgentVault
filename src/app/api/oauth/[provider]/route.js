import { auth0 } from "@/lib/auth0";
import { NextResponse } from "next/server";
import { getOAuthProvider, isOAuthConfigured } from "@/lib/oauth-config";
import { storeOAuthState } from "@/lib/store";
import crypto from "crypto";

// GET /api/oauth/[provider] — initiates OAuth flow
export async function GET(request, { params }) {
  const session = await auth0.getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { provider: serviceId } = await params;
  const provider = getOAuthProvider(serviceId);
  if (!provider) {
    return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
  }

  if (!isOAuthConfigured(serviceId)) {
    return NextResponse.json(
      { error: `OAuth not configured for ${serviceId}. Set ${provider.clientIdEnv} and ${provider.clientSecretEnv} in .env.local` },
      { status: 400 }
    );
  }

  // Read scopes from query params
  const { searchParams } = new URL(request.url);
  const scopes = searchParams.get("scopes") || "";

  // Generate CSRF state token
  const state = crypto.randomBytes(32).toString("hex");
  storeOAuthState(state, {
    userId: session.user.sub,
    serviceId,
    internalScopes: scopes.split(",").filter(Boolean),
  });

  const clientId = process.env[provider.clientIdEnv];
  const baseUrl = process.env.AUTH0_BASE_URL || "http://localhost:3000";
  const redirectUri = `${baseUrl}/api/oauth/${serviceId}/callback`;

  const oauthScopes = provider.getOAuthScopes(scopes.split(",").filter(Boolean));

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

  return NextResponse.redirect(`${provider.authUrl}?${authParams.toString()}`);
}
