export const DEFAULT_PRICES: Record<string, number> = {
  PACA_AGUA: 6500,
  PACA_HIELO: 8000,
  BOTELLON_FAB: 7500,
  BOTELLON_DOM: 10000,
  BOLSA_AGUA: 2500,
  BOLSA_HIELO: 3000,
}

export const PRODUCTO_INFO: Record<string, {
  nombre: string
  unidad: string
  precioKey: string
  codigo: string
  canal: 'PUNTO' | 'DOMICILIO' | 'AMBOS'
  emoji: string
  soloPunto: boolean
}> = {
  pacaAgua:    { nombre: 'Paca de Agua (40u 300ml)', unidad: 'pacas', precioKey: 'PACA_AGUA', codigo: 'PACA_AGUA', canal: 'AMBOS', emoji: '🍶', soloPunto: false },
  pacaHielo:   { nombre: 'Paca de Hielo (20u 600ml)', unidad: 'pacas', precioKey: 'PACA_HIELO', codigo: 'PACA_HIELO', canal: 'AMBOS', emoji: '🧊', soloPunto: false },
  botellonFab: { nombre: 'Botellon Fábrica 20LT', unidad: 'und', precioKey: 'BOTELLON_FAB', codigo: 'BOTELLON_FAB', canal: 'PUNTO', emoji: '🏭', soloPunto: true },
  botellonDom: { nombre: 'Botellon Domicilio 20LT', unidad: 'und', precioKey: 'BOTELLON_DOM', codigo: 'BOTELLON_DOM', canal: 'DOMICILIO', emoji: '🏠', soloPunto: false },
  bolsaAgua:   { nombre: 'Bolsa de Agua 300ml', unidad: 'bolsas', precioKey: 'BOLSA_AGUA', codigo: 'BOLSA_AGUA', canal: 'AMBOS', emoji: '💧', soloPunto: true },
  bolsaHielo:  { nombre: 'Bolsa de Hielo 600ml', unidad: 'bolsas', precioKey: 'BOLSA_HIELO', codigo: 'BOLSA_HIELO', canal: 'AMBOS', emoji: '❄️', soloPunto: true },
}

export type ProductoId = keyof typeof PRODUCTO_INFO

export function getProductosForCanal(canal: 'PUNTO' | 'DOMICILIO'): ProductoId[] {
  return (Object.keys(PRODUCTO_INFO) as ProductoId[]).filter(id => {
    const info = PRODUCTO_INFO[id]
    if (canal === 'DOMICILIO') return !info.soloPunto
    return info.canal === 'PUNTO' || info.canal === 'AMBOS'
  })
}
