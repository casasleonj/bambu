'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'

const PROTECTED_PATHS = ['/cambiar-contrasena']

export function MustChangePasswordGuard() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (status !== 'loading' && session?.user?.mustChangePassword) {
      if (!PROTECTED_PATHS.includes(pathname)) {
        router.replace('/cambiar-contrasena')
      }
    }
  }, [session, status, pathname, router])

  return null
}
