import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { query } from '../config/database';
import { authenticate } from '../middleware/auth';
import { managerOrAbove } from '../middleware/rbac';
import { validate } from '../middleware/validate';

const router = Router();
router.use(authenticate, managerOrAbove);

const AuditQuerySchema = z.object({
  user_id: z.string().uuid().optional(),
  action: z.string().optional(),
  severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

// GET /api/audit
router.get('/', validate(AuditQuerySchema, 'query'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { user_id, action, severity, from, to, page, limit } = req.query as unknown as {
      user_id?: string; action?: string; severity?: string;
      from?: string; to?: string; page: number; limit: number;
    };

    const conditions: string[] = [];
    const params: unknown[] = [];
    let pi = 1;

    if (user_id) { conditions.push(`a.user_id = $${pi++}`); params.push(user_id); }
    if (action) { conditions.push(`a.action ILIKE $${pi++}`); params.push(`%${action}%`); }
    if (severity) { conditions.push(`a.severity = $${pi++}`); params.push(severity); }
    if (from) { conditions.push(`a.created_at >= $${pi++}`); params.push(from); }
    if (to) { conditions.push(`a.created_at <= $${pi++}`); params.push(to); }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const offset = ((page as unknown as number) - 1) * (limit as unknown as number);

    const rows = await query(
      `SELECT a.id, a.action, a.user_id, a.user_name, a.user_role,
              a.details, a.ip, a.severity, a.created_at
       FROM audit_log a
       ${where}
       ORDER BY a.created_at DESC
       LIMIT $${pi++} OFFSET $${pi++}`,
      [...params, limit, offset]
    );

    const [{ count }] = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM audit_log a ${where}`,
      params
    );

    res.json({ data: rows, total: parseInt(count, 10), page, limit });
  } catch (err) { next(err); }
});

export default router;
