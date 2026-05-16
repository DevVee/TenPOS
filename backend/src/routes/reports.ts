import { Router, Request, Response, NextFunction } from 'express';
import { query } from '../config/database';
import { authenticate } from '../middleware/auth';
import { managerOrAbove } from '../middleware/rbac';
import { reportLimiter } from '../middleware/rateLimit';

const router = Router();
router.use(authenticate, managerOrAbove, reportLimiter);

// GET /api/reports/sales?from=&to=&branch_id=
router.get('/sales', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { from, to, branch_id } = req.query as { from?: string; to?: string; branch_id?: string };
    const fromDate = from || new Date(Date.now() - 30 * 86400000).toISOString();
    const toDate   = to   || new Date().toISOString();

    const bParams: unknown[] = branch_id ? [fromDate, toDate, branch_id] : [fromDate, toDate];
    const bCond = branch_id ? 'AND t.branch_id = $3' : '';

    const [summary] = await query<{
      total_revenue: string; transaction_count: number;
      total_discount: string; total_tax: string; avg_order_value: string;
    }>(
      `SELECT
         COALESCE(SUM(total), 0)::numeric        AS total_revenue,
         COUNT(*)::int                            AS transaction_count,
         COALESCE(SUM(discount), 0)::numeric     AS total_discount,
         COALESCE(SUM(tax), 0)::numeric          AS total_tax,
         COALESCE(AVG(total), 0)::numeric        AS avg_order_value
       FROM transactions t
       WHERE status = 'completed'
         AND created_at BETWEEN $1 AND $2
         ${bCond}`,
      bParams
    );

    const salesByPeriod = await query(
      `SELECT
         TO_CHAR(created_at, 'YYYY-MM-DD') AS date,
         SUM(total)::numeric               AS revenue,
         COUNT(*)::int                     AS count
       FROM transactions t
       WHERE status = 'completed'
         AND created_at BETWEEN $1 AND $2
         ${bCond}
       GROUP BY date ORDER BY date`,
      bParams
    );

    const topProducts = await query(
      `SELECT
         ti.product_id,
         ti.product_name,
         COALESCE(c.name, 'Other') AS category_name,
         SUM(ti.quantity)::int     AS quantity_sold,
         SUM(ti.total)::numeric    AS revenue
       FROM transaction_items ti
       JOIN  transactions t ON t.id = ti.transaction_id
       LEFT JOIN products  p ON p.id = ti.product_id
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE t.status = 'completed'
         AND t.created_at BETWEEN $1 AND $2
         ${bCond}
       GROUP BY ti.product_id, ti.product_name, c.name
       ORDER BY revenue DESC LIMIT 10`,
      bParams
    );

    const byPaymentMethod = await query(
      `SELECT p.method, SUM(p.amount)::numeric AS total, COUNT(*)::int AS count
       FROM payments p
       JOIN transactions t ON t.id = p.transaction_id
       WHERE t.status = 'completed'
         AND t.created_at BETWEEN $1 AND $2
         ${bCond}
       GROUP BY p.method`,
      bParams
    );

    const hourlyHeatmap = await query(
      `SELECT EXTRACT(HOUR FROM created_at)::int AS hour,
              COUNT(*)::int                       AS count,
              SUM(total)::numeric                 AS revenue
       FROM transactions t
       WHERE status = 'completed'
         AND created_at BETWEEN $1 AND $2
         ${bCond}
       GROUP BY hour ORDER BY hour`,
      bParams
    );

    res.json({ summary, salesByPeriod, topProducts, byPaymentMethod, hourlyHeatmap });
  } catch (err) { next(err); }
});

// GET /api/reports/staff?from=&to=&branch_id=
router.get('/staff', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { from, to, branch_id } = req.query as { from?: string; to?: string; branch_id?: string };
    const fromDate = from || new Date(Date.now() - 30 * 86400000).toISOString();
    const toDate   = to   || new Date().toISOString();

    const bParams: unknown[] = branch_id ? [fromDate, toDate, branch_id] : [fromDate, toDate];
    const bCond = branch_id ? 'AND t.branch_id = $3' : '';

    const staffPerformance = await query(
      `SELECT
         u.id, u.name, u.email, u.role,
         COUNT(t.id)::int AS total_transactions,
         COALESCE(SUM(CASE WHEN t.status = 'completed' THEN t.total ELSE 0 END), 0)::numeric AS total_sales,
         COALESCE(AVG(CASE WHEN t.status = 'completed' THEN t.total END), 0)::numeric        AS avg_sale,
         COUNT(CASE WHEN t.status = 'voided'   THEN 1 END)::int AS voids,
         COUNT(CASE WHEN t.status = 'returned' THEN 1 END)::int AS returns
       FROM users u
       LEFT JOIN transactions t
         ON t.cashier_id = u.id
         AND t.created_at BETWEEN $1 AND $2
         ${bCond}
       WHERE u.role IN ('cashier', 'manager')
       GROUP BY u.id, u.name, u.email, u.role
       ORDER BY total_sales DESC`,
      bParams
    );

    const shiftSummary = await query(
      `SELECT
         u.name AS cashier_name,
         DATE(t.created_at) AS shift_date,
         COUNT(t.id)::int AS transactions,
         SUM(CASE WHEN t.status = 'completed' THEN t.total ELSE 0 END)::numeric AS sales
       FROM transactions t
       JOIN users u ON u.id = t.cashier_id
       WHERE t.created_at BETWEEN $1 AND $2 ${bCond}
       GROUP BY u.name, shift_date
       ORDER BY shift_date DESC, sales DESC`,
      bParams
    );

    res.json({ staffPerformance, shiftSummary });
  } catch (err) { next(err); }
});

// GET /api/reports/financial?from=&to=&branch_id=
router.get('/financial', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { from, to, branch_id } = req.query as { from?: string; to?: string; branch_id?: string };
    const todayStr = new Date().toISOString().slice(0, 10);
    const fromDate = from || `${todayStr}T00:00:00Z`;
    const toDate   = to   || `${todayStr}T23:59:59Z`;

    const bParams: unknown[] = branch_id ? [fromDate, toDate, branch_id] : [fromDate, toDate];
    const bCond = branch_id ? 'AND t.branch_id = $3' : '';

    const [zReport] = await query(
      `SELECT
         COUNT(*)::int AS transaction_count,
         COUNT(CASE WHEN t.status = 'completed' THEN 1 END)::int AS completed_count,
         COUNT(CASE WHEN t.status = 'voided'    THEN 1 END)::int AS voided_count,
         COUNT(CASE WHEN t.status = 'returned'  THEN 1 END)::int AS return_count,
         COALESCE(SUM(CASE WHEN t.status = 'completed' THEN t.subtotal ELSE 0 END), 0)::numeric AS gross_sales,
         COALESCE(SUM(CASE WHEN t.status = 'completed' THEN t.discount ELSE 0 END), 0)::numeric AS total_discount,
         COALESCE(SUM(CASE WHEN t.status = 'completed' THEN t.tax     ELSE 0 END), 0)::numeric AS total_tax,
         COALESCE(SUM(CASE WHEN t.status = 'completed' THEN t.total   ELSE 0 END), 0)::numeric AS net_sales,
         CASE
           WHEN COUNT(CASE WHEN t.status = 'completed' THEN 1 END) > 0
           THEN (COALESCE(SUM(CASE WHEN t.status = 'completed' THEN t.total ELSE 0 END), 0) /
                 COUNT(CASE WHEN t.status = 'completed' THEN 1 END))::numeric
           ELSE 0::numeric
         END AS avg_order_value
       FROM transactions t
       WHERE t.created_at BETWEEN $1 AND $2 ${bCond}`,
      bParams
    );

    const paymentBreakdown = await query(
      `SELECT p.method, SUM(p.amount)::numeric AS total, COUNT(*)::int AS count
       FROM payments p
       JOIN transactions t ON t.id = p.transaction_id
       WHERE t.status = 'completed'
         AND t.created_at BETWEEN $1 AND $2 ${bCond}
       GROUP BY p.method ORDER BY total DESC`,
      bParams
    );

    const [vatSummary] = await query(
      `SELECT
         COALESCE(SUM(total) - SUM(tax), 0)::numeric AS vatable_sales,
         COALESCE(SUM(tax), 0)::numeric               AS vat_amount,
         0::numeric                                   AS vat_exempt,
         COALESCE(SUM(total), 0)::numeric             AS total
       FROM transactions t
       WHERE status = 'completed'
         AND created_at BETWEEN $1 AND $2 ${bCond}`,
      bParams
    );

    const dailyBreakdown = await query(
      `SELECT
         DATE(created_at) AS date,
         COUNT(CASE WHEN status='completed' THEN 1 END)::int AS transactions,
         COALESCE(SUM(CASE WHEN status='completed' THEN total    ELSE 0 END), 0)::numeric AS sales,
         COALESCE(SUM(CASE WHEN status='completed' THEN tax      ELSE 0 END), 0)::numeric AS tax,
         COALESCE(SUM(CASE WHEN status='completed' THEN discount ELSE 0 END), 0)::numeric AS discounts
       FROM transactions t
       WHERE created_at BETWEEN $1 AND $2 ${bCond}
       GROUP BY date ORDER BY date DESC`,
      bParams
    );

    res.json({ zReport, paymentBreakdown, vatSummary, dailyBreakdown });
  } catch (err) { next(err); }
});

// GET /api/reports/inventory?branch_id=
router.get('/inventory', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { branch_id } = req.query as { branch_id?: string };

    const invParams: unknown[] = branch_id ? [branch_id] : [];
    const invCond  = branch_id ? 'AND i.branch_id = $1' : '';
    const adjParams: unknown[] = branch_id ? [branch_id] : [];
    const adjCond  = branch_id ? 'AND sa.branch_id = $1' : '';

    const stockSummary = await query(
      `SELECT
         p.id, p.name, p.sku, p.price, p.cost,
         c.name AS category_name,
         COALESCE(SUM(i.stock), 0)::int          AS total_stock,
         MIN(i.reorder_point)::int               AS reorder_point,
         (COALESCE(SUM(i.stock), 0) * p.cost)::numeric AS stock_value
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN inventory  i ON i.product_id = p.id ${invCond}
       WHERE p.active = true
       GROUP BY p.id, p.name, p.sku, p.price, p.cost, c.name
       ORDER BY stock_value DESC`,
      invParams
    );

    const fastMovers = await query(
      `SELECT ti.product_id, ti.product_name,
              SUM(ti.quantity)::int   AS quantity_sold,
              SUM(ti.total)::numeric  AS revenue
       FROM transaction_items ti
       JOIN transactions t ON t.id = ti.transaction_id
       WHERE t.status = 'completed'
         AND t.created_at >= NOW() - INTERVAL '30 days'
       GROUP BY ti.product_id, ti.product_name
       ORDER BY quantity_sold DESC LIMIT 20`,
      []
    );

    const stockMovement = await query(
      `SELECT sa.type,
              COUNT(*)::int            AS count,
              SUM(sa.quantity)::int    AS total_quantity
       FROM stock_adjustments sa
       WHERE sa.created_at >= NOW() - INTERVAL '30 days'
         ${adjCond}
       GROUP BY sa.type`,
      adjParams
    );

    const valueByCategory = await query(
      `SELECT COALESCE(c.name, 'Uncategorized') AS category,
              COUNT(DISTINCT p.id)::int                     AS products,
              COALESCE(SUM(i.stock), 0)::int                AS total_stock,
              COALESCE(SUM(i.stock * p.cost), 0)::numeric   AS total_value
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN inventory  i ON i.product_id = p.id ${invCond}
       WHERE p.active = true
       GROUP BY c.name ORDER BY total_value DESC`,
      invParams
    );

    res.json({ stockSummary, fastMovers, stockMovement, valueByCategory });
  } catch (err) { next(err); }
});

export default router;
