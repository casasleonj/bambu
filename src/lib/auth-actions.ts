'use server'

import { signIn } from '@/lib/auth'
import { AuthError } from 'next-auth'

export async function authenticate(_prevState: string | undefined, formData: FormData) {
  try {
    await signIn('credentials', {
      username: formData.get('username') as string,
      password: formData.get('password') as string,
      redirectTo: '/login/redirect',
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return 'Credenciales inválidas'
    }
    throw error
  }
}
