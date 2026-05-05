export interface Cliente {
  id: string
  nombre: string
  telefono: string
}

export interface NuevoRecurrenteForm {
  clienteId: string
  frecuencia: string
  pacaAgua: number
  pacaHielo: number
  botellonFab: number
  botellonDom: number
  bolsaAgua: number
  bolsaHielo: number
  obs: string
}
