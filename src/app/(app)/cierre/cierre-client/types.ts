export interface CierreData {
  numPedidos: number
  totalVentas: number
  cobrado: number
  fiado: number
  efectivo: number
  transferencia: number
  nequi: number
  daviplata: number
  bono: number
  aguaVendida: number
  hieloVendido: number
  botellonVendido: number
  bolsaAguaVendida: number
  bolsaHieloVendida: number
  totalGastos: number
  produccion: {
    prodAgua: number
    prodHielo: number
    stockIniAgua: number
    stockIniHielo: number
    stockFinAgua: number
    stockFinHielo: number
  } | null
}
