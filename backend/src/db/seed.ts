import bcrypt from 'bcryptjs';
import { pool } from '../config/database';

const BCRYPT_ROUNDS = 12;

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log('Seeding database...');

    // ─── BRANCH ────────────────────────────────────────────────
    const branchRes = await client.query(
      `INSERT INTO branches (name, address, manager_name, terminal_count)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      ['Main Branch', 'Quezon City, Metro Manila', 'Store Manager', 3]
    );
    const branchId: string = branchRes.rows[0]?.id || (
      await client.query("SELECT id FROM branches WHERE name = 'Main Branch' LIMIT 1")
    ).rows[0].id;

    // ─── USERS ─────────────────────────────────────────────────
    const passwordHash = await bcrypt.hash('password', BCRYPT_ROUNDS);
    const pinHash = await bcrypt.hash('1234', BCRYPT_ROUNDS);

    const users = [
      { name: 'Admin User', email: 'admin@tenpos.ph', role: 'admin' },
      { name: 'Store Manager', email: 'manager@tenpos.ph', role: 'manager' },
      { name: 'Cashier One', email: 'cashier@tenpos.ph', role: 'cashier' },
      { name: 'Viewer User', email: 'viewer@tenpos.ph', role: 'viewer' },
    ];

    const userIds: Record<string, string> = {};
    for (const u of users) {
      const res = await client.query(
        `INSERT INTO users (name, email, password_hash, pin_hash, role, branch_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
         RETURNING id, email`,
        [u.name, u.email, passwordHash, pinHash, u.role, branchId]
      );
      userIds[u.email] = res.rows[0].id;
    }

    // ─── CATEGORIES ────────────────────────────────────────────
    const categories = [
      { name: 'Large Schoolbag', description: 'Full-size school backpacks' },
      { name: 'Medium Schoolbag', description: 'Medium-size school backpacks' },
      { name: 'Super Large Schoolbag', description: 'Oversized school backpacks' },
      { name: 'Lunch Bag', description: 'Insulated lunch bags and boxes' },
    ];

    const catIds: Record<string, string> = {};
    for (const c of categories) {
      const res = await client.query(
        `INSERT INTO categories (name, description)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING
         RETURNING id, name`,
        [c.name, c.description]
      );
      if (res.rows[0]) {
        catIds[c.name] = res.rows[0].id;
      } else {
        const existing = await client.query('SELECT id FROM categories WHERE name = $1', [c.name]);
        catIds[c.name] = existing.rows[0].id;
      }
    }

    // ─── PRODUCTS ──────────────────────────────────────────────
    const products = [
      // Large Schoolbags
      { sku: 'LRG-001', name: 'Carry Hope Classic Large', category: 'Large Schoolbag', price: 2350, cost: 1200, stock: 12 },
      { sku: 'LRG-002', name: 'Carry Hope Explorer Large', category: 'Large Schoolbag', price: 2350, cost: 1200, stock: 8 },
      { sku: 'LRG-003', name: 'Carry Hope Adventure Large', category: 'Large Schoolbag', price: 2350, cost: 1200, stock: 15 },
      { sku: 'LRG-004', name: 'Carry Hope Rainbow Large', category: 'Large Schoolbag', price: 2350, cost: 1200, stock: 6 },
      { sku: 'LRG-005', name: 'Carry Hope Galaxy Large', category: 'Large Schoolbag', price: 2350, cost: 1200, stock: 10 },
      { sku: 'LRG-006', name: 'Carry Hope Forest Large', category: 'Large Schoolbag', price: 2350, cost: 1200, stock: 3 },
      { sku: 'LRG-007', name: 'Carry Hope Ocean Large', category: 'Large Schoolbag', price: 2350, cost: 1200, stock: 7 },
      // Medium Schoolbags
      { sku: 'MED-001', name: 'Carry Hope Classic Medium', category: 'Medium Schoolbag', price: 2850, cost: 1450, stock: 10 },
      { sku: 'MED-002', name: 'Carry Hope Explorer Medium', category: 'Medium Schoolbag', price: 2850, cost: 1450, stock: 5 },
      { sku: 'MED-003', name: 'Carry Hope Adventure Medium', category: 'Medium Schoolbag', price: 2850, cost: 1450, stock: 9 },
      { sku: 'MED-004', name: 'Carry Hope Rainbow Medium', category: 'Medium Schoolbag', price: 2850, cost: 1450, stock: 4 },
      { sku: 'MED-005', name: 'Carry Hope Galaxy Medium', category: 'Medium Schoolbag', price: 2850, cost: 1450, stock: 11 },
      { sku: 'MED-006', name: 'Carry Hope Sunset Medium', category: 'Medium Schoolbag', price: 2850, cost: 1450, stock: 2 },
      // Super Large Schoolbags
      { sku: 'SLG-001', name: 'Carry Hope Classic Super Large', category: 'Super Large Schoolbag', price: 3300, cost: 1700, stock: 8 },
      { sku: 'SLG-002', name: 'Carry Hope Explorer Super Large', category: 'Super Large Schoolbag', price: 3300, cost: 1700, stock: 6 },
      { sku: 'SLG-003', name: 'Carry Hope Adventure Super Large', category: 'Super Large Schoolbag', price: 3300, cost: 1700, stock: 4 },
      { sku: 'SLG-004', name: 'Carry Hope Galaxy Super Large', category: 'Super Large Schoolbag', price: 3300, cost: 1700, stock: 3 },
      // Lunch Bags
      { sku: 'LCH-001', name: 'Carry Hope Insulated Lunch Bag', category: 'Lunch Bag', price: 1100, cost: 550, stock: 20 },
      { sku: 'LCH-002', name: 'Carry Hope Mini Lunch Box', category: 'Lunch Bag', price: 1100, cost: 550, stock: 15 },
      { sku: 'LCH-003', name: 'Carry Hope Thermal Lunch Set', category: 'Lunch Bag', price: 1100, cost: 550, stock: 12 },
      { sku: 'LCH-004', name: 'Carry Hope Bento Lunch Bag', category: 'Lunch Bag', price: 1100, cost: 550, stock: 8 },
    ];

    const productIds: string[] = [];
    for (const p of products) {
      const res = await client.query(
        `INSERT INTO products (sku, name, category_id, price, cost, barcode)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (sku) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [p.sku, p.name, catIds[p.category], p.price, p.cost, p.sku]
      );
      const productId: string = res.rows[0]?.id || (
        await client.query('SELECT id FROM products WHERE sku = $1', [p.sku])
      ).rows[0].id;

      productIds.push(productId);

      // Add color variants for bags
      if (!p.sku.startsWith('LCH')) {
        const colors = ['Black', 'Navy Blue', 'Red'];
        for (const color of colors) {
          await client.query(
            `INSERT INTO product_variants (product_id, label, value, price_adjustment)
             VALUES ($1, 'Color', $2, 0)
             ON CONFLICT DO NOTHING`,
            [productId, color]
          );
        }
      }

      // Set inventory
      await client.query(
        `INSERT INTO inventory (product_id, branch_id, stock, reorder_point)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (product_id, COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::UUID), branch_id)
         DO UPDATE SET stock = EXCLUDED.stock`,
        [productId, branchId, p.stock, 3]
      );
    }

    // ─── VOUCHERS ──────────────────────────────────────────────
    const vouchers = [
      { code: 'WELCOME10', discount_type: 'percentage', discount_value: 10, min_order: 0, max_uses: 100 },
      { code: 'SAVE50', discount_type: 'fixed', discount_value: 50, min_order: 500, max_uses: null },
      { code: 'SUMMER20', discount_type: 'percentage', discount_value: 20, min_order: 1000, max_uses: 50 },
    ];

    for (const v of vouchers) {
      await client.query(
        `INSERT INTO vouchers (code, discount_type, discount_value, min_order, max_uses)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (code) DO NOTHING`,
        [v.code, v.discount_type, v.discount_value, v.min_order, v.max_uses]
      );
    }

    await client.query('COMMIT');
    console.log('Seed completed successfully.');
    console.log('');
    console.log('Demo accounts:');
    console.log('  admin@tenpos.ph   / password  (Admin)');
    console.log('  manager@tenpos.ph / password  (Manager)');
    console.log('  cashier@tenpos.ph / password  (Cashier)');
    console.log('  viewer@tenpos.ph  / password  (Viewer)');
    console.log('  PIN for all: 1234');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
