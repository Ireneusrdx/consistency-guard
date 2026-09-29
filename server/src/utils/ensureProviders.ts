import { prisma } from '../db';
import { PROVIDERS, MODEL_CATALOG } from '../providers/registry';

/** Idempotently seeds the AIProvider + AIModel catalog rows. */
export async function ensureProviders(): Promise<void> {
  for (const p of PROVIDERS) {
    await prisma.aIProvider.upsert({
      where: { key: p.id },
      update: { displayName: p.displayName, docsUrl: p.docsUrl, isActive: true },
      create: { key: p.id, displayName: p.displayName, docsUrl: p.docsUrl, isActive: true },
    });
  }
  for (const m of MODEL_CATALOG) {
    const provider = await prisma.aIProvider.findUnique({ where: { key: m.providerId } });
    if (!provider) continue;
    await prisma.aIModel.upsert({
      where: { providerId_modelKey: { providerId: provider.id, modelKey: m.modelKey } },
      update: {
        displayName: m.displayName,
        contextLength: m.contextLength,
        costPer1kInputUsd: m.costPer1kInputUsd,
        costPer1kOutputUsd: m.costPer1kOutputUsd,
        speed: m.speed,
        isActive: true,
      },
      create: {
        providerId: provider.id,
        modelKey: m.modelKey,
        displayName: m.displayName,
        contextLength: m.contextLength,
        costPer1kInputUsd: m.costPer1kInputUsd,
        costPer1kOutputUsd: m.costPer1kOutputUsd,
        speed: m.speed,
        isActive: true,
      },
    });
  }
}
