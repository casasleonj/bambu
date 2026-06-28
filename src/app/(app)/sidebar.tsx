'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { signOut } from 'next-auth/react'
import { useEffect, useMemo, useState } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DraggableAttributes,
  DragOverlay,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { purgeSWCache } from '@/lib/purge-sw-cache'
import { unsubscribePushOnLogout } from '@/lib/push-cleanup'
import { revokeSessionOnLogout } from '@/lib/session-cleanup'
import { PushSettings } from '@/components/push-settings'
import { CajaBaseHeader } from '@/components/caja-base-header'
import { useAppStore } from '@/stores/app-store'
import { useIsDesktop } from '@/hooks/use-is-desktop'
import { getUserPermissions, type Permission } from '@/lib/permissions'
import type { Role } from '@/lib/constants'
import { Collapsible, CollapsibleContent, CollapsibleTrigger, useCollapsible } from '@/components/ui/collapsible'
import { icons, navSections, topLevelItems, defaultMenuOrder, type NavItem, type NavSubItem, type NavSection } from './nav-data'

function NavIcon({ name }: { name: string }) {
  return <>{icons[name] || null}</>
}

function ChevronIcon() {
  const { open } = useCollapsible()
  return (
    <svg
      className={`w-4 h-4 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  )
}

function hasPermission(requiredPermission: Permission | undefined, permissions: Permission[]): boolean {
  if (!requiredPermission) return true
  return permissions.includes(requiredPermission)
}

function filterSubItems(subItems: NavSubItem[] | undefined, permissions: Permission[]): NavSubItem[] {
  if (!subItems) return []
  return subItems.filter(sub => hasPermission(sub.requiredPermission, permissions))
}

function filterItems(items: NavItem[], permissions: Permission[]): NavItem[] {
  const result: NavItem[] = []
  for (const item of items) {
    const visibleSubItems = filterSubItems(item.subItems, permissions)
    // Show item if it has permission OR any of its subItems are visible
    if (!hasPermission(item.requiredPermission, permissions) && visibleSubItems.length === 0) {
      continue
    }
    result.push({ ...item, subItems: visibleSubItems.length > 0 ? visibleSubItems : item.subItems })
  }
  return result
}

/**
 * Reconcilia el orden guardado por el usuario contra las secciones/items
 * actuales del código. Descarta hrefs o secciones que ya no existen,
 * agrega secciones nuevas al final, y agrega items nuevos al final de su
 * sección. Los items siempre se reubican dentro de su sección original.
 *
 * Items "top-level" viven antes de la primera sección. Se identifican por
 * el prefijo `top:` o por no estar en ninguna sección actual.
 */
export function reconcileMenuOrder(
  saved: string[],
  sections: NavSection[],
  topLevelItems: NavItem[] = []
): string[] {
  const sectionIds = new Set(sections.map((s) => `section:${s.title}`))
  const itemSectionMap = new Map<string, string>()
  const itemHrefs = new Set<string>()

  for (const item of topLevelItems) {
    itemSectionMap.set(item.href, '__top__')
    itemHrefs.add(item.href)
  }

  for (const section of sections) {
    for (const item of section.items) {
      itemSectionMap.set(item.href, section.title)
      itemHrefs.add(item.href)
    }
  }

  // Normalizar ids legacy: si un href guardado como item de sección ahora es
  // top-level, lo promovemos automáticamente.
  function normalizeId(id: string): string {
    if (id.startsWith('section:')) return id
    if (id.startsWith('top:')) return id
    if (itemSectionMap.get(id) === '__top__') return `top:${id}`
    return id
  }

  // Mantener elementos existentes en el orden guardado.
  const valid: string[] = []
  const seen = new Set<string>()
  for (const rawId of saved) {
    const id = normalizeId(rawId)
    const exists = id.startsWith('section:')
      ? sectionIds.has(id)
      : id.startsWith('top:')
        ? itemHrefs.has(id.slice(4))
        : itemHrefs.has(id)
    if (exists && !seen.has(id)) {
      valid.push(id)
      seen.add(id)
    }
  }

  // Secciones en orden: primero las que el usuario guardó, luego las nuevas.
  const sectionOrder: string[] = []
  for (const id of valid) {
    if (id.startsWith('section:') && !sectionOrder.includes(id)) {
      sectionOrder.push(id)
    }
  }
  for (const section of sections) {
    const sectionId = `section:${section.title}`
    if (!sectionOrder.includes(sectionId)) {
      sectionOrder.push(sectionId)
    }
  }

  // Top-level items: respetar orden guardado, luego agregar los nuevos.
  const finalOrder: string[] = []
  const placedItems = new Set<string>()

  for (const id of valid) {
    if (id.startsWith('top:') && itemHrefs.has(id.slice(4)) && !placedItems.has(id)) {
      finalOrder.push(id)
      placedItems.add(id)
    }
  }
  for (const item of topLevelItems) {
    const id = `top:${item.href}`
    if (!placedItems.has(id)) {
      finalOrder.push(id)
      placedItems.add(id)
    }
  }

  // Reconstruir la lista aplanada: header de sección + items de esa sección
  // en el orden que el usuario definió, con items nuevos al final.
  for (const sectionId of sectionOrder) {
    finalOrder.push(sectionId)
    const sectionTitle = sectionId.slice(8)
    const sectionItems = sections.find((s) => s.title === sectionTitle)?.items.map((i) => i.href) ?? []

    // Items de esta sección que ya estaban en el orden guardado, respetando su orden.
    for (const id of valid) {
      if (sectionItems.includes(id) && itemSectionMap.get(id) === sectionTitle && !placedItems.has(id)) {
        finalOrder.push(id)
        placedItems.add(id)
      }
    }
    // Items nuevos de esta sección que no estaban en el orden guardado.
    for (const href of sectionItems) {
      if (!placedItems.has(href)) {
        finalOrder.push(href)
        placedItems.add(href)
      }
    }
  }

  return finalOrder
}

function SidebarMenuItem({ item, dragHandle }: { item: NavItem; dragHandle?: React.ReactNode }) {
  const pathname = usePathname()
  const hasSubItems = item.subItems && item.subItems.length > 0

  // Check if this item or any of its subitems is active
  const isItemActive = pathname === item.href
  const isSubItemActive = item.subItems?.some(sub => pathname === sub.href)
  const isActive = isItemActive || isSubItemActive
  const defaultOpen = isSubItemActive || isItemActive

  if (hasSubItems) {
    return (
      <Collapsible defaultOpen={defaultOpen}>
        <CollapsibleTrigger
          className={`flex items-center justify-between w-full gap-3 py-2.5 px-4 rounded-lg transition text-sm ${
            isActive
              ? 'text-blue-600 font-semibold bg-blue-50'
              : 'text-gray-700 hover:bg-gray-50'
          }`}
        >
          <div className="flex items-center gap-3">
            {dragHandle}
            <NavIcon name={item.icon} />
            <span>{item.label}</span>
          </div>
          <ChevronIcon />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="ml-4 pl-4 border-l border-gray-200 space-y-1 mt-1">
            {item.subItems!.map((subItem) => {
              const isSubActive = pathname === subItem.href
              return (
                <Link
                  key={subItem.href}
                  href={subItem.href}
                  aria-current={isSubActive ? 'page' : undefined}
                  className={`flex items-center gap-3 py-2 px-3 rounded-lg transition text-sm ${
                    isSubActive
                      ? 'bg-blue-50 text-blue-600 font-medium'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <NavIcon name={subItem.icon} />
                  <span>{subItem.label}</span>
                </Link>
              )
            })}
          </div>
        </CollapsibleContent>
      </Collapsible>
    )
  }

  return (
    <Link
      href={item.href}
      aria-current={isActive ? 'page' : undefined}
      className={`flex items-center gap-3 py-2.5 px-4 rounded-lg transition text-sm ${
        isActive
          ? 'bg-blue-50 text-blue-600 font-semibold border-l-4 border-blue-500 pl-3'
          : 'text-gray-700 hover:bg-gray-50'
      }`}
    >
      {dragHandle}
      <NavIcon name={item.icon} />
      <span>{item.label}</span>
    </Link>
  )
}

function DragHandle({
  listeners,
  attributes,
}: {
  listeners?: Record<string, Function>
  attributes?: DraggableAttributes
}) {
  return (
    <span
      {...attributes}
      {...listeners}
      data-testid="drag-handle"
      className="touch-none cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 flex-shrink-0 select-none"
      style={{ WebkitTouchCallout: 'none' }}
      aria-label="Arrastrar para reordenar"
      role="button"
      tabIndex={0}
      onContextMenu={(event) => event.preventDefault()}
    >
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
        <circle cx="9" cy="6" r="2" />
        <circle cx="15" cy="6" r="2" />
        <circle cx="9" cy="12" r="2" />
        <circle cx="15" cy="12" r="2" />
        <circle cx="9" cy="18" r="2" />
        <circle cx="15" cy="18" r="2" />
      </svg>
    </span>
  )
}

function SortableNavSectionHeader({ title, editing }: { title: string; editing: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `section:${title}`,
    data: { type: 'section' },
    disabled: !editing,
  })
  const style = { transform: CSS.Transform.toString(transform), transition }

  return (
    <h3
      ref={setNodeRef}
      style={style}
      className={`text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-2 flex items-center gap-2 ${
        isDragging ? 'opacity-30' : ''
      }`}
    >
      {editing && <DragHandle listeners={listeners} attributes={attributes} />}
      {title}
    </h3>
  )
}

function SortableNavItem({
  item,
  editing,
  isTopLevel,
}: {
  item: NavItem
  editing: boolean
  isTopLevel?: boolean
}) {
  const id = isTopLevel ? `top:${item.href}` : item.href
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    data: { type: 'item', section: isTopLevel ? '__top__' : null },
    disabled: !editing,
  })
  const style = { transform: CSS.Transform.toString(transform), transition }
  const dragHandle = editing ? <DragHandle listeners={listeners} attributes={attributes} /> : undefined

  return (
    <div ref={setNodeRef} style={style} className={`${isDragging ? 'opacity-30' : ''}`}>
      <SidebarMenuItem item={item} dragHandle={dragHandle} />
    </div>
  )
}

export function Sidebar() {
  const isDesktop = useIsDesktop()
  const mobileDrawerOpen = useAppStore((s) => s.mobileDrawerOpen)
  const setMobileDrawerOpen = useAppStore((s) => s.setMobileDrawerOpen)
  const desktopCollapsed = useAppStore((s) => s.desktopCollapsed)
  const pathname = usePathname()

  const { data: session } = useSession()
  const userId = (session?.user as { id?: string } | undefined)?.id
  const userRole = (session?.user as { role?: Role } | undefined)?.role
  const permissions = getUserPermissions(userRole)

  const setMenuOrder = useAppStore((s) => s.setMenuOrder)
  const resetMenuOrder = useAppStore((s) => s.resetMenuOrder)

  const effectiveUserId = userId ?? 'anonymous'
  const savedOrder = useAppStore((s) => s.menuOrderByUser[effectiveUserId])
  const menuEditing = useAppStore((s) => s.menuEditingByUser[effectiveUserId])

  // FIX Fase 4 §6.4 + REGRESION mobile 2026-06-10: en móvil, cerrar el drawer
  // SOLO cuando el usuario navega a otra ruta. NO al abrir/cerrar el drawer.
  useEffect(() => {
    const { mobileDrawerOpen } = useAppStore.getState()
    if (!isDesktop && mobileDrawerOpen) {
      useAppStore.getState().setMobileDrawerOpen(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, isDesktop])

  // FIX §6.4: scroll-lock del body mientras el drawer móvil está abierto
  useEffect(() => {
    if (typeof document === 'undefined') return
    if (!isDesktop && mobileDrawerOpen) {
      const prev = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = prev
      }
    }
  }, [isDesktop, mobileDrawerOpen])

  // Construir estructura filtrada y ordenada.
  const filteredTopLevel = useMemo(() => filterItems(topLevelItems, permissions), [permissions])
  const filteredSections = useMemo(() => {
    return navSections
      .map((section) => ({ ...section, items: filterItems(section.items, permissions) }))
      .filter((section) => section.items.length > 0)
  }, [permissions])

  const itemSectionMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const item of filteredTopLevel) {
      map.set(item.href, '__top__')
    }
    for (const section of filteredSections) {
      for (const item of section.items) {
        map.set(item.href, section.title)
      }
    }
    return map
  }, [filteredTopLevel, filteredSections])

  const defaultOrder = useMemo(
    () => reconcileMenuOrder(defaultMenuOrder as string[], filteredSections, filteredTopLevel),
    [filteredSections, filteredTopLevel]
  )
  const order = useMemo(
    () =>
      reconcileMenuOrder(
        savedOrder && savedOrder.length > 0 ? savedOrder : defaultOrder,
        filteredSections,
        filteredTopLevel
      ),
    [savedOrder, defaultOrder, filteredSections, filteredTopLevel]
  )

  const itemMap = useMemo(() => {
    const map = new Map<string, NavItem>()
    for (const item of filteredTopLevel) {
      map.set(item.href, item)
    }
    for (const section of filteredSections) {
      for (const item of section.items) {
        map.set(item.href, item)
      }
    }
    return map
  }, [filteredTopLevel, filteredSections])

  const [activeId, setActiveId] = useState<string | null>(null)
  const activeEntry = activeId
    ? activeId.startsWith('section:')
      ? activeId
      : activeId.startsWith('top:')
        ? itemMap.get(activeId.slice(4))
        : itemMap.get(activeId)
    : null

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    // 250ms es el delay recomendado por dnd-kit para touch: evita drags
    // accidentales al scrollear y reduce la probabilidad de que el browser
    // dispare el menú contextual de long-press.
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const announcements = useMemo(
    () => ({
      onDragStart({ active }: { active: { id: string | number } }) {
        return `Moviendo ${String(active.id)}`
      },
      onDragOver({ active, over }: { active: { id: string | number }; over?: { id: string | number } | null }) {
        return over ? `Moviendo ${String(active.id)} sobre ${String(over.id)}` : `Moviendo ${String(active.id)}`
      },
      onDragEnd({ active, over }: { active: { id: string | number }; over?: { id: string | number } | null }) {
        return over ? `${String(active.id)} movido a ${String(over.id)}` : `${String(active.id)} movido`
      },
      onDragCancel({ active }: { active: { id: string | number } }) {
        return `Movimiento cancelado para ${String(active.id)}`
      },
    }),
    []
  )

  function handleDragStart(event: DragEndEvent) {
    setActiveId(String(event.active.id))
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null)
    const { active, over } = event
    if (!over) return
    const activeId = String(active.id)
    const overId = String(over.id)
    if (activeId === overId) return

    const oldIndex = order.indexOf(activeId)
    const newIndex = order.indexOf(overId)
    if (oldIndex === -1 || newIndex === -1) return

    const activeIsSection = activeId.startsWith('section:')
    const overIsSection = overId.startsWith('section:')

    // Sección solo se reordena sobre otra sección.
    if (activeIsSection && !overIsSection) return

    // Item solo se reordena dentro de su mismo grupo (top-level o sección).
    if (!activeIsSection) {
      const activeSection = itemSectionMap.get(activeId.startsWith('top:') ? activeId.slice(4) : activeId)
      const predictedOrder = arrayMove(order, oldIndex, newIndex)
      const activeNewIndex = predictedOrder.indexOf(activeId)
      let predictedSection: string | null = null
      for (let i = activeNewIndex; i >= 0; i--) {
        const id = predictedOrder[i]
        if (id.startsWith('section:')) {
          predictedSection = id.slice(8)
          break
        }
      }

      if (activeSection === '__top__') {
        // Top-level items deben permanecer arriba de todas las secciones.
        if (predictedSection !== null) return
      } else if (activeSection !== undefined) {
        // Items de sección deben permanecer dentro de su sección.
        if (predictedSection !== activeSection) return
      }
    }

    setMenuOrder(effectiveUserId, arrayMove(order, oldIndex, newIndex))
  }

  function handleReset() {
    resetMenuOrder(effectiveUserId)
  }

  // Visibilidad derivada del breakpoint
  const isVisible = isDesktop ? !desktopCollapsed : mobileDrawerOpen
  const isInteractive = isDesktop ? !desktopCollapsed : mobileDrawerOpen

  const showAside = isDesktop || mobileDrawerOpen

  const asideWidth = isDesktop
    ? desktopCollapsed
      ? 'w-0 overflow-hidden'
      : 'w-64'
    : 'w-64'

  return (
    <>
      {/* Scrim: solo en móvil cuando el drawer está abierto */}
      {!isDesktop && mobileDrawerOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30"
          onClick={() => setMobileDrawerOpen(false)}
          aria-hidden="true"
        />
      )}
      {showAside && (
      <aside
        aria-label="Navegación principal"
        inert={isInteractive ? undefined : true}
        aria-hidden={!isVisible}
        className={`fixed top-14 left-0 h-[calc(100dvh-3.5rem)] bg-white shadow-lg transition-[width,transform] duration-300 z-40 flex flex-col pb-safe ${asideWidth}`}
      >
        <CajaBaseHeader />

        {menuEditing && (
          <div className="px-4 py-2 border-b border-gray-200 flex items-center justify-between bg-gray-50">
            <span className="text-xs font-medium text-gray-500">Editando menú</span>
            <button
              onClick={handleReset}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium"
              type="button"
            >
              Restablecer
            </button>
          </div>
        )}

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          accessibility={{ announcements }}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <nav className="flex-1 overflow-y-auto py-2">
            <SortableContext items={order} strategy={verticalListSortingStrategy}>
              {order.map((id) => {
                if (id.startsWith('section:')) {
                  const title = id.slice(8)
                  return (
                    <SortableNavSectionHeader
                      key={id}
                      title={title}
                      editing={menuEditing}
                    />
                  )
                }
                if (id.startsWith('top:')) {
                  const item = itemMap.get(id.slice(4))
                  if (!item) return null
                  return (
                    <SortableNavItem
                      key={id}
                      item={item}
                      editing={menuEditing}
                      isTopLevel
                    />
                  )
                }
                const item = itemMap.get(id)
                if (!item) return null
                return (
                  <SortableNavItem
                    key={id}
                    item={item}
                    editing={menuEditing}
                  />
                )
              })}
            </SortableContext>
          </nav>
          <DragOverlay dropAnimation={{ duration: 150, easing: 'ease-out' }}>
            {activeEntry ? (
              typeof activeEntry === 'string' ? (
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-2 flex items-center gap-2 bg-white shadow-lg rounded-lg">
                  <DragHandle />
                  {activeEntry.slice(8)}
                </h3>
              ) : (
                <div className="bg-white shadow-lg rounded-lg opacity-90">
                  <SidebarMenuItem item={activeEntry} dragHandle={<DragHandle />} />
                </div>
              )
            ) : null}
          </DragOverlay>
        </DndContext>

        <div className="p-4 border-t space-y-4">
          <div>
            <div className="flex items-center gap-2 mb-2 px-4">
              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                />
              </svg>
              <span className="text-sm font-medium text-gray-700">Notificaciones</span>
            </div>
            <div className="px-4">
              <PushSettings />
            </div>
          </div>
          <button
            onClick={async () => {
              await revokeSessionOnLogout()
              await unsubscribePushOnLogout()
              await purgeSWCache()
              signOut({ callbackUrl: '/login' })
            }}
            className="flex items-center gap-3 px-4 py-3 rounded-lg text-red-600 hover:bg-red-50 transition w-full"
            aria-label="Cerrar sesión"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            <span>Cerrar Sesión</span>
          </button>
        </div>
      </aside>
      )}
    </>
  )
}

export function MainContent({ children }: { children: React.ReactNode }) {
  // FIX Fase 4 §6.4: el margen izquierdo del main content SOLO aplica
  // en desktop (md:) y solo cuando el sidebar está expandido. En móvil,
  // el sidebar es un overlay, no empuja el contenido.
  const isDesktop = useIsDesktop()
  const desktopCollapsed = useAppStore((s) => s.desktopCollapsed)
  const shouldOffset = isDesktop && !desktopCollapsed
  return (
    <main className={`pt-14 print:pt-0 transition-all duration-300 ${shouldOffset ? 'md:ml-64 print:ml-0' : 'md:ml-0'}`}>
      <div className="p-6 print:p-0">{children}</div>
    </main>
  )
}
