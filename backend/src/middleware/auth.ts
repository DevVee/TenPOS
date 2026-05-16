import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { queryOne } from '../config/database';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'manager' | 'cashier' | 'viewer';
  branch_id: string | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as AuthUser & { iat: number; exp: number };
    req.user = {
      id: payload.id,
      email: payload.email,
      name: payload.name,
      role: payload.role,
      branch_id: payload.branch_id,
    };
    next();
  } catch {
    res.status(401).json({ error: 'Token expired or invalid' });
  }
}

export async function authenticateWithDB(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as AuthUser & { iat: number; exp: number };
    const user = await queryOne<AuthUser>(
      'SELECT id, email, name, role, branch_id FROM users WHERE id = $1 AND status = $2',
      [payload.id, 'active']
    );
    if (!user) {
      res.status(401).json({ error: 'User not found or deactivated' });
      return;
    }
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Token expired or invalid' });
  }
}
