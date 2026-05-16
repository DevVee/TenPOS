import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { query, queryOne, transaction } from '../config/database';
import { authenticate } from '../middleware/auth';
import { managerOrAbove, cashierOrAbove } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { logAudit } from '../middleware/audit';
import {
  CreateTransactionSchema, VoidTransactionSchema,
  ReturnItemSchema, TransactionQuerySchema,
} from '../schemas/transaction';

const router = Router();
router.use(authenticate);

const TAX_RATE = 0.12;

function generateReceiptNo(): string {
  const date = new Date();
  const d = date.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(Math.random() * 900000 + 100000);
  return `RCP-${d}-${rand}`;
}

function hashTransaction(data: Record<string, unknown>): string {
  return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

// GET /api/transactions
router.get('/', cashierOrAbove, validate(TransactionQuerySchema, 'query'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { cashier_id, branch_id, status, from, to, search, page, limit } = req.query as unknown as {
      cashier_id?: string; branch_id?: string; status?: string;
      from?: string; to?: string; search?: string; page: number; limit: number;
    };

    const conditions: string[] = [];
    const params: unknown[] = [];
    let pi = 1;

    // Cashier can only see their own transactions
    if (req.user!.role === 'cashier') {
      conditions.push(`t.cashier_id = $${pi++}`);
      params.push(req.user!.id);
    } else if (cashier_id) {
      conditions.push(`t.cashier_id = $${pi++}`);
      params.push(cashier_id);
    }

    if (branch_id) { conditions.push(`t.branch_id = $${pi++}`); params.push(branch_id); }
    if (status) { conditions.push(`t.status = $${pi++}`); params.push(status); }
    if (from) { conditions.push(`t.created_at >= $${pi++}`); params.push(from); }
    if (to) { conditions.push(`t.created_at <= $${pi++}`); params.push(to); }
    if (search) { conditions.push(`t.receipt_no ILIKE $${pi++}`); params.push(`%${search}%`); }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const offset = ((page as unknown as number) - 1) * (limit as unknown as number);

    const rows = await query(
      `SELECT t.*, u.name AS cashier_name, b.name AS branch_name
       FROM transactions t
       JOIN users u ON u.id = t.cashier_id
       JOIN branches b ON b.id = t.branch_id
       ${where}
       ORDER BY t.created_at DESC
       LIMIT $${pi++} OFFSET $${pi++}`,
      [...params, limit, offset]
    );

    const [{ count }] = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM transactions t ${where}`,
      params
    );

    res.json({ data: rows, total: parseInt(count, 10), page, limit });
  } catch (err) { next(err); }
});

// GET /api/transactions/:id
router.get('/:id', cashierOrAbove, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const txn = await queryOne(
      `SELECT t.*, u.name AS cashier_name, b.name AS branch_name,
              v.name AS voided_by_name
       FROM transactions t
       JOIN users u ON u.id = t.cashier_id
       JOIN branches b ON b.id = t.branch_id
       LEFT JOIN users v ON v.id = t.voided_by
       WHERE t.id = $1`,
      [req.params.id]
    );
    if (!txn) { res.status(404).json({ error: 'Transaction not found' }); return; }

    const items = await query(
      `SELECT ti.*, p.image_url, pv.label AS variant_label, pv.value AS variant_value
       FROM transaction_items ti
       JOIN products p ON p.id = ti.product_id
       LEFT JOIN product_variants pv ON pv.id = ti.variant_id
       WHERE ti.transaction_id = $1`,
      [req.params.id]
    );

    const payments = await query('SELECT * FROM payments WHERE transaction_id = $1', [req.params.id]);

    res.json({ ...txn, items, payments });
  } catch (err) { next(err); }
});

// POST /api/transactions — create new sale
router.post('/', cashierOrAbove, validate(CreateTransactionSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = req.body as {
      branch_id: string;
      items: { product_id: string; variant_id?: string; quantity: number; unit_price: number; discount: number; note?: string }[];
      payments: { method: string; amount: number; reference?: string }[];
      discount: number;
      voucher_code?: string;
    };

    const result = await transaction(async (client) => {
      // 1. Validate products and check stock
      const enrichedItems: {
        product_id: string; variant_id: string | null; product_name: string;
        product_sku: string; quantity: number; unit_price: number; discount: number;
        total: number; note: string | null;
      }[] = [];

      for (const item of body.items) {
        const product = await client.query(
          'SELECT id, name, sku, price, active FROM products WHERE id = $1',
          [item.product_id]
        );
        if (!product.rows.length || !product.rows[0].active) {
          throw Object.assign(new Error(`Product ${item.product_id} not found or inactive`), { statusCode: 400 });
        }

        // Check stock
        const inv = await client.query(
          `SELECT id, stock FROM inventory
           WHERE product_id = $1 AND branch_id = $2
             AND (variant_id = $3 OR ($3 IS NULL AND variant_id IS NULL))`,
          [item.product_id, body.branch_id, item.variant_id ?? null]
        );

        if (!inv.rows.length || inv.rows[0].stock < item.quantity) {
          throw Object.assign(
            new Error(`Insufficient stock for product: ${product.rows[0].name}`),
            { statusCode: 400 }
          );
        }

        const itemTotal = (item.unit_price * item.quantity) - item.discount;
        enrichedItems.push({
          product_id: item.product_id,
          variant_id: item.variant_id ?? null,
          product_name: product.rows[0].name,
          product_sku: product.rows[0].sku,
          quantity: item.quantity,
          unit_price: item.unit_price,
          discount: item.discount,
          total: Math.max(0, itemTotal),
          note: item.note ?? null,
        });
      }

      // 2. Calculate totals
      const itemsSubtotal = enrichedItems.reduce((s, i) => s + i.total, 0);

      // 3. Validate voucher
      let voucherDiscount = 0;
      let voucherId: string | null = null;
      if (body.voucher_code) {
        const v = await client.query(
          `SELECT * FROM vouchers WHERE code = $1 AND active = true
             AND (expiry IS NULL OR expiry > NOW())
             AND (max_uses IS NULL OR uses_count < max_uses)`,
          [body.voucher_code.toUpperCase()]
        );
        if (!v.rows.length) {
          throw Object.assign(new Error('Invalid or expired voucher code'), { statusCode: 400 });
        }
        const voucher = v.rows[0];
        if (itemsSubtotal < voucher.min_order) {
          throw Object.assign(
            new Error(`Minimum order of ₱${voucher.min_order} required for this voucher`),
            { statusCode: 400 }
          );
        }
        voucherId = voucher.id;
        voucherDiscount = voucher.discount_type === 'percentage'
          ? (itemsSubtotal * voucher.discount_value) / 100
          : voucher.discount_value;
      }

      const totalDiscount = body.discount + voucherDiscount;
      const subtotal = Math.max(0, itemsSubtotal - totalDiscount);
      const tax = parseFloat((subtotal * TAX_RATE / (1 + TAX_RATE)).toFixed(2));
      const total = subtotal;

      // 4. Validate payments cover total
      const totalPaid = body.payments.reduce((s, p) => s + p.amount, 0);
      if (totalPaid < total) {
        throw Object.assign(
          new Error(`Payment amount (${totalPaid}) is less than total (${total})`),
          { statusCode: 400 }
        );
      }

      // 5. Create transaction
      const receiptNo = generateReceiptNo();
      const hash = hashTransaction({ items: enrichedItems, subtotal, discount: totalDiscount, tax, total, cashier_id: req.user!.id });

      const txnResult = await client.query(
        `INSERT INTO transactions
           (receipt_no, cashier_id, branch_id, subtotal, discount, tax, total, hash)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [receiptNo, req.user!.id, body.branch_id, subtotal, totalDiscount, tax, total, hash]
      );
      const txn = txnResult.rows[0];

      // 6. Insert items
      for (const item of enrichedItems) {
        await client.query(
          `INSERT INTO transaction_items
             (transaction_id, product_id, variant_id, product_name, product_sku, quantity, unit_price, discount, total, note)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [txn.id, item.product_id, item.variant_id, item.product_name, item.product_sku,
           item.quantity, item.unit_price, item.discount, item.total, item.note]
        );
      }

      // 7. Insert payments
      for (const p of body.payments) {
        await client.query(
          'INSERT INTO payments (transaction_id, method, amount, reference) VALUES ($1,$2,$3,$4)',
          [txn.id, p.method, p.amount, p.reference ?? null]
        );
      }

      // 8. Deduct inventory
      for (const item of enrichedItems) {
        await client.query(
          `UPDATE inventory SET stock = stock - $1, updated_at = NOW()
           WHERE product_id = $2 AND branch_id = $3
             AND (variant_id = $4 OR ($4 IS NULL AND variant_id IS NULL))`,
          [item.quantity, item.product_id, body.branch_id, item.variant_id]
        );
      }

      // 9. Mark voucher used
      if (voucherId) {
        await client.query('UPDATE vouchers SET uses_count = uses_count + 1 WHERE id = $1', [voucherId]);
        await client.query(
          'INSERT INTO voucher_uses (voucher_id, transaction_id, user_id) VALUES ($1,$2,$3)',
          [voucherId, txn.id, req.user!.id]
        );
      }

      // 10. Increment cashier sales count
      await client.query('UPDATE users SET sales_count = sales_count + 1 WHERE id = $1', [req.user!.id]);

      return { ...txn, items: enrichedItems, payments: body.payments };
    });

    await logAudit(req, 'TRANSACTION_CREATE', { receipt_no: result.receipt_no, total: result.total }, 'low');
    res.status(201).json(result);
  } catch (err) { next(err); }
});

// POST /api/transactions/:id/void
router.post('/:id/void', managerOrAbove, validate(VoidTransactionSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { reason } = req.body as { reason: string };

    const txn = await queryOne<{ id: string; status: string; branch_id: string }>(
      'SELECT id, status, branch_id FROM transactions WHERE id = $1',
      [req.params.id]
    );

    if (!txn) { res.status(404).json({ error: 'Transaction not found' }); return; }
    if (txn.status !== 'completed') {
      res.status(400).json({ error: 'Only completed transactions can be voided' });
      return;
    }

    await transaction(async (client) => {
      // Restore stock
      const items = await client.query(
        'SELECT product_id, variant_id, quantity FROM transaction_items WHERE transaction_id = $1',
        [txn.id]
      );
      for (const item of items.rows) {
        await client.query(
          `UPDATE inventory SET stock = stock + $1, updated_at = NOW()
           WHERE product_id = $2 AND branch_id = $3
             AND (variant_id = $4 OR ($4 IS NULL AND variant_id IS NULL))`,
          [item.quantity, item.product_id, txn.branch_id, item.variant_id]
        );
      }

      await client.query(
        `UPDATE transactions SET status = 'voided', void_reason = $1, voided_by = $2, voided_at = NOW()
         WHERE id = $3`,
        [reason, req.user!.id, txn.id]
      );
    });

    await logAudit(req, 'TRANSACTION_VOID', { transaction_id: txn.id, reason }, 'high');
    res.json({ message: 'Transaction voided and stock restored' });
  } catch (err) { next(err); }
});

// POST /api/transactions/:id/return — partial or full return
router.post('/:id/return', managerOrAbove, validate(ReturnItemSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { items } = req.body as {
      items: { transaction_item_id: string; quantity: number; reason: string }[];
    };

    const txn = await queryOne<{ id: string; status: string; branch_id: string }>(
      'SELECT id, status, branch_id FROM transactions WHERE id = $1',
      [req.params.id]
    );

    if (!txn) { res.status(404).json({ error: 'Transaction not found' }); return; }
    if (txn.status === 'voided') {
      res.status(400).json({ error: 'Cannot return a voided transaction' });
      return;
    }

    await transaction(async (client) => {
      for (const returnItem of items) {
        const ti = await client.query(
          'SELECT * FROM transaction_items WHERE id = $1 AND transaction_id = $2',
          [returnItem.transaction_item_id, txn.id]
        );
        if (!ti.rows.length) {
          throw Object.assign(new Error(`Item ${returnItem.transaction_item_id} not found in this transaction`), { statusCode: 400 });
        }
        const item = ti.rows[0];
        if (returnItem.quantity > item.quantity) {
          throw Object.assign(new Error('Return quantity exceeds original quantity'), { statusCode: 400 });
        }

        // Restore stock
        await client.query(
          `UPDATE inventory SET stock = stock + $1, updated_at = NOW()
           WHERE product_id = $2 AND branch_id = $3
             AND (variant_id = $4 OR ($4 IS NULL AND variant_id IS NULL))`,
          [returnItem.quantity, item.product_id, txn.branch_id, item.variant_id]
        );

        // Log adjustment
        await client.query(
          `INSERT INTO stock_adjustments (product_id, variant_id, branch_id, type, quantity, reason, user_id)
           VALUES ($1,$2,$3,'return',$4,$5,$6)`,
          [item.product_id, item.variant_id, txn.branch_id, returnItem.quantity, returnItem.reason, req.user!.id]
        );
      }

      await client.query("UPDATE transactions SET status = 'returned' WHERE id = $1", [txn.id]);
    });

    await logAudit(req, 'TRANSACTION_RETURN', { transaction_id: txn.id }, 'high');
    res.json({ message: 'Return processed and stock restored' });
  } catch (err) { next(err); }
});

export default router;
