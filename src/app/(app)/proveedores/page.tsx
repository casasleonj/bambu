import { prisma } from "@/lib/prisma";
import ProveedoresClient from "./proveedores-client";

export default async function ProveedoresPage() {
  const data = await prisma.proveedor.findMany({
    where: { activo: true },
    orderBy: { nombre: "asc" },
  });

  // Serialize dates (Prisma returns Date objects that can't be passed as props)
  const proveedores = JSON.parse(JSON.stringify(data));

  return <ProveedoresClient initialProveedores={proveedores} />;
}
