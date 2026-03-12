import { auth0 } from "@/lib/auth0";
import { NextResponse } from "next/server";
import {
  getAvailableServices,
  getUserConnections,
  connectService,
  disconnectService,
  deleteOAuthToken,
  getAllTokenMetadata,
} from "@/lib/store";
import { isOAuthConfigured } from "@/lib/oauth-config";

export async function GET() {
  const session = await auth0.getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.sub;
  const available = getAvailableServices();
  const connected = await getUserConnections(userId);
  const tokenMeta = await getAllTokenMetadata(userId);

  // Annotate each service with whether real OAuth is configured
  const enriched = available.map((s) => ({
    ...s,
    oauthConfigured: isOAuthConfigured(s.id),
  }));

  return NextResponse.json({
    available: enriched,
    connected,
    tokenMeta,
  });
}

export async function POST(request) {
  const session = await auth0.getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.sub;
  const body = await request.json();
  const { serviceId, scopes } = body;

  if (!serviceId || !Array.isArray(scopes)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const available = getAvailableServices();
  const service = available.find((s) => s.id === serviceId);
  if (!service) {
    return NextResponse.json({ error: "Unknown service" }, { status: 400 });
  }

  // Validate scopes against available service scopes
  const validScopes = scopes.filter((s) => service.scopes.includes(s));
  if (validScopes.length === 0) {
    return NextResponse.json({ error: "No valid scopes" }, { status: 400 });
  }

  const connections = await connectService(userId, serviceId, validScopes);
  return NextResponse.json({ connections });
}

export async function DELETE(request) {
  const session = await auth0.getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.sub;
  const { searchParams } = new URL(request.url);
  const serviceId = searchParams.get("serviceId");

  if (!serviceId) {
    return NextResponse.json({ error: "Missing serviceId" }, { status: 400 });
  }

  // Revoke the real OAuth token from vault
  await deleteOAuthToken(userId, serviceId);

  const connections = await disconnectService(userId, serviceId);
  return NextResponse.json({ connections });
}
