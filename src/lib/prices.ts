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
}> = {
  pacaAgua:    { nombre: 'Paca de Agua (40u 300ml)', unidad: 'pacas', precioKey: 'PACA_AGUA', codigo: 'PACA_AGUA', canal: 'AMBOS', emoji: '🍶' },
  pacaHielo:   { nombre: 'Paca de Hielo (20u 600ml)', unidad: 'pacas', precioKey: 'PACA_HIELO', codigo: 'PACA_HIELO', canal: 'AMBOS', emoji: '🧊' },
  botellonFab: { nombre: 'Botellon Fábrica 20LT', unidad: 'und', precioKey: 'BOTELLON_FAB', codigo: 'BOTELLON_FAB', canal: 'PUNTO', emoji: '🏭' },
  botellonDom: { nombre: 'Botellon Domicilio 20LT', unidad: 'und', precioKey: 'BOTELLON_DOM', codigo: 'BOTELLON_DOM', canal: 'DOMICILIO', emoji: '🏠' },
  bolsaAgua:   { nombre: 'Bolsa de Agua 300ml', unidad: 'bolsas', precioKey: 'BOLSA_AGUA', codigo: 'BOLSA_AGUA', canal: 'AMBOS', emoji: '💧' },
  bolsaHielo:  { nombre: 'Bolsa de Hielo 600ml', unidad: 'bolsas', precioKey: 'BOLSA_HIELO', codigo: 'BOLSA_HIELO', canal: 'AMBOS', emoji: '❄️' },
}

export type ProductoId = keyof typeof PRODUCTO_INFO
