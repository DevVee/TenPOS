import { Router, Request, Response, NextFunction } from 'express';
import { query, queryOne, transaction } from '../config/database';
import { authenticate } from '../middleware/auth';
import { managerOrAbove, cashierOrAbove } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { logAudit } from '../middleware/audit';
import { StockAdjustmentSchema, AdjustmentQuerySchema } from '../schemas/inventory';

const router = Router();
router.use(authenticate);

// GET /api/inventory — all inventory with product info
router.get('/', cashierOrAbove, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const branch_id = (req.query.branch_id as string) || null;
    const rows = await query(
      `SELECT i.*, p.name AS product_name, p.sku, p.barcode, p.price, p.cost, p.image_url,
              c.name AS category_name, b.name AS branch_name,
              pv.label AS variant_label, pv.value AS variant_value
       FROM inventory i
       JOIN products p ON p.id = i.product_id
       LEFT JOIN categories c ON c.id = p.category_id
       JOIN branches b ON b.id = i.branch_id
       LEFT JOIN product_variants pv ON pv.id = i.variant_id
       WHERE p.active = true
         ${branch_id ? 'AND i.branch_id = $1' : ''}
       ORDER BY p.name, pv.value`,
      branch_id ? [branch_id] : []
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/inventory/low-stock
router.get('/low-stock', cashierOrAbove, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const branch_id = (req.query.branch_id as string) || null;
    const rows = await query(
      `SELECT i.*, p.name AS product_name, p.sku, p.price, p.image_url,
              c.name AS category_name, b.name AS branch_name,
              pv.label AS variant_label, pv.value AS variant_value
       FROM inventory i
       JOIN products p ON p.id = i.product_id
       LEFT JOIN categories c ON c.id = p.category_id
       JOIN branches b ON b.id = i.branch_id
       LEFT JOIN product_variants pv ON pv.id = i.variant_id
       WHERE i.stock <= i.reorder_point AND p.active = true
         ${branch_id ? 'AND i.branch_id = $1' : ''}
       ORDER BY i.stock ASC`,
      branch_id ? [branch_id] : []
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/inventory/adjustments
router.get('/adjustments', managerOrAbove, validate(AdjustmentQuerySchema, 'query'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { product_id, branch_id, type, from, to, page, limit } = req.query as unknown as {
      product_id?: string; branch_id?: string; type?: string;
      from?: string; to?: string; page: number; limit: number;
    };

    const conditions: string[] = [];
    const params: unknown[] = [];
    let pi = 1;

    if (product_id) { conditions.push(`sa.product_id = $${pi++}`); params.push(product_id); }
    if (branch_id) { conditions.push(`sa.branch_id = $${pi++}`); params.push(branch_id); }
    if (type) { conditions.push(`sa.type = $${pi++}`); params.push(type); }
    if (from) { conditions.push(`sa.created_at >= $${pi++}`); params.push(from); }
    if (to) { conditions.push(`sa.created_at <= $${pi++}`); params.push(to); }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const offset = ((page as unknown as number) - 1) * (limit as unknown as number);

    const rows = await query(
      `SELECT sa.*, p.name AS product_name, p.sku, b.name AS branch_name,
              u.name AS user_name, pv.label AS variant_label, pv.value AS variant_value
       FROM stock_adjustments sa
       JOIN products p ON p.id = sa.product_id
       JOIN branches b ON b.id = sa.branch_id
       JOIN users u ON u.id = sa.user_id
       LEFT JOIN product_variants pv ON pv.id = sa.variant_id
       ${where}
       ORDER BY sa.created_at DESC
       LIMIT $${pi++} OFFSET $${pi++}`,
      [...params, limit, offset]
    );

    const [{ count }] = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM stock_adjustments sa ${where}`,
      params
    );

    res.json({ data: rows, total: parseInt(count, 10), page, limit });
  } catch (err) { next(err); }
});

// POST /api/inventory/adjustments — log manual stock adjustment
router.post('/adjustments', managerOrAbove, validate(StockAdjustmentSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = req.body as {
      product_id: string; variant_id?: string; branch_id: string;
      type: 'in' | 'out' | 'correction' | 'damage' | 'return';
      quantity: number; reason: string;
    };

    const adjustment = await transaction(async (client) => {
      // Check current stock
      const inv = await client.query(
        `SELECT id, stock FROM inventory
         WHERE product_id = $1 AND branch_id = $2
           AND (variant_id = $3 OR ($3 IS NULL AND variant_id IS NULL))`,
        [body.product_id, body.branch_id, body.variant_id ?? null]
      );

      const stockRow = inv.rows[0];
      let newStock: number;

      if (!stockRow) {
        // Create inventory record if it doesn't exist
        newStock = body.type === 'in' ? body.quantity : 0;
        await client.query(
          `INSERT INTO inventory (product_id, variant_id, branch_id, stock)
           VALUES ($1, $2, $3, $4)`,
          [body.product_id, body.variant_id ?? null, body.branch_id, Math.max(0, newStock)]
        );
      } else {
        if (body.type === 'in' || body.type === 'return') {
          newStock = stockRow.stock + body.quantity;
        } else if (body.type === 'out' || body.type === 'damage') {
          newStock = Math.max(0, stockRow.stock - body.quantity);
        } else {
          // correction = set absolute value
          newStock = body.quantity;
        }
        await client.query(
          'UPDATE inventory SET stock = $1, updated_at = NOW() WHERE id = $2',
          [newStock, stockRow.id]
        );
      }

      // Log adjustment
      const adjResult = await client.query(
        `INSERT INTO stock_adjustments (product_id, variant_id, branch_id, type, quantity, reason, user_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [body.product_id, body.variant_id ?? null, body.branch_id,
         body.type, body.quantity, body.reason, req.user!.id]
      );

      return { ...adjResult.rows[0], new_stock: newStock };
    });

    await logAudit(req, 'INVENTORY_ADJUSTMENT', {
      product_id: body.product_id, type: body.type, quantity: body.quantity
    }, 'medium');

    res.status(201).json(adjustment);
  } catch (err) { next(err); }
});

// PUT /api/inventory/:productId — directly set stock (admin/manager)
router.put('/:productId', managerOrAbove, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { stock, branch_id, variant_id } = req.body as {
      stock: number; branch_id: string; variant_id?: string;
    };

    if (typeof stock !== 'number' || stock < 0) {
      res.status(400).json({ error: 'stock must be a non-negative number' });
      return;
    }

    const existing = await queryOne<{ id: string; stock: number }>(
      `SELECT id, stock FROM inventory
       WHERE product_id = $1 AND branch_id = $2
         AND (variant_id = $3 OR ($3 IS NULL AND variant_id IS NULL))`,
      [req.params.productId, branch_id, variant_id ?? null]
    );

    if (!existing) {
      await query(
        'INSERT INTO inventory (product_id, variant_id, branch_id, stock) VALUES ($1,$2,$3,$4)',
        [req.params.productId, variant_id ?? null, branch_id, stock]
      );
    } else {
      await query('UPDATE inventory SET stock = $1, updated_at = NOW() WHERE id = $2', [stock, existing.id]);
    }

    await logAudit(req, 'INVENTORY_SET', { product_id: req.params.productId, stock }, 'medium');
    res.json({ message: 'Stock updated', stock });
  } catch (err) { next(err); }
});

export default router;
