/** Activar solo después de migración, permisos y verificación del despliegue. */
export const exigiblesActivos = () => process.env.FIADO_ENTREGA_PARCIAL === 'true'
