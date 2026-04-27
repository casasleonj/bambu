import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth-server'

export default async function HomePage() {
  const session = await auth()
  
  if (!session) {
    redirect('/login')
  }
  
  redirect('/dashboard')
}