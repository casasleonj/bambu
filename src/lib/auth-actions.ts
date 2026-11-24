'use server'

import { signIn } from '@/lib/auth'
import { AuthError, CredentialsSignin } from 'next-auth'

export async function authenticate(_prevState: string | undefined, formData: FormData) {
  try {
    await signIn('credentials', {
      username: formData.get('username') as string,
      password: formData.get('password') as string,
      redirectTo: '/login/redirect',
    })
  } catch (error) {
    if (error instanceof AuthError) {
      if (error instanceof CredentialsSignin && error.code === 'temporarily_unavailable') {
        return 'El servicio no está disponible en este momento. Reintenta en unos segundos.'
      }
      return 'Credenciales inválidas'
    }
    throw error
  }
}
