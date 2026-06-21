'use client'

import { useState, useCallback, useRef } from 'react'
import {
  type GPSCoordinates,
  type GPSError,
  type GPSErrorCode,
  formatGPSError,
} from '@/lib/gps'

export interface UseGpsCaptureResult {
  coordinates: GPSCoordinates | null
  error: GPSError | null
  loading: boolean
  capture: () => Promise<GPSCoordinates | null>
  reset: () => void
}

const MAX_RETRIES = 3
const POSITION_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 10000,
  maximumAge: 0,
}

function mapGeolocationError(err: GeolocationPositionError): GPSErrorCode {
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return 'PERMISSION_DENIED'
    case err.POSITION_UNAVAILABLE:
      return 'POSITION_UNAVAILABLE'
    case err.TIMEOUT:
      return 'TIMEOUT'
    default:
      return 'UNKNOWN'
  }
}

function isRetriable(code: GPSErrorCode): boolean {
  return code === 'TIMEOUT' || code === 'POSITION_UNAVAILABLE'
}

export function useGpsCapture(): UseGpsCaptureResult {
  const [coordinates, setCoordinates] = useState<GPSCoordinates | null>(null)
  const [error, setError] = useState<GPSError | null>(null)
  const [loading, setLoading] = useState(false)
  const abortRef = useRef(false)

  const reset = useCallback(() => {
    abortRef.current = true
    setCoordinates(null)
    setError(null)
    setLoading(false)
  }, [])

  const capture = useCallback(async (): Promise<GPSCoordinates | null> => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      const notSupported: GPSError = {
        code: 'NOT_SUPPORTED',
        message: formatGPSError('NOT_SUPPORTED'),
      }
      setError(notSupported)
      return null
    }

    abortRef.current = false
    setLoading(true)
    setError(null)
    setCoordinates(null)

    // Anticipar el estado del permiso para dar un mensaje claro antes
    // de intentar la captura. Si el navegador no soporta Permissions API,
    // continuamos normalmente.
    try {
      const permission = await navigator.permissions?.query({ name: 'geolocation' as PermissionName })
      if (permission?.state === 'denied') {
        const denied: GPSError = {
          code: 'PERMISSION_DENIED',
          message: formatGPSError('PERMISSION_DENIED'),
        }
        setError(denied)
        setLoading(false)
        return null
      }
    } catch {
      // Permissions API no soportada o rechazada: continuar con getCurrentPosition.
    }

    const attempt = (retryCount: number): Promise<GPSCoordinates | null> => {
      return new Promise((resolve) => {
        if (abortRef.current) {
          setLoading(false)
          resolve(null)
          return
        }

        navigator.geolocation.getCurrentPosition(
          (position) => {
            if (abortRef.current) {
              setLoading(false)
              resolve(null)
              return
            }
            const coords: GPSCoordinates = {
              lat: position.coords.latitude,
              lng: position.coords.longitude,
              accuracy: position.coords.accuracy,
            }
            setCoordinates(coords)
            setLoading(false)
            resolve(coords)
          },
          (err) => {
            if (abortRef.current) {
              setLoading(false)
              resolve(null)
              return
            }

            const code = mapGeolocationError(err)
            if (isRetriable(code) && retryCount < MAX_RETRIES) {
              setTimeout(() => {
                resolve(attempt(retryCount + 1))
              }, 1000)
              return
            }

            const gpsError: GPSError = {
              code,
              message: formatGPSError(code),
            }
            setError(gpsError)
            setLoading(false)
            resolve(null)
          },
          POSITION_OPTIONS,
        )
      })
    }

    return attempt(0)
  }, [])

  return { coordinates, error, loading, capture, reset }
}
