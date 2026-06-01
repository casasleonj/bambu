// Alias: /api/configuracion → /api/config
// Provides Spanish alias for the English endpoint to match URL conventions elsewhere in the app.
import { GET as configGET, POST as configPOST } from '../config/route'

export const GET = configGET
export const POST = configPOST
