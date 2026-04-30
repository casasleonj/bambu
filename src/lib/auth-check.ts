import { auth } from "./auth";
import { NextResponse } from "next/server";

export async function requireAuth() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return session;
}

/**
 * Check if the current user has one of the allowed roles.
 * Accepts either a single role string or an array of allowed roles.
 * Optionally accepts an existing session to avoid calling auth() twice.
 * Returns the session if authorized, or a 403 Response if not.
 */
export async function requireRole(role: string | string[], existingSession?: any) {
  const session = existingSession || await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userRole = (session.user as { role?: string } | undefined)?.role;
  const allowed = Array.isArray(role) ? role : [role];

  if (!userRole || !allowed.includes(userRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return session;
}
