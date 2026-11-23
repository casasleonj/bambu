import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import type { DatoDestacado, EncabezadoResumen, ItemFacturaResumen, PendienteEntregaResumen } from '@/lib/resumen-facturas'

/** Datos ya calculados: el PDF solo los dibuja (las cifras salen de `resumen-facturas.ts`). */
export interface ResumenPdfFactura {
  numero: string
  fechaTxt: string
  estadoTxt: string
  /** Color de la franja lateral y de la insignia de estado. */
  color: string
  total: number
  montoPagado: number
  /** Lo que se debe ahora (exigible: lo entregado menos lo pagado). */
  debe: number
  items: ItemFacturaResumen[]
  pendientes: PendienteEntregaResumen[]
  pendienteMonto: number
  otrosAjustes: number
  /** `null` = no cuadran con lo pagado: se muestra solo el total abonado. */
  abonos: { fechaTxt: string; monto: number }[] | null
}

export interface ResumenPdfData {
  empresa: { nombre: string; nit: string; direccion: string; telefono: string }
  clienteNombre: string
  clienteTelefono: string
  clienteDireccion: string
  generadoTxt: string
  /** Cifra principal y datos destacados según lo consultado (igual que en pantalla). */
  encabezado: EncabezadoResumen
  /** Dato de «La más antigua» ya formateado (la fecha cruda se formatea aquí). */
  datosTxt: { etiqueta: string; valor: string }[]
  /** Subtítulo de la lista, p. ej. «Por cobrar (15) · de la más antigua a la más reciente». */
  contextoTxt: string
  facturas: ResumenPdfFactura[]
  /** Suma final de verificación (solo «Por cobrar»). */
  pie: { etiqueta: string; monto: number } | null
  /** Línea aparte de anuladas (solo «Todas»); nunca suman. */
  anuladasTxt: string | null
}

export function dinero(n: number): string {
  const neg = n < 0 ? '-' : ''
  return `${neg}$${String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`
}

/** Texto de un dato destacado, sin depender de `Intl` (los números ya vienen listos). */
export function datoTexto(d: DatoDestacado, fechaTxt: (iso: string) => string): string {
  if (d.formato === 'dinero') return dinero(Number(d.valor))
  if (d.formato === 'fecha') return fechaTxt(String(d.valor))
  return String(d.valor)
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
  cliente: { borderWidth: 1, borderColor: c.linea, borderRadius: 6, padding: 8, marginTop: 10, flexDirection: 'row', flexWrap: 'wrap' },
  caja: { borderWidth: 1, borderColor: c.linea, borderRadius: 8, padding: 12, flexDirection: 'row', marginTop: 10 },
  saldoGrande: { fontSize: 28, fontFamily: 'Helvetica-Bold' },
  factura: { borderWidth: 1, borderColor: c.linea, borderRadius: 6, padding: 8, marginTop: 7, borderLeftWidth: 5 },
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
          <Text style={{ fontFamily: 'Helvetica-Bold', color: f.debe > 0 ? c.rojo : c.verde }}>{dinero(f.debe)}</Text>
        </Text>
      </View>
      <View style={{ marginTop: 4 }}>
        {f.items.map((it) => (
          <View key={it.producto} style={st.linea}>
            <Text style={[st.celda, { flex: 4 }]}>
              <Text style={{ fontFamily: 'Helvetica-Bold' }}>{`${it.cantidad} × `}</Text>
              {it.etiqueta}
            </Text>
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
      {f.pendientes.length > 0 && (
        <Text style={{ fontSize: 8.5, color: '#92400e', marginTop: 3 }}>
          {`Falta entregar: ${f.pendientes.map((p) => `${p.cantidad} × ${p.etiqueta}`).join(', ')}. Su valor (${dinero(f.pendienteMonto)}) aún no se cobra: solo se debe lo entregado.`}
        </Text>
      )}
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

const COLOR_TONO: Record<EncabezadoResumen['tono'], string> = { debe: c.rojo, alDia: c.verde, neutro: c.gris }

/**
 * Resumen de cuenta para el cliente. Es el MISMO documento que se ve en pantalla
 * (#977): mismo orden, misma cifra principal y mismas filas; solo faltan los
 * controles. El contenido sigue la pestaña consultada y nunca incluye anuladas
 * salvo en la pestaña «Anuladas» (que no se comparte).
 */
export function ResumenFacturasPdf({ data }: { data: ResumenPdfData }) {
  const { encabezado } = data
  const ultima = data.facturas[data.facturas.length - 1]
  const anteriores = data.facturas.slice(0, -1)
  return (
    <Document title={`Resumen consolidado de cuenta - ${data.clienteNombre}`} author={data.empresa.nombre} language="es">
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
            <Text style={st.titulo}>Resumen consolidado de cuenta</Text>
            <Text style={[st.chico, { textAlign: 'right' }]}>{`Generado: ${data.generadoTxt}`}</Text>
          </View>
        </View>

        <View style={st.cliente} wrap={false}>
          <Text style={{ marginRight: 18 }}>
            <Text style={{ color: c.claro }}>{'Cliente  '}</Text>
            <Text style={{ fontFamily: 'Helvetica-Bold' }}>{data.clienteNombre}</Text>
          </Text>
          {data.clienteTelefono ? (
            <Text style={{ marginRight: 18 }}>
              <Text style={{ color: c.claro }}>{'Teléfono  '}</Text>
              <Text style={{ fontFamily: 'Helvetica-Bold' }}>{data.clienteTelefono}</Text>
            </Text>
          ) : null}
          {data.clienteDireccion ? (
            <Text>
              <Text style={{ color: c.claro }}>{'Dirección  '}</Text>
              <Text style={{ fontFamily: 'Helvetica-Bold' }}>{data.clienteDireccion}</Text>
            </Text>
          ) : null}
        </View>

        <View style={st.caja} wrap={false}>
          <View style={{ flex: 1.3 }}>
            <Text style={st.etiqueta}>{encabezado.etiqueta}</Text>
            <Text style={[st.saldoGrande, { color: COLOR_TONO[encabezado.tono] }]}>{dinero(encabezado.monto)}</Text>
            <Text style={st.chico}>{encabezado.nota}</Text>
          </View>
          <View style={{ flex: 1, paddingLeft: 16, flexDirection: 'row', justifyContent: 'flex-end' }}>
            {data.datosTxt.map((d) => (
              <View key={d.etiqueta} style={{ marginLeft: 16 }}>
                <Text style={[st.etiqueta, { textAlign: 'right' }]}>{d.etiqueta}</Text>
                <Text style={{ fontSize: 14, fontFamily: 'Helvetica-Bold', textAlign: 'right' }}>{d.valor}</Text>
              </View>
            ))}
          </View>
        </View>

        <Text style={[st.chico, { marginTop: 10 }]}>{data.contextoTxt}</Text>

        {anteriores.map((f) => (
          <FacturaBloque key={f.numero} f={f} />
        ))}

        {/* La última factura y la suma viajan juntas: nunca queda una página sola con el total. */}
        <View wrap={false}>
          {ultima ? <FacturaBloque f={ultima} /> : null}
          {data.pie ? (
            <View style={[st.fila, { marginTop: 8, paddingTop: 6, borderTopWidth: 1.5, borderTopColor: '#1f2937' }]}>
              <Text style={{ fontSize: 10 }}>{data.pie.etiqueta}</Text>
              <Text style={{ fontSize: 12, fontFamily: 'Helvetica-Bold', color: c.rojo }}>{dinero(data.pie.monto)}</Text>
            </View>
          ) : null}
          {data.anuladasTxt ? <Text style={[st.chico, { marginTop: 6 }]}>{data.anuladasTxt}</Text> : null}
        </View>

        <Text style={st.pie} fixed render={({ pageNumber, totalPages }) =>
          `Resumen informativo de las facturas del período indicado. Si tienes dudas sobre algún valor, responde a este mensaje.   ·   Página ${pageNumber} de ${totalPages}`
        } />
      </Page>
    </Document>
  )
}
