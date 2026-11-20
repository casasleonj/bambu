import { describe, expect, it } from 'vitest'
import { ordenarPrioridadPedidos } from '../pedidos-prioridad-921'
import { ordenarPorFranja } from '../pedidos-franja'
import { filtrosArrastrados } from '../pedidos-consulta'

const ahora = new Date('2026-11-20T14:30:00Z')
const pedido = (id: string, pago: number, hora: string | null, createdAt: string, estadoEntrega = 'PENDIENTE') => ({
  id, createdAt: new Date(createdAt), total: 1000, totalPagado: pago, confirmado: pago, saldo: 1000-pago,
  estadoEntrega, fechaEntrega: new Date('2026-11-20T13:00:00Z'), entregaNoAntesDe: hora,
  items: [{cantPedido:10,cantEntrega:0,cantRegaloPedido:0,cantRegaloEntrega:0}],
})
const ordenarHoy = (items: ReturnType<typeof pedido>[]) =>
  ordenarPorFranja(ordenarPrioridadPedidos(items, ahora), ahora, p => p).map(p => p.id)

describe('#921 filtros, arrastres y franjas', () => {
  it('«Ya toca» precede a pagado normal, que precede a sin pagar normal y «Más tarde»', () => {
    const items = [
      pedido('mas-tarde', 1000, '15:00', '2026-11-19T10:00:00Z'),
      pedido('sin-pago', 0, null, '2026-11-19T11:00:00Z'),
      pedido('pagado', 1000, null, '2026-11-20T10:00:00Z'),
      pedido('ya-toca', 0, '10:00', '2026-11-20T11:00:00Z'),
    ]
    expect(ordenarHoy(items)).toEqual(['ya-toca', 'pagado', 'sin-pago', 'mas-tarde'])
  })
  it('filtros combinados cambian pertenencia pero no la prioridad relativa', () => {
    const items = [
      {...pedido('a', 0, null, '2026-11-19T10:00:00Z'), canal:'DOMICILIO', barrio:'NORTE'},
      {...pedido('b', 1000, null, '2026-11-20T10:00:00Z'), canal:'DOMICILIO', barrio:'NORTE'},
      {...pedido('c', 1000, null, '2026-11-20T09:00:00Z'), canal:'PUNTO', barrio:'NORTE'},
      {...pedido('d', 0, null, '2026-11-18T10:00:00Z'), canal:'DOMICILIO', barrio:'SUR'},
    ]
    const ids = (xs: typeof items) => ordenarPrioridadPedidos(xs, ahora).map(x => x.id)
    expect(ids(items.filter(x=>x.canal==='DOMICILIO'))).toEqual(['b','d','a'])
    expect(ids(items.filter(x=>x.canal==='DOMICILIO' && x.barrio==='NORTE'))).toEqual(['b','a'])
  })
  it('filtro de arrastrados preserva canal y estado compatible, sin mezclar futuros', () => {
    const base = {
      desde:'2026-11-20', hasta:'2026-11-20', desdeHora:'',hastaHora:'',all:false,
      fechaBase:'pedido' as const, registro:'activos' as const,
      canal:['DOMICILIO'],origen:[],estadoEntrega:['PENDIENTE'],estadoPago:[],
      pago:'todos' as const,repartidorId:[],search:'',clienteId:'',foco:'' as const,
      conRecurrencia:false,agrupar:'' as const,grupoBarrio:'',resumen:false,page:1,pageSize:20,
    }
    const arrastre = filtrosArrastrados(base, '2026-11-20')
    expect(arrastre?.canal).toEqual(['DOMICILIO'])
    expect(arrastre?.estadoEntrega).toEqual(['PENDIENTE'])
    expect(arrastre?.hasta).toBe('2026-11-19')
    expect(filtrosArrastrados({...base,foco:'paraHoy'},'2026-11-20')).toBeNull()
  })
})
