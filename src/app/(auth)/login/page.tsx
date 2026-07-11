import { Suspense } from 'react'
import { AuthShell } from '@/components/auth-shell'
import { LoginForm } from './login-form'

export default function LoginPage() {
  return (
    <AuthShell title="Agua Bambú" subtitle="Sistema de Gestión">
      <Suspense fallback={<div className="h-64" aria-hidden="true" />}>
        <LoginForm />
      </Suspense>
    </AuthShell>
  )
}
