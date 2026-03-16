import { NextResponse } from "next/server";
import { getOAuthProvider } from "@/lib/oauth-config";
import {
  consumeOAuthState,
  storeOAuthToken,
  connectService,
  addActivityEntry,
} from "@/lib/store";

function normalizeBaseUrl(value, request) {
  if (typeof value === "string" && value.trim()) {
    return value.trim().replace(/\/+$/, "");
  }
  const origin = new URL(request.url).origin;
  return origin.replace(/\/+$/, "");
}

// GET /api/oauth/[provider]/callback — handles OAuth callback
export async function GET(request, { params }) {
  const { provider: serviceId } = await params;
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  const baseUrl = normalizeBaseUrl(
    process.env.OAUTH_BASE_URL || process.env.APP_BASE_URL || process.env.AUTH0_BASE_URL,
    request
  );

  // Handle OAuth errors
  if (error) {
    return NextResponse.redirect(
      `${baseUrl}/connections?error=${encodeURIComponent(error)}`
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      `${baseUrl}/connections?error=${encodeURIComponent("Missing code or state")}`
    );
  }

  // Validate CSRF state
  const stateData = consumeOAuthState(state);
  if (!stateData) {
    return NextResponse.redirect(
      `${baseUrl}/connections?error=${encodeURIComponent("Invalid or expired state. Please try again.")}`
    );
  }

  const { userId, internalScopes } = stateData;
  const provider = getOAuthProvider(serviceId);
  if (!provider) {
    return NextResponse.redirect(
      `${baseUrl}/connections?error=${encodeURIComponent("Unknown provider")}`
    );
  }

  const clientId = process.env[provider.clientIdEnv];
  const clientSecret = process.env[provider.clientSecretEnv];
  const redirectUri = `${baseUrl}/api/oauth/${serviceId}/callback`;

  try {
    // Exchange authorization code for tokens
    const tokenParams = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    });

    // GitHub uses a different grant format
    if (serviceId === "github") {
      // GitHub doesn't need grant_type
    } else {
      tokenParams.set("grant_type", "authorization_code");
    }

    const tokenRes = await fetch(provider.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: tokenParams.toString(),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error("Token exchange failed:", errText);
      return NextResponse.redirect(
        `${baseUrl}/connections?error=${encodeURIComponent("Failed to exchange token")}`
      );
    }

    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      console.error("Token error:", tokenData.error_description || tokenData.error);
      return NextResponse.redirect(
        `${baseUrl}/connections?error=${encodeURIComponent(tokenData.error_description || tokenData.error)}`
      );
    }

    // Store the real token in our Token Vault
    await storeOAuthToken(userId, serviceId, tokenData);

    // Mark the service as connected in the store
    await connectService(userId, serviceId, internalScopes);

    await addActivityEntry(userId, {
      type: "token_vault",
      action: "oauth_token_stored",
      service: serviceId,
      serviceId,
      detail: `Real OAuth token obtained and stored in Token Vault for ${serviceId}`,
      status: "success",
    });

    return NextResponse.redirect(`${baseUrl}/connections?connected=${serviceId}`);
  } catch (err) {
    console.error("OAuth callback error:", err);
    return NextResponse.redirect(
      `${baseUrl}/connections?error=${encodeURIComponent("OAuth callback failed")}`
    );
  }
}
