import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../db';
import { requireAuth } from '../middleware/auth';
import { encryptApiKey, decryptApiKey, maskApiKey } from '../utils/crypto';
import {
  PROVIDERS,
  MODEL_CATALOG,
  getProviderDefinition,
  resolveProvider,
  validateKeyFormat,
  type ProviderDefinition,
} from '../providers/registry';
import { getPollinationsTextModels, type PollinationsTextModel } from '../providers/pollinations';
import { fetchLiveModels, type LiveModel } from '../providers/liveModels';
import { ProviderError } from '../providers/types';

const router = Router();
router.use(requireAuth);

// Each test fires a real outbound provider call billed to the user's key —
// throttle per user so the endpoint can't be used as a probe amplifier.
const providerTestLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many connection tests. Please wait a minute and try again.' },
});

interface ProviderModelView {
  modelKey: string;
  displayName: string;
  contextLength?: number;
  costPer1kInputUsd?: number;
  costPer1kOutputUsd?: number;
  speed: 'fast' | 'medium' | 'slow';
}

/**
 * Models for a provider, in catalog order.
 * Pollinations serves its live registry catalog (cached server-side);
 * every other provider uses the static catalog.
 */
async function modelsForProvider(p: ProviderDefinition): Promise<ProviderModelView[]> {
  if (p.id === 'pollinations') {
    try {
      const live: PollinationsTextModel[] = await getPollinationsTextModels();
      return live.map((m) => ({
        modelKey: m.modelKey,
        displayName: m.displayName,
        contextLength: m.contextLength,
        speed: m.speed,
      }));
    } catch {
      // fall through to the static catalog below
    }
  }
  return MODEL_CATALOG.filter((m) => m.providerId === p.id).map((m) => ({
    modelKey: m.modelKey,
    displayName: m.displayName,
    contextLength: m.contextLength,
    costPer1kInputUsd: m.costPer1kInputUsd,
    costPer1kOutputUsd: m.costPer1kOutputUsd,
    speed: m.speed,
  }));
}

/**
 * GET /api/providers
 * Provider catalog with models + the current user's credential status.
 * Returns an array matching the client's Provider shape.
 * Encrypted keys are NEVER returned — only masked hints + status.
 */
router.get('/', async (req: Request, res: Response) => {
  const creds = await prisma.userApiCredential.findMany({
    where: { userId: req.user!.id },
    include: { provider: true },
  });
  const credByProvider = new Map(creds.map((c) => [c.provider.key, c]));

  const providers = await Promise.all(
    PROVIDERS.map(async (p) => {
      const cred = credByProvider.get(p.id);
      let models = await modelsForProvider(p);
      // When the user has an API key for this company, show ALL of its models
      // (fetched live with their key) instead of the small predefined list.
      // The key is decrypted server-side and only used for the list call.
      if (cred?.isActive) {
        try {
          const apiKey = decryptApiKey(cred.encryptedKey);
          const live: LiveModel[] | null = await fetchLiveModels(p.id, apiKey, req.user!.id);
          if (live && live.length > 0) {
            models = live.map((m) => ({
              modelKey: m.modelKey,
              displayName: m.displayName,
              contextLength: m.contextLength,
              costPer1kInputUsd: undefined,
              costPer1kOutputUsd: undefined,
              speed: m.speed,
            }));
          }
        } catch {
          // Fall through to the static catalog on any failure.
        }
      }
      return {
        id: p.id,
        name: p.displayName,
        description: p.description,
        docsUrl: p.docsUrl,
        keyHint: p.keyHint,
        connected: !!cred?.isActive,
        maskedKey: cred ? cred.keyHint : null,
        lastTestedAt: cred?.lastTestedAt ?? null,
        lastTestStatus: cred?.lastTestStatus ?? null,
        lastTestError: cred?.lastTestError ?? null,
        // Free-tier gateway affordances for the setup UI.
        ...(p.id === 'pollinations'
          ? { freeTier: true, signupUrl: 'https://enter.pollinations.ai' }
          : {}),
        models: models.map((m) => ({
          id: m.modelKey,
          providerId: p.id,
          providerName: p.displayName,
          displayName: m.displayName,
          contextLength: m.contextLength ?? null,
          estCostPer1k: m.costPer1kInputUsd ?? m.costPer1kOutputUsd ?? null,
          speed: m.speed,
          available: true,
        })),
      };
    }),
  );
  return res.json(providers);
});

const credentialsSchema = z.object({
  apiKey: z.string().trim().min(8, 'API key must be at least 8 characters.'),
});

/**
 * POST /api/providers/:id/credentials — encrypt + store (upsert).
 * The plaintext key is encrypted server-side immediately and never stored
 * or returned in plain form.
 */
router.post('/:id/credentials', async (req: Request, res: Response) => {
  const providerId = req.params.id;
  const def = getProviderDefinition(providerId);
  if (!def) return res.status(404).json({ error: `Unknown provider "${providerId}".` });

  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation failed.', details: parsed.error.flatten().fieldErrors });
  }
  const apiKey = parsed.data.apiKey.trim();

  const formatIssue = validateKeyFormat(providerId, apiKey);
  if (formatIssue) {
    return res.status(400).json({ error: formatIssue });
  }

  const providerRow = await prisma.aIProvider.findUnique({ where: { key: providerId } });
  if (!providerRow) return res.status(404).json({ error: 'Provider not registered.' });

  const encrypted = encryptApiKey(apiKey); // plaintext exists only in this scope
  const keyHint = maskApiKey(apiKey);

  const cred = await prisma.userApiCredential.upsert({
    where: { userId_providerId: { userId: req.user!.id, providerId: providerRow.id } },
    update: { encryptedKey: encrypted, keyHint, isActive: true, lastTestStatus: null, lastTestError: null },
    create: {
      userId: req.user!.id,
      providerId: providerRow.id,
      encryptedKey: encrypted,
      keyHint,
      isActive: true,
    },
  });

  return res.status(201).json({
    ok: true,
    providerId,
    maskedKey: cred.keyHint,
    message: 'Credential stored securely (encrypted at rest).',
  });
});

router.delete('/:id/credentials', async (req: Request, res: Response) => {
  const providerId = req.params.id;
  const providerRow = await prisma.aIProvider.findUnique({ where: { key: providerId } });
  if (!providerRow) return res.status(404).json({ error: `Unknown provider "${providerId}".` });
  await prisma.userApiCredential.deleteMany({
    where: { userId: req.user!.id, providerId: providerRow.id },
  });
  return res.json({ ok: true });
});

/**
 * POST /api/providers/:id/test — decrypts server-side, makes one tiny
 * probe call, and reports ok/failed. The key never leaves the server.
 */
router.post('/:id/test', providerTestLimiter, async (req: Request, res: Response) => {
  const providerId = req.params.id;
  const def = getProviderDefinition(providerId);
  if (!def) return res.status(404).json({ error: `Unknown provider "${providerId}".` });

  const providerRow = await prisma.aIProvider.findUnique({ where: { key: providerId } });
  const cred = providerRow
    ? await prisma.userApiCredential.findUnique({
        where: { userId_providerId: { userId: req.user!.id, providerId: providerRow.id } },
      })
    : null;
  if (!cred?.isActive) {
    return res.status(404).json({ error: `No credential stored for ${def.displayName}. Add one first.` });
  }

  let apiKey: string;
  try {
    apiKey = decryptApiKey(cred.encryptedKey);
  } catch {
    await prisma.userApiCredential.update({
      where: { id: cred.id },
      data: { lastTestedAt: new Date(), lastTestStatus: 'failed', lastTestError: 'Stored credential could not be decrypted.' },
    });
    return res.status(500).json({ ok: false, error: 'Stored credential could not be decrypted. Please re-enter it.' });
  }

  const model = MODEL_CATALOG.find((m) => m.providerId === providerId)?.modelKey ?? 'default';
  const provider = resolveProvider(providerId, apiKey);
  const started = Date.now();
  try {
    await provider.generateResponse({
      prompt: 'Reply with exactly: OK',
      model,
      maxTokens: 16,
      temperature: 0,
    });
    const latencyMs = Date.now() - started;
    await prisma.userApiCredential.update({
      where: { id: cred.id },
      data: { lastTestedAt: new Date(), lastTestStatus: 'ok', lastTestError: null },
    });
    return res.json({ ok: true, providerId, latencyMs, model });
  } catch (err) {
    const message = err instanceof ProviderError ? err.message : 'Connection test failed.';
    await prisma.userApiCredential.update({
      where: { id: cred.id },
      data: { lastTestedAt: new Date(), lastTestStatus: 'failed', lastTestError: message.slice(0, 500) },
    });
    return res.status(200).json({ ok: false, providerId, error: message });
  }
});

export default router;
