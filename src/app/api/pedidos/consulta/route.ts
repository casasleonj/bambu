import type { NextRequest } from "next/server";
import { requireAuth, requirePermission } from "@/lib/auth-check";
import { apiError, apiSuccess } from "@/lib/api-response";
import {
  FiltroPedidosError,
  leerFiltrosConsulta,
} from "@/lib/pedidos-consulta";
import { consultarPedidos } from "@/lib/pedidos-consulta.repository";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  const session = await requireAuth();
  if (session instanceof Response) return session;
  const permiso = await requirePermission("view:pedidos", session);
  if (permiso instanceof Response) return permiso;
  try {
    const filtros = leerFiltrosConsulta(request.nextUrl.searchParams);
    const resultado = await consultarPedidos(
      filtros,
      session.user?.role ?? null,
    );
    const response = apiSuccess(resultado);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    if (error instanceof FiltroPedidosError)
      return apiError(error.message, 400);
    logger.error({ err: error }, "No se pudo consultar el rango de pedidos");
    return apiError(
      "No se pudo actualizar la consulta. Conservamos la última lectura; vuelve a intentarlo.",
      503,
    );
  }
}
