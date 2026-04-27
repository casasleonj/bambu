import { auth } from "./auth";
import { NextResponse } from "next/server";

export async function requireAuth() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return session;
}

export async function requireRole(role: string) {
  const session = await auth();
  if (!session || session.user?.role !== role) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return session;
}
