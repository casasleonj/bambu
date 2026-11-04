const nombres: Record<string, string> = {
  PACA_AGUA: 'Paca de agua',
  PACA_HIELO: 'Paca de hielo',
  BOTELLON: 'Botellón',
  BOTELLON_FAB: 'Botellón en punto',
  BOTELLON_DOM: 'Botellón a domicilio',
  BOLSA_AGUA: 'Bolsa de agua',
  BOLSA_HIELO: 'Bolsa de hielo',
  cPacaAgua: 'Paca de agua',
  cPacaHielo: 'Paca de hielo',
  cBotellonFab: 'Botellón en punto',
  cBotellonDom: 'Botellón a domicilio',
  cBolsaAgua: 'Bolsa de agua',
  cBolsaHielo: 'Bolsa de hielo',
}
export function ProductosHabituales({
  productos,
}: {
  productos: Record<string, number>
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {Object.entries(productos)
        .filter(([, n]) => n > 0)
        .map(([codigo, n]) => (
          <span
            key={codigo}
            className="rounded-md border border-stone-200 bg-stone-50 px-2 py-1 text-xs text-stone-700"
          >
            <span aria-hidden="true">
              {codigo.includes('HIELO') || codigo.includes('Hielo')
                ? '❄ '
                : '💧 '}
            </span>
            <strong>{n}</strong> {nombres[codigo] ?? codigo}
          </span>
        ))}
    </div>
  )
}
export function fechaHabitual(value: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Sin fecha definida'
  return new Date(value).toLocaleDateString('es-CO', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}
