import { BaseRepository } from "./BaseRepository";
import { prisma } from "@/lib/prisma";

export class PedidoRepository extends BaseRepository<any, any, any> {
  constructor() {
    super(prisma.pedido);
  }

  async findWithCliente(id: string) {
    return prisma.pedido.findUnique({
      where: { id },
      include: { cliente: true, pagos: true, factura: true },
    });
  }

  async findByDateRange(start: Date, end: Date) {
    return prisma.pedido.findMany({
      where: { fecha: { gte: start, lte: end } },
      include: { cliente: true },
      orderBy: { fecha: "desc" },
    });
  }
}
