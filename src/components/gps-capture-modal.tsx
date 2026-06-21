'use client'

import { useEffect, useState, useCallback } from 'react'
import { Modal } from '@/components/modal'
import { Button } from '@/components/ui/button'
import { useGpsCapture } from '@/hooks/use-gps-capture'
import {
  type GPSCoordinates,
  haversineKm,
  isWithinDeliveryRadius,
} from '@/lib/gps'

interface GpsCaptureModalProps {
  open: boolean
  onClose: () => void
  onConfirm: (coords: GPSCoordinates | null, justificacion?: string) => void
  clienteCoords?: GPSCoordinates
  clienteName?: string
  deliveryRadiusMeters?: number
}

export function GpsCaptureModal({
  open,
  onClose,
  onConfirm,
  clienteCoords,
  clienteName,
  deliveryRadiusMeters,
}: GpsCaptureModalProps) {
  const { coordinates, error, loading, capture, reset } = useGpsCapture()
  const [justificacion, setJustificacion] = useState('')

  useEffect(() => {
    if (open) {
      setJustificacion('')
      capture()
    } else {
      reset()
      setJustificacion('')
    }
  }, [open])

  const handleConfirm = useCallback(() => {
    onConfirm(coordinates, justificacion || undefined)
    onClose()
  }, [coordinates, justificacion, onConfirm, onClose])

  const inRange =
    coordinates && clienteCoords
      ? isWithinDeliveryRadius(coordinates, clienteCoords, deliveryRadiusMeters)
      : null

  const distanceMeters =
    coordinates && clienteCoords
      ? Math.round(haversineKm(coordinates, clienteCoords) * 1000)
      : null

  const requiresJustification =
    loading === false && (error !== null || inRange === false)

  const canConfirm = !loading && (!requiresJustification || justificacion.trim().length > 0)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Confirmar ubicación GPS"
      description="Captura la ubicación para validar la entrega"
    >
      <div className="space-y-4">
        <div className="text-sm text-gray-700">
          {clienteName ? (
            <p>Cliente: <span className="font-medium">{clienteName}</span></p>
          ) : null}
          {clienteCoords && (
            <p className="text-xs text-gray-500 mt-1">
              Ubicación registrada: {clienteCoords.lat.toFixed(6)}, {clienteCoords.lng.toFixed(6)}
            </p>
          )}
        </div>

        {loading && (
          <div className="flex items-center gap-3 text-sm text-gray-600">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
            Obteniendo ubicación GPS...
          </div>
        )}

        {!loading && coordinates && (
          <div className="rounded-lg bg-green-50 p-3 text-sm text-green-800">
            <p className="font-medium">GPS capturado</p>
            <p className="text-xs mt-1">
              Lat: {coordinates.lat.toFixed(6)}, Lng: {coordinates.lng.toFixed(6)}
              {coordinates.accuracy ? ` (precisión ±${Math.round(coordinates.accuracy)}m)` : null}
            </p>
            {distanceMeters !== null && clienteCoords && (
              <p className="text-xs mt-1">
                Distancia al cliente: {distanceMeters}m
                {inRange === true && ' (dentro del radio)'}
                {inRange === false && ' (fuera del radio)'}
              </p>
            )}
          </div>
        )}

        {!loading && error && (
          <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            <p className="font-medium">No se pudo obtener el GPS</p>
            <p className="text-xs mt-1">{error.message}</p>
          </div>
        )}

        {!loading && inRange === false && (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
            <p className="font-medium">Ubicación fuera del radio de entrega</p>
            <p className="text-xs mt-1">
              Estás a {distanceMeters}m del cliente. Para continuar, escribe una justificación.
            </p>
          </div>
        )}

        {requiresJustification && (
          <div className="space-y-2">
            <label htmlFor="gps-justificacion" className="block text-sm font-medium text-gray-700">
              Justificación <span className="text-red-500">*</span>
            </label>
            <textarea
              id="gps-justificacion"
              rows={3}
              className="w-full rounded-md border border-gray-300 p-3 text-sm focus:border-blue-500 focus:outline-none"
              placeholder="Ej: el cliente no tiene señal GPS, la dirección es en zona rural sin cobertura, etc."
              value={justificacion}
              onChange={(e) => setJustificacion(e.target.value)}
              data-testid="gps-justificacion"
            />
            {justificacion.trim().length === 0 && (
              <p className="text-xs text-red-600">La justificación es obligatoria para continuar.</p>
            )}
          </div>
        )}

        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onClose} type="button">
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!canConfirm}
            type="button"
            data-testid="gps-confirmar"
          >
            Confirmar
          </Button>
        </div>
      </div>
    </Modal>
  )
}
