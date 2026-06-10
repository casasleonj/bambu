/**
 * CrearEmbarqueUseCase.
 *
 * Creates a new embarque with stock and capacity validation.
 */

import type { IEmbarqueRepository } from '../../domain/repositories/IEmbarqueRepository'
import type { ITrabajadorEmbarqueRepository } from '../../domain/repositories/ITrabajadorEmbarqueRepository'
import type { IStockEmbarqueRepository } from '../../domain/repositories/IStockEmbarqueRepository'
import type { IEmbarqueProductoRepository } from '../../domain/repositories/IEmbarqueProductoRepository'
import { EmbarqueValidationService } from '../../domain/services/embarque-validation.service'
import { Carga, type ProductCode } from '../../domain/value-objects/Carga'
import type { CrearEmbarqueInput, EmbarqueDetalleDTO } from '../dto'
import { EmbarqueDTOMapper } from '../dto/EmbarqueDTOMapper'
import type { ITransactionManager } from '../../infrastructure/transactions/PrismaTransactionManager'
import { startOfDayBogota } from '@/lib/dates'

export class CrearEmbarqueUseCase {
  constructor(
    private readonly embarqueRepo: IEmbarqueRepository,
    private readonly trabajadorRepo: ITrabajadorEmbarqueRepository,
    private readonly stockRepo: IStockEmbarqueRepository,
    private readonly productoRepo: IEmbarqueProductoRepository,
    private readonly txManager: ITransactionManager,
  ) {}

  private readonly validation = new EmbarqueValidationService()

  async execute(input: CrearEmbarqueInput): Promise<EmbarqueDetalleDTO> {
    return this.txManager.executeWithLock('EMBARQUE', async (tx) => {
      // 1. Validate worker has moto
      const trabajador = await this.trabajadorRepo.findById(input.trabajadorId, tx)
      if (!trabajador) {
        throw new Error('TRABAJADOR_NOT_FOUND')
      }

      const motoValidation = this.validation.validarTrabajadorMoto(trabajador.usaMoto)
      if (!motoValidation.valid) {
        throw new Error(motoValidation.errors.join(', '))
      }

      // 2. Build carga
      const carga = new Carga(input.carga)

      // 3. Validate max units
      const unitsValidation = this.validation.validarMaxUnidades(carga)
      if (!unitsValidation.valid) {
        throw new Error(unitsValidation.errors.join(', '))
      }

      // 4. Validate weight capacity
      const capacidadKg = trabajador.capacidadMotoKg ?? trabajador.capacidadKg ?? 500
      const weightValidation = this.validation.validarCapacidadPeso(carga, capacidadKg)
      if (!weightValidation.valid) {
        throw new Error(weightValidation.errors.join(', '))
      }

      // 5. Validate stock (if requested)
      if (input.verificarStock !== false) {
        const stock = await this.stockRepo.getStockEstimado(new Date(), tx)
        const stockValidation = this.validation.validarStock(carga, stock)
        if (!stockValidation.valid) {
          throw new Error(`STOCK_INSUFFICIENT: ${stockValidation.errors.join(', ')}`)
        }
      }

      // 6. Check no duplicate embarque for worker today
      // FIX Fase 2 §3.3: antes usaba setHours(0,0,0,0) naive (UTC en Vercel).
      // Ahora usa zona Bogotá explícita.
      const today = startOfDayBogota()
      const existing = await this.embarqueRepo.findByTrabajadorAndFecha(input.trabajadorId, today, tx)
      if (existing) {
        throw new Error('El trabajador ya tiene un embarque abierto hoy')
      }

      // 7. Get next sequence number
      const numeroDia = await this.embarqueRepo.getNextNumeroDia(new Date(), tx)

      // 8. Create embarque
      const embarque = await this.embarqueRepo.create(
        {
          trabajadorId: input.trabajadorId,
          rutaId: input.rutaId,
          carga,
          tipoMoto: input.tipoMoto,
          capacidadKg,
          baseDinero: input.baseDinero,
          codigoVisita: input.codigoVisita,
          obs: input.obs,
          createdById: input.createdById,
          numero: numeroDia,
          numeroDia,
        },
        tx,
      )

      // 9. Create EmbarqueProducto records
      for (const [producto, cargadas] of Object.entries(input.carga)) {
        if (cargadas > 0) {
          await this.productoRepo.create(
            {
              embarqueId: embarque.id.value,
              producto: producto as ProductCode,
              cargadas,
              devueltas: 0,
              cambios: 0,
              rotas: 0,
            },
            tx,
          )
        }
      }

      // Re-fetch embarque with productos
      const embarqueConProductos = await this.embarqueRepo.findById(embarque.id.value, tx)
      if (!embarqueConProductos) {
        throw new Error('EMBARQUE_NOT_FOUND_AFTER_CREATE')
      }

      return EmbarqueDTOMapper.toDetalle(embarqueConProductos)
    })
  }
}
