import { getSupabaseAdmin } from './supabase'
import { logger } from './logger'

const BUCKET_NAME = 'fotos-entrega'

/**
 * Upload a base64 image to Supabase Storage.
 * Returns the public URL or null if upload fails.
 */
export async function uploadBase64Foto(
  base64Data: string,
  fileName: string
): Promise<string | null> {
  try {
    const supabase = getSupabaseAdmin()

    // Ensure bucket exists
    const { data: buckets } = await supabase.storage.listBuckets()
    const exists = buckets?.some(b => b.name === BUCKET_NAME)
    if (!exists) {
      await supabase.storage.createBucket(BUCKET_NAME, {
        public: true,
        fileSizeLimit: 5242880, // 5MB
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
      })
    }

    // Strip base64 prefix if present
    const base64String = base64Data.includes(',')
      ? base64Data.split(',')[1]
      : base64Data

    const buffer = Buffer.from(base64String, 'base64')
    const contentType = base64Data.includes('image/png')
      ? 'image/png'
      : base64Data.includes('image/webp')
        ? 'image/webp'
        : 'image/jpeg'

    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(fileName, buffer, {
        contentType,
        upsert: true,
      })

    if (error) {
      logger.error({ err: error.message, fileName }, 'Error uploading foto to Supabase')
      return null
    }

    const { data: publicUrlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(fileName)

    return publicUrlData.publicUrl
  } catch (e) {
    logger.error({ err: e instanceof Error ? e.message : 'Unknown', fileName }, 'Exception uploading foto')
    return null
  }
}

/**
 * Check if a string looks like a base64 image data URI.
 */
export function isBase64Image(str: string): boolean {
  return typeof str === 'string' && str.startsWith('data:image/')
}
