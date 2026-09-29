import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../db';
import { requireAuth } from '../middleware/auth';

const router = Router();

const PASSWORD_SCHEMA = z
  .string()
  .min(8, 'Password must be at least 8 characters.')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter.')
  .regex(/[a-z]/, 'Password must contain a lowercase letter.')
  .regex(/[0-9]/, 'Password must contain a number.')
  .regex(/[^A-Za-z0-9]/, 'Password must contain a special character.');

const registerSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(100),
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  password: PASSWORD_SCHEMA,
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: 'Passwords do not match.',
  path: ['confirmPassword'],
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  password: z.string().min(1, 'Password is required.'),
  rememberMe: z.boolean().optional(),
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Please wait 15 minutes and try again.' },
});

// Registration is expensive (bcrypt-12 + several writes) and unauthenticated:
// cap it tightly to block mass-registration / CPU-amplification scripts.
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many accounts created from this network. Please try again later.' },
});

// Password-reset endpoints must stay throttled even before an email transport
// exists — otherwise /forgot-password becomes an email-bombing vector and
// /reset-password an unlimited token-guessing oracle once email is wired up.
const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many password reset attempts. Please wait 15 minutes and try again.' },
});

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

function signToken(userId: string, sessionId: string, email: string, rememberMe: boolean): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not configured.');
  return jwt.sign({ sub: userId, sid: sessionId, email }, secret, {
    expiresIn: rememberMe ? '30d' : '7d',
  });
}

async function createSession(userId: string, req: Request, rememberMe: boolean) {
  const expiresAt = new Date(Date.now() + (rememberMe ? 30 : 7) * 24 * 60 * 60 * 1000);
  const session = await prisma.session.create({
    data: {
      userId,
      expiresAt,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']?.slice(0, 300),
    },
  });
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const token = signToken(userId, session.id, user.email, rememberMe);
  return { session, token };
}

function publicUser(user: { id: string; name: string; email: string; createdAt: Date }) {
  return { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt };
}

router.post('/register', registerLimiter, async (req: Request, res: Response) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation failed.', details: parsed.error.flatten().fieldErrors });
  }
  const { name, email, password } = parsed.data;
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists.' });
  }
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({ data: { name, email, passwordHash } });
  await prisma.userPreference.create({ data: { userId: user.id } });
  const { token } = await createSession(user.id, req, false);
  await prisma.history.create({
    data: { userId: user.id, action: 'auth.register', entityType: 'user', entityId: user.id },
  });
  return res.status(201).json({ token, user: publicUser(user) });
});

router.post('/login', loginLimiter, async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation failed.', details: parsed.error.flatten().fieldErrors });
  }
  const { email, password, rememberMe } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });

  // Uniform timing + message to avoid user enumeration.
  const invalid = async () => {
    await bcrypt.compare(password, '$2a$12$invalidinvalidinvalidinvalidinvalidinval');
    return res.status(401).json({ error: 'Invalid email or password.' });
  };
  if (!user) return invalid();

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const mins = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
    return res.status(423).json({ error: `Account locked after too many failed attempts. Try again in ~${mins} minute(s).` });
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    const failed = user.failedLoginAttempts + 1;
    const lockedUntil = failed >= MAX_FAILED_ATTEMPTS ? new Date(Date.now() + LOCKOUT_MS) : null;
    await prisma.user.update({ where: { id: user.id }, data: { failedLoginAttempts: failed, lockedUntil } });
    if (lockedUntil) {
      return res.status(423).json({ error: 'Account locked after too many failed attempts. Try again in ~15 minutes.' });
    }
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  await prisma.user.update({ where: { id: user.id }, data: { failedLoginAttempts: 0, lockedUntil: null } });
  const { token } = await createSession(user.id, req, rememberMe ?? false);
  return res.json({ token, user: publicUser(user) });
});

router.post('/logout', requireAuth, async (req: Request, res: Response) => {
  await prisma.session.updateMany({
    where: { id: req.user!.sessionId },
    data: { revoked: true },
  });
  return res.json({ ok: true });
});

router.post('/logout-all', requireAuth, async (req: Request, res: Response) => {
  await prisma.session.updateMany({ where: { userId: req.user!.id }, data: { revoked: true } });
  return res.json({ ok: true });
});

router.get('/me', requireAuth, async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    include: { preferences: true },
  });
  if (!user) return res.status(404).json({ error: 'User not found.' });
  return res.json({
    user: publicUser(user),
    preferences: user.preferences,
  });
});

router.get('/sessions', requireAuth, async (req: Request, res: Response) => {
  const sessions = await prisma.session.findMany({
    where: { userId: req.user!.id, revoked: false, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, createdAt: true, ipAddress: true, userAgent: true, expiresAt: true },
  });
  return res.json({
    sessions: sessions.map((s) => ({ ...s, current: s.id === req.user!.sessionId })),
  });
});

/** Revoke a single session (not the current one). */
router.delete('/sessions/:id', requireAuth, async (req: Request, res: Response) => {
  if (req.params.id === req.user!.sessionId) {
    return res.status(400).json({ error: 'You cannot revoke your current session. Sign out instead.' });
  }
  await prisma.session.updateMany({
    where: { id: req.params.id, userId: req.user!.id },
    data: { revoked: true },
  });
  return res.json({ ok: true });
});

/** Revoke every session except the current one. */
router.delete('/sessions', requireAuth, async (req: Request, res: Response) => {
  await prisma.session.updateMany({
    where: { userId: req.user!.id, id: { not: req.user!.sessionId } },
    data: { revoked: true },
  });
  return res.json({ ok: true });
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: PASSWORD_SCHEMA,
  confirmPassword: z.string(),
}).refine((d) => d.newPassword === d.confirmPassword, {
  message: 'Passwords do not match.',
  path: ['confirmPassword'],
});

router.post('/change-password', requireAuth, async (req: Request, res: Response) => {  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation failed.', details: parsed.error.flatten().fieldErrors });
  }
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  const ok = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Current password is incorrect.' });
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(parsed.data.newPassword, 12) },
  });
  // Revoke all other sessions for safety.
  await prisma.session.updateMany({
    where: { userId: user.id, id: { not: req.user!.sessionId } },
    data: { revoked: true },
  });
  return res.json({ ok: true });
});

// Forgot password — always returns a generic message to avoid user enumeration.
// Dev builds return the short-lived reset token so the flow can be tested
// without email setup; production omits it (wire up an email transport).
router.post('/forgot-password', passwordResetLimiter, async (req: Request, res: Response) => {
  const parsed = z.object({ email: z.string().trim().toLowerCase().email() }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Enter a valid email address.' });
  }
  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  const message = 'If an account exists for this email, a password reset link has been sent.';
  if (!user) return res.json({ message });
  const secret = process.env.JWT_SECRET;
  if (!secret) return res.status(500).json({ error: 'Reset is not configured.' });
  const token = jwt.sign({ sub: user.id, purpose: 'password-reset', email: user.email }, secret, {
    expiresIn: '1h',
  });
  // Never expose the reset token in production — it must travel by email.
  // (No email transport is configured yet, so dev builds return it for testing.)
  if (process.env.NODE_ENV === 'production') {
    return res.json({ message });
  }
  return res.json({ message, resetToken: token });
});

router.post('/reset-password', passwordResetLimiter, async (req: Request, res: Response) => {
  const parsed = z
    .object({
      token: z.string().min(1, 'Reset token is required.'),
      password: PASSWORD_SCHEMA,
    })
    .safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation failed.', details: parsed.error.flatten().fieldErrors });
  }
  const secret = process.env.JWT_SECRET;
  if (!secret) return res.status(500).json({ error: 'Reset is not configured.' });
  try {
    const payload = jwt.verify(parsed.data.token, secret) as { sub: string; purpose: string };
    if (payload.purpose !== 'password-reset' || !payload.sub) {
      return res.status(400).json({ error: 'Invalid or expired reset token.' });
    }
    await prisma.user.update({
      where: { id: payload.sub },
      data: {
        passwordHash: await bcrypt.hash(parsed.data.password, 12),
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });
    await prisma.session.updateMany({ where: { userId: payload.sub }, data: { revoked: true } });
    return res.json({ message: 'Password has been reset. Please sign in.' });
  } catch {
    return res.status(400).json({ error: 'Invalid or expired reset token.' });
  }
});

export default router;
