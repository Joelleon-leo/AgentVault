import { auth0 } from "@/lib/auth0";
import { NextResponse } from "next/server";
import { getAgentPolicies, updateAgentPolicies } from "@/lib/store";

export async function GET() {
  const session = await auth0.getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const policies = await getAgentPolicies(session.user.sub);
  return NextResponse.json({ policies });
}

export async function PUT(request) {
  const session = await auth0.getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();

  // Validate that the body contains valid policy structures
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  for (const [serviceId, policy] of Object.entries(body)) {
    if (typeof policy !== "object" || policy === null) {
      return NextResponse.json({ error: `Invalid policy for ${serviceId}` }, { status: 400 });
    }
    if (policy.allowedActions && !Array.isArray(policy.allowedActions)) {
      return NextResponse.json({ error: `Invalid allowedActions for ${serviceId}` }, { status: 400 });
    }
  }

  const policies = await updateAgentPolicies(session.user.sub, body);
  return NextResponse.json({ policies });
}
