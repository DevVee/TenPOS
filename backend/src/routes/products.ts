import { Router, Request, Response, NextFunction } from 'express';
import { query, queryOne, transaction } from '../config/database';
import { authenticate } from '../middleware/auth';
import { managerOrAbove, cashierOrAbove } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { logAudit } from '../middleware/audit';
import {
  CreateProductSchema, UpdateProductSchema, ProductQuerySchema,
  CreateCategorySchema, UpdateCategorySchema,
} from '../schemas/product';

const router = Router();
router.use(authenticate);

// ─────────────────────────────────────────────
// CATEGORIES
// ─────────────────────────────────────────────

// GET /api/products/categories
router.get('/categories', cashierOrAbove, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const rows = await query('SELECT * FROM categories ORDER BY name');
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/products/categories
router.post('/categories', managerOrAbove, validate(CreateCategorySchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, description } = req.body as { name: string; description?: string };
    const [cat] = await query(
      'INSERT INTO categories (name, description) VALUES ($1, $2) RETURNING *',
      [name, description ?? null]
    );
    await logAudit(req, 'CATEGORY_CREATE', { name }, 'low');
    res.status(201).json(cat);
  } catch (err) { next(err); }
});

// PUT /api/products/categories/:id
router.put('/categories/:id', managerOrAbove, validate(UpdateCategorySchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, description } = req.body as { name?: string; description?: string };
    const cat = await queryOne(
      `UPDATE categories SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        updated_at = NOW()
       WHERE id = $3 RETURNING *`,
      [name ?? null, description ?? null, req.params.id]
    );
    if (!cat) { res.status(404).json({ error: 'Category not found' }); return; }
    res.json(cat);
  } catch (err) { next(err); }
});

// DELETE /api/products/categories/:id
router.delete('/categories/:id', managerOrAbove, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await query('DELETE FROM categories WHERE id = $1 RETURNING id', [req.params.id]);
    if (!result.length) { res.status(404).json({ error: 'Category not found' }); return; }
    await logAudit(req, 'CATEGORY_DELETE', { id: req.params.id }, 'medium');
    res.json({ message: 'Category deleted' });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────
// PRODUCTS
// ─────────────────────────────────────────────

// GET /api/products
router.get('/', cashierOrAbove, validate(ProductQuerySchema, 'query'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { search, category_id, active, page, limit } = req.query as unknown as {
      search?: string; category_id?: string; active?: string;
      page: number; limit: number;
    };

    const conditions: string[] = [];
    const params: unknown[] = [];
    let pi = 1;

    if (search) {
      conditions.push(`(p.name ILIKE $${pi} OR p.sku ILIKE $${pi} OR p.barcode ILIKE $${pi})`);
      params.push(`%${search}%`);
      pi++;
    }
    if (category_id) {
      conditions.push(`p.category_id = $${pi++}`);
      params.push(category_id);
    }
    if (active !== undefined) {
      conditions.push(`p.active = $${pi++}`);
      params.push(active === 'true');
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const offset = ((page as unknown as number) - 1) * (limit as unknown as number);

    const rows = await query(
      `SELECT p.*, c.name AS category_name,
              COALESCE(SUM(i.stock), 0)::int AS total_stock
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN inventory i ON i.product_id = p.id
       ${where}
       GROUP BY p.id, c.name
       ORDER BY p.name
       LIMIT $${pi++} OFFSET $${pi++}`,
      [...params, limit, offset]
    );

    const [{ count }] = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM products p ${where}`,
      params
    );

    res.json({ data: rows, total: parseInt(count, 10), page, limit });
  } catch (err) { next(err); }
});

// GET /api/products/barcode/:barcode
router.get('/barcode/:barcode', cashierOrAbove, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const product = await queryOne(
      `SELECT p.*, c.name AS category_name FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.barcode = $1 AND p.active = true`,
      [req.params.barcode]
    );
    if (!product) { res.status(404).json({ error: 'Product not found' }); return; }
    const variants = await query('SELECT * FROM product_variants WHERE product_id = $1', [req.params.barcode]);
    res.json({ ...product, variants });
  } catch (err) { next(err); }
});

// GET /api/products/:id
router.get('/:id', cashierOrAbove, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const product = await queryOne(
      `SELECT p.*, c.name AS category_name FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.id = $1`,
      [req.params.id]
    );
    if (!product) { res.status(404).json({ error: 'Product not found' }); return; }
    const variants = await query('SELECT * FROM product_variants WHERE product_id = $1 ORDER BY label, value', [req.params.id]);
    const inventory = await query(
      `SELECT i.*, b.name AS branch_name FROM inventory i
       JOIN branches b ON b.id = i.branch_id
       WHERE i.product_id = $1`,
      [req.params.id]
    );
    res.json({ ...product, variants, inventory });
  } catch (err) { next(err); }
});

// POST /api/products
router.post('/', managerOrAbove, validate(CreateProductSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = req.body as {
      sku: string; barcode?: string; name: string; description?: string;
      category_id?: string; price: number; cost?: number; image_url?: string;
      variants: { label: string; value: string; price_adjustment: number }[];
    };

    const product = await transaction(async (client) => {
      const pResult = await client.query(
        `INSERT INTO products (sku, barcode, name, description, category_id, price, cost, image_url)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [body.sku, body.barcode ?? null, body.name, body.description ?? null,
         body.category_id ?? null, body.price, body.cost ?? null, body.image_url ?? null]
      );
      const product = pResult.rows[0];

      if (body.variants?.length) {
        for (const v of body.variants) {
          await client.query(
            'INSERT INTO product_variants (product_id, label, value, price_adjustment) VALUES ($1,$2,$3,$4)',
            [product.id, v.label, v.value, v.price_adjustment]
          );
        }
      }
      return product;
    });

    await logAudit(req, 'PRODUCT_CREATE', { sku: body.sku, name: body.name }, 'low');
    res.status(201).json(product);
  } catch (err) { next(err); }
});

// PUT /api/products/:id
router.put('/:id', managerOrAbove, validate(UpdateProductSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = req.body as {
      sku?: string; barcode?: string; name?: string; description?: string;
      category_id?: string; price?: number; cost?: number; image_url?: string; active?: boolean;
      variants?: { label: string; value: string; price_adjustment: number }[];
    };

    const product = await queryOne(
      `UPDATE products SET
        sku         = COALESCE($1, sku),
        barcode     = COALESCE($2, barcode),
        name        = COALESCE($3, name),
        description = COALESCE($4, description),
        category_id = COALESCE($5, category_id),
        price       = COALESCE($6, price),
        cost        = COALESCE($7, cost),
        image_url   = COALESCE($8, image_url),
        active      = COALESCE($9, active),
        updated_at  = NOW()
       WHERE id = $10 RETURNING *`,
      [body.sku ?? null, body.barcode ?? null, body.name ?? null, body.description ?? null,
       body.category_id ?? null, body.price ?? null, body.cost ?? null, body.image_url ?? null,
       body.active ?? null, req.params.id]
    );

    if (!product) { res.status(404).json({ error: 'Product not found' }); return; }

    if (body.variants !== undefined) {
      await query('DELETE FROM product_variants WHERE product_id = $1', [req.params.id]);
      for (const v of body.variants) {
        await query(
          'INSERT INTO product_variants (product_id, label, value, price_adjustment) VALUES ($1,$2,$3,$4)',
          [req.params.id, v.label, v.value, v.price_adjustment]
        );
      }
    }

    await logAudit(req, 'PRODUCT_UPDATE', { id: req.params.id }, 'low');
    res.json(product);
  } catch (err) { next(err); }
});

// DELETE /api/products/:id (soft delete)
router.delete('/:id', managerOrAbove, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const product = await queryOne(
      'UPDATE products SET active = false, updated_at = NOW() WHERE id = $1 RETURNING id, name',
      [req.params.id]
    );
    if (!product) { res.status(404).json({ error: 'Product not found' }); return; }
    await logAudit(req, 'PRODUCT_DELETE', { id: req.params.id }, 'medium');
    res.json({ message: 'Product deactivated' });
  } catch (err) { next(err); }
});

export default router;
