-- AlterEnum
-- Add new role values to RolUsuario enum
-- These MUST be in separate transactions (PostgreSQL 12+ restriction)
-- See: https://github.com/prisma/prisma/issues/8424

ALTER TYPE "RolUsuario" ADD VALUE IF NOT EXISTS 'EMPACADOR';

ALTER TYPE "RolUsuario" ADD VALUE IF NOT EXISTS 'ENTUBADOR';
