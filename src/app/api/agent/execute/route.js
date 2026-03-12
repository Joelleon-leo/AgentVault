import { auth0 } from "@/lib/auth0";
import { NextResponse } from "next/server";
import { executeAgentCommand } from "@/lib/agent-engine";

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

  const { message, stepUpConfirmed } = body;

  if (!message || typeof message !== "string" || message.length > 1000) {
    return NextResponse.json({ error: "Invalid message" }, { status: 400 });
  }

  // Sanitize: strip control characters (except newlines)
  const sanitized = message.replace(/[\x00-\x09\x0B\x0C\x0E-\x1F\x7F]/g, "");

  const result = await executeAgentCommand(session.user.sub, sanitized, {
    stepUpConfirmed: !!stepUpConfirmed,
  });
  return NextResponse.json(result);
}
