import { Header } from './header'
import { Sidebar, MainContent } from './sidebar'

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-gray-100">
      <div className="print:hidden">
        <Header />
        <Sidebar />
      </div>
      <MainContent>{children}</MainContent>
    </div>
  )
}
