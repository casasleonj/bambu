'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { NotificationEventType, NotificationEventMeta } from '@/lib/notifications/event-types'

const SELECTABLE_ROLES = ['ADMIN', 'ASISTENTE', 'CONTADOR'] as const
type SelectableRole = (typeof SELECTABLE_ROLES)[number]

const ROLE_LABELS: Record<SelectableRole, string> = {
  ADMIN: 'Admin',
  ASISTENTE: 'Asistente',
  CONTADOR: 'Contador',
}

interface UsuarioOption {
  id: string
  username: string
  nombre: string
  apellido: string
  rol: string
}

interface NotificationRuleDTO {
  eventType: NotificationEventType
  enabled: boolean
  roles: string[]
  targetUsers: { userId: string }[]
}

interface RuleFormState {
  eventType: NotificationEventType
  enabled: boolean
  roles: SelectableRole[]
  targetUserIds: string[]
}

interface AdminNotificacionesClientProps {
  initialRules: NotificationRuleDTO[]
  usuarios: UsuarioOption[]
  eventMeta: Record<NotificationEventType, NotificationEventMeta>
}

function buildInitialState(
  eventMeta: Record<NotificationEventType, NotificationEventMeta>,
  initialRules: NotificationRuleDTO[],
): Record<NotificationEventType, RuleFormState> {
  const byEventType = new Map(initialRules.map((r) => [r.eventType, r]))
  const result = {} as Record<NotificationEventType, RuleFormState>

  for (const eventType of Object.keys(eventMeta) as NotificationEventType[]) {
    const existing = byEventType.get(eventType)
    result[eventType] = {
      eventType,
      enabled: existing?.enabled ?? true,
      roles: (existing?.roles.filter((r): r is SelectableRole =>
        SELECTABLE_ROLES.includes(r as SelectableRole),
      ) ?? []) as SelectableRole[],
      targetUserIds: existing?.targetUsers.map((t) => t.userId) ?? [],
    }
  }
  return result
}

export default function AdminNotificacionesClient({
  initialRules,
  usuarios,
  eventMeta,
}: AdminNotificacionesClientProps) {
  const [rules, setRules] = useState(() => buildInitialState(eventMeta, initialRules))
  const [saving, setSaving] = useState(false)

  const grupos = useMemo(() => {
    const orden: NotificationEventMeta['group'][] = [
      'Clientes',
      'Pedidos',
      'Cierre',
      'Gastos/Compras',
      'Antifraude',
    ]
    return orden.map((grupo) => ({
      grupo,
      eventTypes: (Object.keys(eventMeta) as NotificationEventType[]).filter(
        (et) => eventMeta[et].group === grupo,
      ),
    }))
  }, [eventMeta])

  function toggleEnabled(eventType: NotificationEventType) {
    setRules((prev) => ({
      ...prev,
      [eventType]: { ...prev[eventType], enabled: !prev[eventType].enabled },
    }))
  }

  function toggleRole(eventType: NotificationEventType, role: SelectableRole) {
    setRules((prev) => {
      const current = prev[eventType]
      const roles = current.roles.includes(role)
        ? current.roles.filter((r) => r !== role)
        : [...current.roles, role]
      return { ...prev, [eventType]: { ...current, roles } }
    })
  }

  function toggleUser(eventType: NotificationEventType, userId: string) {
    setRules((prev) => {
      const current = prev[eventType]
      const targetUserIds = current.targetUserIds.includes(userId)
        ? current.targetUserIds.filter((id) => id !== userId)
        : [...current.targetUserIds, userId]
      return { ...prev, [eventType]: { ...current, targetUserIds } }
    })
  }

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch('/api/notification-rules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rules: Object.values(rules) }),
      })
      if (!res.ok) {
        toast.error('No se pudieron guardar las reglas de notificación')
        return
      }
      toast.success('Reglas de notificación guardadas')
    } catch {
      toast.error('Error de conexión al guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold">Notificaciones</h1>
        <p className="text-sm text-gray-500 mt-1">
          Elegí, por cada tipo de evento, qué roles y/o qué personas específicas reciben el aviso push.
        </p>
      </div>

      {grupos.map(({ grupo, eventTypes }) => (
        <Card key={grupo}>
          <CardContent className="p-4 sm:p-6 space-y-4">
            <h2 className="text-sm font-semibold text-gray-700">{grupo}</h2>
            {eventTypes.map((eventType) => {
              const meta = eventMeta[eventType]
              const state = rules[eventType]
              return (
                <div
                  key={eventType}
                  data-testid={`notification-rule-${eventType}`}
                  className="border rounded-lg p-3 space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{meta.label}</p>
                      <p className="text-xs text-gray-500">{meta.description}</p>
                    </div>
                    <label className="flex items-center gap-2 text-xs text-gray-600 shrink-0">
                      <input
                        type="checkbox"
                        checked={state.enabled}
                        onChange={() => toggleEnabled(eventType)}
                        data-testid={`toggle-enabled-${eventType}`}
                      />
                      Activo
                    </label>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    {SELECTABLE_ROLES.map((role) => (
                      <label key={role} className="flex items-center gap-1.5 text-xs text-gray-700">
                        <input
                          type="checkbox"
                          checked={state.roles.includes(role)}
                          onChange={() => toggleRole(eventType, role)}
                          data-testid={`role-${role}-${eventType}`}
                        />
                        {ROLE_LABELS[role]}
                      </label>
                    ))}
                  </div>

                  {usuarios.length > 0 && (
                    <div className="pt-1">
                      <p className="text-[11px] text-gray-500 mb-1.5">Personas específicas</p>
                      <div className="flex flex-wrap gap-3">
                        {usuarios.map((u) => (
                          <label key={u.id} className="flex items-center gap-1.5 text-xs text-gray-700">
                            <input
                              type="checkbox"
                              checked={state.targetUserIds.includes(u.id)}
                              onChange={() => toggleUser(eventType, u.id)}
                              data-testid={`user-${u.id}-${eventType}`}
                            />
                            {u.nombre || u.username}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </CardContent>
        </Card>
      ))}

      <div className="flex justify-end">
        <Button type="button" onClick={handleSave} disabled={saving} data-testid="btn-guardar-notificaciones">
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </Button>
      </div>
    </div>
  )
}
