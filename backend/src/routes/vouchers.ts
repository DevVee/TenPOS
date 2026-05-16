import { Router, Request, Response, NextFunction } from 'express';
import { query, queryOne } from '../config/database';
import { authenticate } from '../middleware/auth';
import { managerOrAbove, cashierOrAbove } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { logAudit } from '../middleware/audit';
import { CreateVoucherSchema, UpdateVoucherSchema, ValidateVoucherSchema } from '../schemas/staff';

const router = Router();
router.use(authenticate);

// GET /api/vouchers
router.get('/', managerOrAbove, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const rows = await query(
      `SELECT v.*,
              (SELECT COUNT(*)::int FROM voucher_uses vu WHERE vu.voucher_id = v.id) AS total_uses_logged
       FROM vouchers v
       ORDER BY v.created_at DESC`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/vouchers/validate — cashier-accessible for POS checkout
router.post('/validate', cashierOrAbove, validate(ValidateVoucherSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { code, subtotal } = req.body as { code: string; subtotal: number };

    const voucher = await queryOne<{
      id: string; code: string; discount_type: string;
      discount_value: number; min_order: number;
      max_uses: number | null; uses_count: number;
      expiry: string | null; active: boolean;
    }>(
      `SELECT * FROM vouchers WHERE code = $1 AND active = true`,
      [code.toUpperCase()]
    );

    if (!voucher) {
      res.status(400).json({ valid: false, error: 'Voucher code not found or inactive' });
      return;
    }

    if (voucher.expiry && new Date(voucher.expiry) < new Date()) {
      res.status(400).json({ valid: false, error: 'Voucher has expired' });
      return;
    }

    if (voucher.max_uses !== null && voucher.uses_count >= voucher.max_uses) {
      res.status(400).json({ valid: false, error: 'Voucher usage limit reached' });
      return;
    }

    if (subtotal < voucher.min_order) {
      res.status(400).json({
        valid: false,
        error: `Minimum order of ₱${voucher.min_order.toFixed(2)} required`
      });
      return;
    }

    const discountAmount = voucher.discount_type === 'percentage'
      ? (subtotal * voucher.discount_value) / 100
      : Math.min(voucher.discount_value, subtotal);

    res.json({
      valid: true,
      voucher_id: voucher.id,
      code: voucher.code,
      discount_type: voucher.discount_type,
      discount_value: voucher.discount_value,
      discount_amount: parseFloat(discountAmount.toFixed(2)),
    });
  } catch (err) { next(err); }
});

// POST /api/vouchers
router.post('/', managerOrAbove, validate(CreateVoucherSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = req.body as {
      code: string; discount_type: string; discount_value: number;
      min_order: number; max_uses?: number; expiry?: string;
    };

    const existing = await queryOne('SELECT id FROM vouchers WHERE code = $1', [body.code]);
    if (existing) {
      res.status(409).json({ error: 'Voucher code already exists' });
      return;
    }

    const [voucher] = await query(
      `INSERT INTO vouchers (code, discount_type, discount_value, min_order, max_uses, expiry)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [body.code, body.discount_type, body.discount_value,
       body.min_order, body.max_uses ?? null, body.expiry ?? null]
    );

    await logAudit(req, 'VOUCHER_CREATE', { code: body.code }, 'low');
    res.status(201).json(voucher);
  } catch (err) { next(err); }
});

// PUT /api/vouchers/:id
router.put('/:id', managerOrAbove, validate(UpdateVoucherSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = req.body as {
      code?: string; discount_type?: string; discount_value?: number;
      min_order?: number; max_uses?: number; expiry?: string; active?: boolean;
    };

    const voucher = await queryOne(
      `UPDATE vouchers SET
        code           = COALESCE($1, code),
        discount_type  = COALESCE($2, discount_type),
        discount_value = COALESCE($3, discount_value),
        min_order      = COALESCE($4, min_order),
        max_uses       = COALESCE($5, max_uses),
        expiry         = COALESCE($6, expiry),
        active         = COALESCE($7, active),
        updated_at     = NOW()
       WHERE id = $8 RETURNING *`,
      [body.code ?? null, body.discount_type ?? null, body.discount_value ?? null,
       body.min_order ?? null, body.max_uses ?? null, body.expiry ?? null,
       body.active ?? null, req.params.id]
    );

    if (!voucher) { res.status(404).json({ error: 'Voucher not found' }); return; }
    res.json(voucher);
  } catch (err) { next(err); }
});

// DELETE /api/vouchers/:id
router.delete('/:id', managerOrAbove, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const v = await queryOne(
      "UPDATE vouchers SET active = false, updated_at = NOW() WHERE id = $1 RETURNING id, code",
      [req.params.id]
    );
    if (!v) { res.status(404).json({ error: 'Voucher not found' }); return; }
    await logAudit(req, 'VOUCHER_DELETE', { id: req.params.id }, 'low');
    res.json({ message: 'Voucher deactivated' });
  } catch (err) { next(err); }
});

export default router;
