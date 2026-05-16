import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { query, queryOne } from '../config/database';
import { authenticate } from '../middleware/auth';
import { onlyAdmin, managerOrAbove } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { logAudit } from '../middleware/audit';
import { CreateStaffSchema, UpdateStaffSchema, StaffQuerySchema } from '../schemas/staff';
import { env } from '../config/env';

const router = Router();
router.use(authenticate);

// GET /api/staff
router.get('/', managerOrAbove, validate(StaffQuerySchema, 'query'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { role, branch_id, status, search, page, limit } = req.query as unknown as {
      role?: string; branch_id?: string; status?: string;
      search?: string; page: number; limit: number;
    };

    const conditions: string[] = [];
    const params: unknown[] = [];
    let pi = 1;

    if (role) { conditions.push(`u.role = $${pi++}`); params.push(role); }
    if (branch_id) { conditions.push(`u.branch_id = $${pi++}`); params.push(branch_id); }
    if (status) { conditions.push(`u.status = $${pi++}`); params.push(status); }
    if (search) {
      conditions.push(`(u.name ILIKE $${pi} OR u.email ILIKE $${pi})`);
      params.push(`%${search}%`);
      pi++;
    }

    // Managers can only see their branch
    if (req.user!.role === 'manager' && req.user!.branch_id) {
      conditions.push(`u.branch_id = $${pi++}`);
      params.push(req.user!.branch_id);
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const offset = ((page as unknown as number) - 1) * (limit as unknown as number);

    const rows = await query(
      `SELECT u.id, u.name, u.email, u.role, u.branch_id, u.status,
              u.last_login, u.sales_count, u.created_at,
              b.name AS branch_name
       FROM users u
       LEFT JOIN branches b ON b.id = u.branch_id
       ${where}
       ORDER BY u.name
       LIMIT $${pi++} OFFSET $${pi++}`,
      [...params, limit, offset]
    );

    const [{ count }] = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM users u ${where}`,
      params
    );

    res.json({ data: rows, total: parseInt(count, 10), page, limit });
  } catch (err) { next(err); }
});

// GET /api/staff/:id
router.get('/:id', managerOrAbove, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await queryOne(
      `SELECT u.id, u.name, u.email, u.role, u.branch_id, u.status,
              u.last_login, u.sales_count, u.created_at, b.name AS branch_name
       FROM users u LEFT JOIN branches b ON b.id = u.branch_id
       WHERE u.id = $1`,
      [req.params.id]
    );
    if (!user) { res.status(404).json({ error: 'Staff not found' }); return; }

    // Recent activity
    const recentActivity = await query(
      `SELECT receipt_no, total, status, created_at
       FROM transactions WHERE cashier_id = $1
       ORDER BY created_at DESC LIMIT 10`,
      [req.params.id]
    );

    res.json({ ...user, recentActivity });
  } catch (err) { next(err); }
});

// POST /api/staff
router.post('/', onlyAdmin, validate(CreateStaffSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = req.body as {
      name: string; email: string; password: string;
      role: string; branch_id?: string; pin?: string;
    };

    const existing = await queryOne('SELECT id FROM users WHERE email = $1', [body.email.toLowerCase()]);
    if (existing) {
      res.status(409).json({ error: 'Email already in use' });
      return;
    }

    const passwordHash = await bcrypt.hash(body.password, env.BCRYPT_ROUNDS);
    const pinHash = body.pin ? await bcrypt.hash(body.pin, env.BCRYPT_ROUNDS) : null;

    const [user] = await query(
      `INSERT INTO users (name, email, password_hash, pin_hash, role, branch_id)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id, name, email, role, branch_id, status, created_at`,
      [body.name, body.email.toLowerCase(), passwordHash, pinHash,
       body.role, body.branch_id ?? null]
    );

    await logAudit(req, 'STAFF_CREATE', { name: body.name, email: body.email, role: body.role }, 'medium');
    res.status(201).json(user);
  } catch (err) { next(err); }
});

// PUT /api/staff/:id
router.put('/:id', onlyAdmin, validate(UpdateStaffSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = req.body as {
      name?: string; email?: string; password?: string;
      role?: string; branch_id?: string | null; status?: string;
    };

    // Prevent demoting the last admin
    if (body.role && body.role !== 'admin') {
      const [{ count }] = await query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM users WHERE role = 'admin' AND status = 'active' AND id != $1",
        [req.params.id]
      );
      if (parseInt(count, 10) === 0) {
        res.status(400).json({ error: 'Cannot demote the last admin' });
        return;
      }
    }

    let passwordHash: string | undefined;
    if (body.password) {
      passwordHash = await bcrypt.hash(body.password, env.BCRYPT_ROUNDS);
    }

    const user = await queryOne(
      `UPDATE users SET
        name        = COALESCE($1, name),
        email       = COALESCE($2, email),
        password_hash = COALESCE($3, password_hash),
        role        = COALESCE($4, role),
        branch_id   = COALESCE($5, branch_id),
        status      = COALESCE($6, status),
        updated_at  = NOW()
       WHERE id = $7
       RETURNING id, name, email, role, branch_id, status`,
      [body.name ?? null, body.email?.toLowerCase() ?? null, passwordHash ?? null,
       body.role ?? null, body.branch_id ?? null, body.status ?? null, req.params.id]
    );

    if (!user) { res.status(404).json({ error: 'Staff not found' }); return; }
    await logAudit(req, 'STAFF_UPDATE', { id: req.params.id }, 'medium');
    res.json(user);
  } catch (err) { next(err); }
});

// DELETE /api/staff/:id — deactivate
router.delete('/:id', onlyAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.params.id === req.user!.id) {
      res.status(400).json({ error: 'Cannot deactivate your own account' });
      return;
    }
    const user = await queryOne(
      "UPDATE users SET status = 'inactive', updated_at = NOW() WHERE id = $1 RETURNING id, name",
      [req.params.id]
    );
    if (!user) { res.status(404).json({ error: 'Staff not found' }); return; }
    await logAudit(req, 'STAFF_DEACTIVATE', { id: req.params.id }, 'high');
    res.json({ message: 'Staff account deactivated' });
  } catch (err) { next(err); }
});

export default router;
