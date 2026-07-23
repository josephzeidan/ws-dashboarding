import { prisma } from '@/lib/prisma'

export async function getKv(key: string): Promise<string | null> {
  const row = await prisma.kV.findUnique({ where: { key } })
  return row?.value ?? null
}

export async function setKv(key: string, value: string): Promise<void> {
  await prisma.kV.upsert({ where: { key }, update: { value }, create: { key, value } })
}
