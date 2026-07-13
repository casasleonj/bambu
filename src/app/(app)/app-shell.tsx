import { Header } from './header'
import { Sidebar, MainContent } from './sidebar'

interface AppShellProps {
  children: React.ReactNode
  fechaLarga: string
  fechaCorta: string
}

export function AppShell({ children, fechaLarga, fechaCorta }: AppShellProps) {
  return (
    <div className="min-h-[100dvh] bg-gray-100">
      <div className="print:hidden">
        <Header fechaLarga={fechaLarga} fechaCorta={fechaCorta} />
        <Sidebar />
      </div>
      <MainContent>{children}</MainContent>
    </div>
  )
}
