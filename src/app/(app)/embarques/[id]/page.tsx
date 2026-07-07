import { notFound } from 'next/navigation'
import { requireAuth } from '@/lib/auth-check'
import { prisma } from '@/lib/prisma'
import { calcularPacasEmbarque, calcularPesoEmbarque, getCapacidadInfo, PESOS_KG } from '@/lib/embarque-capacidad'
import { EmbarqueClient } from './embarque-client'
import type { EmbarqueDetalle } from './types'

interface EmbarquePageProps {
  params: Promise<{ id: string }>
}

export default async function EmbarquePage({ params }: EmbarquePageProps) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return null

  const session = authResult as { user?: { id?: string; role?: string } }
  const { id } = await params

  const embarqueRaw = await prisma.embarque.findUnique({
    where: { id },
    include: {
      trabajador: {
        select: {
          id: true,
          nombre: true,
          capacidadKg: true,
          comPacaAgua: true,
          comPacaHielo: true,
          comBotellon: true,
          comRepartAgua: true,
          comRepartHielo: true,
          comRepartBotellon: true,
        },
      },
      ruta: { select: { id: true, nombre: true } },
      productos: true,
      pedidos: {
        take: 50,
        select: {
          id: true,
          numero: true,
          estado: true,
          estadoEntrega: true,
          estadoPago: true,
          origen: true,
          total: true,
          totalPagado: true,
          saldo: true,
          cPacaAguaPed: true,
          cPacaHieloPed: true,
          cBotellonFabPed: true,
          cBotellonDomPed: true,
          cBolsaAguaPed: true,
          cBolsaHieloPed: true,
          cPacaAguaEnt: true,
          cPacaHieloEnt: true,
          cBotellonFabEnt: true,
          cBotellonDomEnt: true,
          cBolsaAguaEnt: true,
          cBolsaHieloEnt: true,
          cliente: { select: { id: true, nombre: true, barrio: true, telefono: true } },
        },
        orderBy: { numero: 'asc' },
      },
    },
  })

  if (!embarqueRaw) {
    notFound()
  }

  const totalPacas = embarqueRaw.productos && embarqueRaw.productos.length > 0
    ? embarqueRaw.productos.reduce((sum, p) => sum + p.cargadas, 0)
    : calcularPacasEmbarque(embarqueRaw.pedidos)

  const pesoKg = embarqueRaw.productos && embarqueRaw.productos.length > 0
    ? embarqueRaw.productos.reduce(
        (sum, p) => {
          const key = p.producto as keyof typeof PESOS_KG
          const peso = key in PESOS_KG ? PESOS_KG[key] : 0
          return sum + p.cargadas * peso
        },
        0,
      )
    : calcularPesoEmbarque(embarqueRaw.pedidos)

  const capacidadKg = embarqueRaw.trabajador.capacidadKg || 500
  const capacidadInfo = getCapacidadInfo(totalPacas, pesoKg, capacidadKg)

  const trabajadorRaw = embarqueRaw.trabajador
  const trabajador = {
    id: trabajadorRaw.id,
    nombre: trabajadorRaw.nombre,
    capacidadKg: Number(trabajadorRaw.capacidadKg || 0),
    comPacaAgua: Number(trabajadorRaw.comPacaAgua || 0),
    comPacaHielo: Number(trabajadorRaw.comPacaHielo || 0),
    comBotellon: Number(trabajadorRaw.comBotellon || 0),
    comRepartAgua: Number(trabajadorRaw.comRepartAgua || 0),
    comRepartHielo: Number(trabajadorRaw.comRepartHielo || 0),
    comRepartBotellon: Number(trabajadorRaw.comRepartBotellon || 0),
  }

  const embarque: EmbarqueDetalle = {
    id: embarqueRaw.id,
    numero: embarqueRaw.numero,
    numeroDia: embarqueRaw.numeroDia,
    fecha: embarqueRaw.fecha.toISOString(),
    horaSalida: embarqueRaw.horaSalida ? embarqueRaw.horaSalida.toISOString() : null,
    horaLlegada: embarqueRaw.horaLlegada ? embarqueRaw.horaLlegada.toISOString() : null,
    estado: embarqueRaw.estado,
    tipoMoto: embarqueRaw.tipoMoto,
    baseDinero: Number(embarqueRaw.baseDinero || 0),
    obs: embarqueRaw.obs,
    trabajador,
    ruta: embarqueRaw.ruta,
    pedidos: embarqueRaw.pedidos.map((p) => ({
      id: p.id,
      numero: p.numero,
      estado: p.estado,
      estadoEntrega: p.estadoEntrega,
      estadoPago: p.estadoPago,
      origen: p.origen,
      total: Number(p.total),
      totalPagado: Number(p.totalPagado),
      saldo: Number(p.saldo),
      cPacaAguaPed: p.cPacaAguaPed,
      cPacaHieloPed: p.cPacaHieloPed,
      cBotellonFabPed: p.cBotellonFabPed,
      cBotellonDomPed: p.cBotellonDomPed,
      cBolsaAguaPed: p.cBolsaAguaPed,
      cBolsaHieloPed: p.cBolsaHieloPed,
      cPacaAguaEnt: p.cPacaAguaEnt,
      cPacaHieloEnt: p.cPacaHieloEnt,
      cBotellonFabEnt: p.cBotellonFabEnt,
      cBotellonDomEnt: p.cBotellonDomEnt,
      cBolsaAguaEnt: p.cBolsaAguaEnt,
      cBolsaHieloEnt: p.cBolsaHieloEnt,
      cliente: p.cliente,
    })),
    totalPacas,
    pesoKg,
    capacidadKg,
    capacidadInfo,
  }

  return (
    <EmbarqueClient
      embarque={embarque}
      userRole={session.user?.role}
      userId={session.user?.id}
    />
  )
}
