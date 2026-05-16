import { Router, Request, Response, NextFunction } from 'express';
import { query, queryOne } from '../config/database';
import { authenticate } from '../middleware/auth';
import { onlyAdmin, anyRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { logAudit } from '../middleware/audit';
import { CreateBranchSchema, UpdateBranchSchema } from '../schemas/staff';

const router = Router();
router.use(authenticate);

// GET /api/branches
router.get('/', anyRole, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const rows = await query(
      `SELECT b.*, COUNT(u.id)::int AS staff_count
       FROM branches b
       LEFT JOIN users u ON u.branch_id = b.id AND u.status = 'active'
       GROUP BY b.id
       ORDER BY b.name`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/branches/:id
router.get('/:id', anyRole, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const branch = await queryOne(
      'SELECT * FROM branches WHERE id = $1',
      [req.params.id]
    );
    if (!branch) { res.status(404).json({ error: 'Branch not found' }); return; }

    const staff = await query(
      'SELECT id, name, email, role, status FROM users WHERE branch_id = $1',
      [req.params.id]
    );

    res.json({ ...branch, staff });
  } catch (err) { next(err); }
});

// POST /api/branches
router.post('/', onlyAdmin, validate(CreateBranchSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, address, manager_name, terminal_count } = req.body as {
      name: string; address?: string; manager_name?: string; terminal_count: number;
    };
    const [branch] = await query(
      'INSERT INTO branches (name, address, manager_name, terminal_count) VALUES ($1,$2,$3,$4) RETURNING *',
      [name, address ?? null, manager_name ?? null, terminal_count]
    );
    await logAudit(req, 'BRANCH_CREATE', { name }, 'medium');
    res.status(201).json(branch);
  } catch (err) { next(err); }
});

// PUT /api/branches/:id
router.put('/:id', onlyAdmin, validate(UpdateBranchSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, address, manager_name, terminal_count, active } = req.body as {
      name?: string; address?: string; manager_name?: string; terminal_count?: number; active?: boolean;
    };
    const branch = await queryOne(
      `UPDATE branches SET
        name          = COALESCE($1, name),
        address       = COALESCE($2, address),
        manager_name  = COALESCE($3, manager_name),
        terminal_count = COALESCE($4, terminal_count),
        active        = COALESCE($5, active),
        updated_at    = NOW()
       WHERE id = $6 RETURNING *`,
      [name ?? null, address ?? null, manager_name ?? null, terminal_count ?? null, active ?? null, req.params.id]
    );
    if (!branch) { res.status(404).json({ error: 'Branch not found' }); return; }
    await logAudit(req, 'BRANCH_UPDATE', { id: req.params.id }, 'low');
    res.json(branch);
  } catch (err) { next(err); }
});

// DELETE /api/branches/:id — deactivate
router.delete('/:id', onlyAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const branch = await queryOne(
      'UPDATE branches SET active = false, updated_at = NOW() WHERE id = $1 RETURNING id, name',
      [req.params.id]
    );
    if (!branch) { res.status(404).json({ error: 'Branch not found' }); return; }
    await logAudit(req, 'BRANCH_DEACTIVATE', { id: req.params.id }, 'high');
    res.json({ message: 'Branch deactivated' });
  } catch (err) { next(err); }
});

export default router;
