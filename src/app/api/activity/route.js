import { auth0 } from "@/lib/auth0";
import { NextResponse } from "next/server";
import { getActivityLog } from "@/lib/store";

export async function GET(request) {
  const session = await auth0.getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.sub;
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);

  const log = await getActivityLog(userId, limit);
  return NextResponse.json({ log });
}
