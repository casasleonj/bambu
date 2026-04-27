import { BaseRepository } from "./BaseRepository";
import { prisma } from "@/lib/prisma";

export class ClienteRepository extends BaseRepository<any, any, any> {
  constructor() {
    super(prisma.cliente);
  }

  async findWithPedidos(id: string) {
    return prisma.cliente.findUnique({
      where: { id },
      include: { pedidos: { orderBy: { fecha: "desc" }, take: 10 } },
    });
  }

  async findByRuta(rutaId: string) {
    return prisma.cliente.findMany({
      where: { rutaId },
      orderBy: { nombre: "asc" },
    });
  }
}
