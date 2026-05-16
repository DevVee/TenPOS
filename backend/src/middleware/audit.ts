import { Request, Response, NextFunction } from 'express';
import { query } from '../config/database';

type Severity = 'low' | 'medium' | 'high' | 'critical';

export async function logAudit(
  req: Request,
  action: string,
  details: Record<string, unknown>,
  severity: Severity = 'low'
): Promise<void> {
  try {
    await query(
      `INSERT INTO audit_log (action, user_id, user_name, user_role, details, ip, severity)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        action,
        req.user?.id ?? null,
        req.user?.name ?? 'system',
        req.user?.role ?? null,
        JSON.stringify(details),
        req.ip ?? req.socket.remoteAddress,
        severity,
      ]
    );
  } catch (err) {
    console.error('Audit log write failed:', err);
  }
}

export function auditMiddleware(action: string, severity: Severity = 'low') {
  return (_req: Request, _res: Response, next: NextFunction): void => {
    next();
  };
}
