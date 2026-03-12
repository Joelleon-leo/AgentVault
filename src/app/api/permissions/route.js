import { auth0 } from "@/lib/auth0";
import { NextResponse } from "next/server";
import { getAgentPermissions, updateAgentPermissions } from "@/lib/store";

export async function GET() {
  const session = await auth0.getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const permissions = await getAgentPermissions(session.user.sub);
  return NextResponse.json({ permissions });
}

export async function PUT(request) {
  const session = await auth0.getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const permissions = await updateAgentPermissions(session.user.sub, body);
  return NextResponse.json({ permissions });
}
