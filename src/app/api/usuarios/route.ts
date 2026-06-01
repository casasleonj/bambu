// Alias: /api/usuarios → /api/users
// Provides Spanish alias for the English endpoint to match URL conventions elsewhere in the app.
import { GET as usersGET, POST as usersPOST } from '../users/route'

export const GET = usersGET
export const POST = usersPOST
