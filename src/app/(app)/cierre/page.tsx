import CierreClient from './cierre-client'

export default async function CierrePage(props: { searchParams: Promise<{ fecha?: string }> }) {
  const { fecha } = await props.searchParams
  return <CierreClient key={fecha ?? 'today'} initialFecha={fecha ?? null} />
}
