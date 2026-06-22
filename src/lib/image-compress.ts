/**
 * Comprime una imagen a un data URL base64 JPEG reduciendo dimensiones.
 * Si el browser no soporta canvas/context, devuelve el data URL original.
 */
export async function compressImage(
  file: File,
  options: { maxDimension?: number; quality?: number } = {}
): Promise<string> {
  const { maxDimension = 1280, quality = 0.8 } = options

  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (event) => {
      const originalDataUrl = event.target?.result as string | undefined
      if (!originalDataUrl) {
        reject(new Error('No se pudo leer el archivo'))
        return
      }

      const img = new Image()

      img.onload = () => {
        const scale = Math.min(1, maxDimension / Math.max(img.width, img.height))
        if (scale >= 1) {
          // Imagen ya es menor que el máximo; devolver original.
          resolve(originalDataUrl)
          return
        }

        const width = Math.round(img.width * scale)
        const height = Math.round(img.height * scale)
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height

        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve(originalDataUrl)
          return
        }

        ctx.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }

      img.onerror = () => {
        reject(new Error('No se pudo decodificar la imagen'))
      }

      img.src = originalDataUrl
    }

    reader.onerror = () => {
      reject(new Error('Error leyendo el archivo'))
    }

    reader.readAsDataURL(file)
  })
}
