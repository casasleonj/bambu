import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import type { ItemFacturaResumen } from '@/lib/resumen-facturas'

/** Datos ya calculados: el PDF solo los dibuja (las cifras salen de `resumen-facturas.ts`). */
export interface ResumenPdfFactura {
  numero: string
  fechaTxt: string
  estadoTxt: string
  /** Color de la franja lateral. */
  color: string
  total: number
  montoPagado: number
  saldo: number
  items: ItemFacturaResumen[]
  otrosAjustes: number
  /** `null` = no cuadran con lo pagado: se muestra solo el total abonado. */
  abonos: { fechaTxt: string; monto: number }[] | null
}

export interface ResumenPdfData {
  empresa: { nombre: string; nit: string; direccion: string; telefono: string }
  clienteNombre: string
  periodoTxt: string
  generadoTxt: string
  facturas: ResumenPdfFactura[]
  totales: { total: number; totalPagado: number; saldo: number; count: number }
}

export function dinero(n: number): string {
  const neg = n < 0 ? '-' : ''
  return `${neg}$${String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`
}

const c = {
  ink: '#111827',
  gris: '#4b5563',
  claro: '#6b7280',
  linea: '#d1d5db',
  verde: '#15803d',
  rojo: '#b91c1c',
}

const st = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 56, paddingHorizontal: 44, fontFamily: 'Helvetica', fontSize: 10, color: c.ink },
  header: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 2, borderBottomColor: '#1f2937', paddingBottom: 10 },
  empresa: { fontSize: 16, fontFamily: 'Helvetica-Bold' },
  chico: { fontSize: 8.5, color: c.gris, marginTop: 2 },
  titulo: { fontSize: 11, fontFamily: 'Helvetica-Bold', textAlign: 'right', textTransform: 'uppercase' },
  fila: { flexDirection: 'row', justifyContent: 'space-between' },
  etiqueta: { fontSize: 7.5, color: c.claro, textTransform: 'uppercase', fontFamily: 'Helvetica-Bold' },
  dato: { fontSize: 11, fontFamily: 'Helvetica-Bold' },
  caja: { borderWidth: 1.5, borderColor: '#1f2937', borderRadius: 8, padding: 12, flexDirection: 'row', marginTop: 12 },
  saldoGrande: { fontSize: 28, fontFamily: 'Helvetica-Bold', color: c.rojo },
  barra: { flexDirection: 'row', height: 10, borderRadius: 5, backgroundColor: '#e5e7eb', overflow: 'hidden', marginTop: 4 },
  factura: { borderWidth: 1, borderColor: c.linea, borderRadius: 6, padding: 8, marginTop: 8, borderLeftWidth: 5 },
  th: { fontSize: 7.5, color: c.claro, textTransform: 'uppercase' },
  celda: { fontSize: 9 },
  linea: { flexDirection: 'row', borderTopWidth: 0.5, borderTopColor: '#e5e7eb', paddingVertical: 2.5 },
  pie: { position: 'absolute', left: 44, right: 44, bottom: 24, fontSize: 7.5, color: c.claro, borderTopWidth: 0.5, borderTopColor: c.linea, paddingTop: 6 },
})

function FacturaBloque({ f }: { f: ResumenPdfFactura }) {
  return (
    <View style={[st.factura, { borderLeftColor: f.color }]} wrap={false}>
      <View style={st.fila}>
        <Text>
          <Text style={{ fontFamily: 'Helvetica-Bold' }}>{f.numero}</Text>
          {`  ·  ${f.fechaTxt}  ·  ${f.estadoTxt}`}
        </Text>
        <Text>
          {'Total '}
          <Text style={{ fontFamily: 'Helvetica-Bold' }}>{dinero(f.total)}</Text>
          {'  ·  Debe '}
          <Text style={{ fontFamily: 'Helvetica-Bold', color: f.saldo > 0 ? c.rojo : c.verde }}>{dinero(f.saldo)}</Text>
        </Text>
      </View>
      <View style={{ marginTop: 4 }}>
        {f.items.map((it) => (
          <View key={it.producto} style={st.linea}>
            <Text style={[st.celda, { flex: 3 }]}>{it.etiqueta}</Text>
            <Text style={[st.celda, { flex: 1, textAlign: 'right' }]}>{`× ${it.cantidad}`}</Text>
            <Text style={[st.celda, { flex: 2, textAlign: 'right', color: c.gris }]}>{`${dinero(it.precio)} c/u`}</Text>
            <Text style={[st.celda, { flex: 2, textAlign: 'right' }]}>{dinero(it.subtotal)}</Text>
          </View>
        ))}
        {f.otrosAjustes !== 0 && (
          <View style={st.linea}>
            <Text style={[st.celda, { flex: 6 }]}>Otros ajustes</Text>
            <Text style={[st.celda, { flex: 2, textAlign: 'right' }]}>{dinero(f.otrosAjustes)}</Text>
          </View>
        )}
      </View>
      {f.montoPagado > 0 && (
        <Text style={{ fontSize: 8.5, color: c.gris, marginTop: 3 }}>
          {f.abonos && f.abonos.length > 0
            ? `Abonos: ${f.abonos.map((a) => `${dinero(a.monto)} el ${a.fechaTxt}`).join(' · ')}.`
            : `Total abonado: ${dinero(f.montoPagado)}.`}
        </Text>
      )}
    </View>
  )
}

/** Resumen de cuenta para el cliente: solo facturas vigentes (las anuladas no se incluyen). */
export function ResumenFacturasPdf({ data }: { data: ResumenPdfData }) {
  const { totales } = data
  const pct = totales.total > 0 ? Math.round((totales.totalPagado / totales.total) * 100) : 0
  const conSaldo = data.facturas.filter((f) => f.saldo > 0)
  return (
    <Document title={`Resumen de cuenta - ${data.clienteNombre}`} author={data.empresa.nombre} language="es">
      <Page size="A4" style={st.page}>
        <View style={st.header} fixed>
          <View>
            <Text style={st.empresa}>{data.empresa.nombre}</Text>
            {data.empresa.nit ? <Text style={st.chico}>{`NIT: ${data.empresa.nit}`}</Text> : null}
            <Text style={st.chico}>
              {[data.empresa.direccion, data.empresa.telefono ? `Tel: ${data.empresa.telefono}` : ''].filter(Boolean).join(' · ')}
            </Text>
          </View>
          <View>
            <Text style={st.titulo}>Resumen de cuenta</Text>
            <Text style={[st.chico, { textAlign: 'right' }]}>{`Emitido: ${data.generadoTxt}`}</Text>
          </View>
        </View>

        <View style={[st.fila, { marginTop: 12 }]}>
          <View>
            <Text style={st.etiqueta}>Cliente</Text>
            <Text style={st.dato}>{data.clienteNombre}</Text>
          </View>
          <View>
            <Text style={[st.etiqueta, { textAlign: 'right' }]}>Período</Text>
            <Text style={st.dato}>{data.periodoTxt}</Text>
          </View>
        </View>

        <View style={st.caja} wrap={false}>
          <View style={{ flex: 1 }}>
            <Text style={st.etiqueta}>{totales.saldo > 0 ? 'Saldo a pagar' : 'Cuenta al día'}</Text>
            <Text style={[st.saldoGrande, totales.saldo > 0 ? {} : { color: c.verde }]}>{dinero(totales.saldo)}</Text>
            {conSaldo.length > 0 && (
              <Text style={st.chico}>
                {`${conSaldo.length} factura${conSaldo.length === 1 ? '' : 's'} con saldo: ${conSaldo
                  .map((f) => `${f.numero} (${dinero(f.saldo)})`)
                  .join(' · ')}`}
              </Text>
            )}
          </View>
          <View style={{ flex: 1.1, paddingLeft: 16, justifyContent: 'center' }}>
            <View style={st.barra}>
              <View style={{ width: `${pct}%`, backgroundColor: c.verde }} />
              <View style={{ width: `${totales.total > 0 ? 100 - pct : 0}%`, backgroundColor: '#dc2626' }} />
            </View>
            <View style={[st.fila, { marginTop: 4 }]}>
              <Text style={{ color: c.verde, fontFamily: 'Helvetica-Bold', fontSize: 9 }}>{`Pagado ${dinero(totales.totalPagado)}`}</Text>
              <Text style={{ color: c.rojo, fontFamily: 'Helvetica-Bold', fontSize: 9 }}>{`Falta ${dinero(totales.saldo)}`}</Text>
            </View>
            <Text style={st.chico}>{`De ${dinero(totales.total)} facturados en ${totales.count} factura${totales.count === 1 ? '' : 's'}`}</Text>
          </View>
        </View>

        {data.facturas.map((f) => (
          <FacturaBloque key={f.numero} f={f} />
        ))}

        <Text style={st.pie} fixed render={({ pageNumber, totalPages }) =>
          `Este resumen incluye las facturas vigentes del período indicado. No incluye facturas anuladas. Si tienes dudas sobre algún valor, responde a este mensaje.   ·   Página ${pageNumber} de ${totalPages}`
        } />
      </Page>
    </Document>
  )
}
