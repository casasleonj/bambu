import type { Page } from '@playwright/test'

/**
 * Configura el permiso antes del lazy initializer de usePushSubscription.
 * El headless shell de CI devuelve `denied` incluso con grantPermissions;
 * esas APIs no permiten representar el estado `default` del aviso (#567).
 * Solo simula la lectura del permiso, no una suscripción ni entrega push.
 */
export async function stubNotificationPermission(page: Page, permission: NotificationPermission) {
  await page.addInitScript((perm) => {
    if (typeof window.Notification === 'undefined') {
      // @ts-expect-error - stub mínimo para navegadores/entornos sin Notification
      window.Notification = function Notification() {}
    }
    Object.defineProperty(window.Notification, 'permission', {
      value: perm,
      configurable: true,
    })
  }, permission)
}
