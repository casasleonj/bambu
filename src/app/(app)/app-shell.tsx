import { Header } from './header'
import { Sidebar, MainContent } from './sidebar'

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-100">
      <Header />
      <Sidebar />
      <MainContent>{children}</MainContent>
    </div>
  )
}
