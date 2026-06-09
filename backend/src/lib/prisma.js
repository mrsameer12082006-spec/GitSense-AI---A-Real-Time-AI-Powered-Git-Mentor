// ─────────────────────────────────────────────────────────────
// Reusable Prisma Client — import this everywhere instead of
// creating new PrismaClient() in every file.
// ─────────────────────────────────────────────────────────────

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default prisma;
