import { Request, Response, NextFunction } from 'express';
import { AuthUser } from './auth';

type Role = AuthUser['role'];

const ROLE_HIERARCHY: Record<Role, number> = {
  admin: 4,
  manager: 3,
  cashier: 2,
  viewer: 1,
};

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthenticated' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Insufficient permissions', required: roles });
      return;
    }
    next();
  };
}

export function requireMinRole(minRole: Role) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthenticated' });
      return;
    }
    if (ROLE_HIERARCHY[req.user.role] < ROLE_HIERARCHY[minRole]) {
      res.status(403).json({ error: 'Insufficient permissions', required: minRole });
      return;
    }
    next();
  };
}

export const onlyAdmin = requireRole('admin');
export const managerOrAbove = requireMinRole('manager');
export const cashierOrAbove = requireMinRole('cashier');
export const anyRole = requireMinRole('viewer');
