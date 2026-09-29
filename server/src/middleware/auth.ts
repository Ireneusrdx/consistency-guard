import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../db';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  sessionId: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

interface JwtPayload {
  sub: string;
  sid: string;
  email: string;
}

/** Verifies the Bearer JWT, checks the DB session is live, attaches req.user. */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.headers.authorization;
    const token = header && header.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) {
      res.status(401).json({ error: 'Authentication required. Please sign in.' });
      return;
    }
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      res.status(500).json({ error: 'Server misconfigured: JWT_SECRET is not set.' });
      return;
    }
    let payload: JwtPayload;
    try {
      payload = jwt.verify(token, secret) as JwtPayload;
    } catch {
      res.status(401).json({ error: 'Invalid or expired token. Please sign in again.' });
      return;
    }
    const session = await prisma.session.findUnique({ where: { id: payload.sid } });
    if (!session || session.revoked || session.expiresAt < new Date() || session.userId !== payload.sub) {
      res.status(401).json({ error: 'Session expired. Please sign in again.' });
      return;
    }
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) {
      res.status(401).json({ error: 'Account no longer exists.' });
      return;
    }
    req.user = { id: user.id, email: user.email, name: user.name, sessionId: session.id };
    next();
  } catch {
    res.status(401).json({ error: 'Authentication failed.' });
  }
}
