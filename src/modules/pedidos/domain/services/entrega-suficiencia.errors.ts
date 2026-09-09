/**
 * Error de dominio: la información de entrega de un Pedido DOMICILIO no es
 * suficiente para identificar/ejecutar la entrega (estado `INSUFICIENTE` de
 * `resolverEntrega`). Lo lanzan `CrearPedidoUseCase` / `ActualizarPedidoUseCase`
 * al re-validar en el commit; las routes lo mapean a 4xx.
 */
export class EntregaInsuficienteError extends Error {
  constructor(msg = 'ENTREGA_INSUFICIENTE') {
    super(msg)
    this.name = 'EntregaInsuficienteError'
  }
}
