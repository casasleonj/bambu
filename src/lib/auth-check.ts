import { auth } from "./auth";
import { NextResponse } from "next/server";
import { prisma } from "./prisma";
import { PRIVILEGED_ROLES, type Role } from "./constants";

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
export async function requireRole(role: Role | Role[], existingSession?: any) {
  const session = existingSession || await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userRole = (session.user as { role?: string } | undefined)?.role;
  const allowed = Array.isArray(role) ? role : [role];

  if (!userRole || !allowed.includes(userRole as Role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return session;
}

/**
 * Verify that the user has permission to access a specific resource.
 * ADMIN and CONTADOR can access all resources.
 * REPARTIDOR can only access their own embarques and associated pedidos.
 * ASISTENTE has limited access (no ownership checks pass by default).
 */
export async function requireOwnership(
  entity: 'embarque' | 'pedido',
  resourceId: string,
  user: { id: string; role?: string }
): Promise<boolean> {
  // Privileged roles can access everything
  if (PRIVILEGED_ROLES.includes(user.role as Role)) return true;

  if (entity === 'embarque') {
    // Find the trabajador linked to this user, then check if it matches the embarque's trabajador
    const embarque = await prisma.embarque.findUnique({
      where: { id: resourceId },
      select: { trabajador: { select: { userId: true } } },
    });
    return embarque?.trabajador?.userId === user.id;
  }

  if (entity === 'pedido') {
    // A repartidor can see a pedido if it's assigned to one of their embarques
    const pedido = await prisma.pedido.findUnique({
      where: { id: resourceId },
      select: { embarque: { select: { trabajador: { select: { userId: true } } } } },
    });
    return pedido?.embarque?.trabajador?.userId === user.id;
  }

  return false;
}
