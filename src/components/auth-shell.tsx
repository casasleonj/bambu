/**
 * AuthShell — wrapper compartido para paginas de autenticacion (login,
 * cambiar contrasena, etc.). Resuelve el bug del teclado virtual que tapa
 * el input activo en mobile (ver AGENTS.md "Known Issues" — Bug teclado
 * virtual).
 *
 * Por que este layout:
 * - `min-h-[100dvh]` en vez de `100vh`: dvh se reduce cuando aparece el
 *   teclado virtual en browsers modernos (Chrome 108+, iOS Safari 15.4+).
 * - `items-center justify-center` con `overflow-y-auto`: si el card es mas
 *   alto que el viewport disponible (por ej. con teclado abierto), el
 *   contenedor scrollea en vez de quedar clippeado.
 * - `bg-gradient-to-br from-blue-50 to-blue-100 p-4`: padding lateral y
 *   breathing room para que el card no se pegue a los bordes en pantallas
 *   pequenas.
 *
 * Los handlers `onFocus` con `scrollIntoView` viven en cada form hijo
 * (ver login/page.tsx), no aca. AuthShell solo provee el layout.
 *
 * Server Component puro (sin estado, sin event handlers).
 */
export function AuthShell({
  children,
  title,
  subtitle,
}: {
  children: React.ReactNode
  title?: string
  subtitle?: string
}) {
  return (
    <div className="min-h-[100dvh] flex items-center justify-center overflow-y-auto bg-gradient-to-br from-blue-50 to-blue-100 p-4">
      <div className="w-full max-w-md py-8 bg-white rounded-2xl shadow-xl">
        {(title || subtitle) && (
          <div className="text-center mb-8 px-8 pt-8">
            {title && (
              <h1 className="text-3xl font-bold text-blue-600">{title}</h1>
            )}
            {subtitle && (
              <p className="text-gray-500 mt-2">{subtitle}</p>
            )}
          </div>
        )}
        <div className="px-8 pb-8">{children}</div>
      </div>
    </div>
  )
}
