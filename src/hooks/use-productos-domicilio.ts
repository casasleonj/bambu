import { useState, useEffect } from 'react'

interface ProductoConfig {
  codigo: string
  nombre: string
  aplicaDomicilio: boolean
  sobreCostoDomicilio: number
}

export function useProductosDomicilio() {
  const [productos, setProductos] = useState<ProductoConfig[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/productos/configs', { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        const all = data.productos || []
        setProductos(all.filter((p: ProductoConfig) => p.aplicaDomicilio))
      })
      .catch(() => setProductos([]))
      .finally(() => setLoading(false))
  }, [])

  return { productos, loading }
}

const PRODUCTO_EMOJIS: Record<string, string> = {
  PACA_AGUA: '🚛',
  PACA_HIELO: '🧊',
  BOTELLON: '🫗',
  BOLSA_AGUA: '💧',
  BOLSA_HIELO: '❄️',
}

export function getProductoEmoji(codigo: string): string {
  return PRODUCTO_EMOJIS[codigo] || '📦'
}
