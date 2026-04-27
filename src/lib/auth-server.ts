import { auth as authNext } from '@/lib/auth'
import { handlers } from '@/lib/auth'

export const auth = authNext
export { handlers }

export async function getSession() {
  return await authNext()
}