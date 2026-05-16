import bcrypt from 'bcryptjs';
import { query, transaction } from '../config/database';

const BCRYPT_ROUNDS = 10;

async function seed() {
  console.log('Seeding database...');
  try {
    await transaction(async (client) => {
      // ─── BRANCH ─────────────────────────────────────────────────
      const branchRes = await client.query(
        `INSERT INTO branches (name, address, manager_name, terminal_count)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        ['Main Branch', 'Quezon City, Metro Manila', 'Store Manager', 3]
      );
      const branchId: string = branchRes.rows[0]?.id ||
        (await client.query("SELECT id FROM branches WHERE name = 'Main Branch' LIMIT 1")).rows[0].id;

      // ─── USERS ──────────────────────────────────────────────────
      const passwordHash = await bcrypt.hash('password', BCRYPT_ROUNDS);
      const pinHash      = await bcrypt.hash('1234',     BCRYPT_ROUNDS);

      const users = [
        { name: 'Admin User',    email: 'admin@tenpos.ph',   role: 'admin'   },
        { name: 'Store Manager', email: 'manager@tenpos.ph', role: 'manager' },
        { name: 'Cashier One',   email: 'cashier@tenpos.ph', role: 'cashier' },
        { name: 'Viewer User',   email: 'viewer@tenpos.ph',  role: 'viewer'  },
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

      // ─── CATEGORIES ─────────────────────────────────────────────
      const categories = [
        { name: 'Large Schoolbag',       description: 'Full-size school backpacks'     },
        { name: 'Medium Schoolbag',      description: 'Medium-size school backpacks'   },
        { name: 'Super Large Schoolbag', description: 'Oversized school backpacks'     },
        { name: 'Lunch Bag',             description: 'Insulated lunch bags and boxes' },
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
        catIds[c.name] = res.rows[0]?.id ||
          (await client.query('SELECT id FROM categories WHERE name = $1', [c.name])).rows[0].id;
      }

      // ─── PRODUCTS ───────────────────────────────────────────────
      const products = [
        { sku: 'LRG-001', name: 'Carry Hope Classic Large',        category: 'Large Schoolbag',       price: 2350, cost: 1200, stock: 12 },
        { sku: 'LRG-002', name: 'Carry Hope Explorer Large',       category: 'Large Schoolbag',       price: 2350, cost: 1200, stock: 8  },
        { sku: 'LRG-003', name: 'Carry Hope Adventure Large',      category: 'Large Schoolbag',       price: 2350, cost: 1200, stock: 15 },
        { sku: 'LRG-004', name: 'Carry Hope Rainbow Large',        category: 'Large Schoolbag',       price: 2350, cost: 1200, stock: 6  },
        { sku: 'MED-001', name: 'Carry Hope Classic Medium',       category: 'Medium Schoolbag',      price: 2850, cost: 1450, stock: 10 },
        { sku: 'MED-002', name: 'Carry Hope Explorer Medium',      category: 'Medium Schoolbag',      price: 2850, cost: 1450, stock: 5  },
        { sku: 'MED-003', name: 'Carry Hope Adventure Medium',     category: 'Medium Schoolbag',      price: 2850, cost: 1450, stock: 9  },
        { sku: 'SLG-001', name: 'Carry Hope Classic Super Large',  category: 'Super Large Schoolbag', price: 3300, cost: 1700, stock: 8  },
        { sku: 'SLG-002', name: 'Carry Hope Explorer Super Large', category: 'Super Large Schoolbag', price: 3300, cost: 1700, stock: 6  },
        { sku: 'LCH-001', name: 'Carry Hope Insulated Lunch Bag',  category: 'Lunch Bag',             price: 1100, cost: 550,  stock: 20 },
        { sku: 'LCH-002', name: 'Carry Hope Mini Lunch Box',       category: 'Lunch Bag',             price: 1100, cost: 550,  stock: 15 },
        { sku: 'LCH-003', name: 'Carry Hope Thermal Lunch Set',    category: 'Lunch Bag',             price: 1100, cost: 550,  stock: 12 },
      ];

      for (const p of products) {
        const res = await client.query(
          `INSERT INTO products (sku, name, category_id, price, cost, barcode)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (sku) DO UPDATE SET name = EXCLUDED.name
           RETURNING id`,
          [p.sku, p.name, catIds[p.category], p.price, p.cost, p.sku]
        );
        const productId: string = res.rows[0]?.id ||
          (await client.query('SELECT id FROM products WHERE sku = $1', [p.sku])).rows[0].id;

        if (!p.sku.startsWith('LCH')) {
          for (const color of ['Black', 'Navy Blue', 'Red']) {
            await client.query(
              `INSERT INTO product_variants (product_id, label, value, price_adjustment)
               VALUES ($1, 'Color', $2, 0) ON CONFLICT DO NOTHING`,
              [productId, color]
            );
          }
        }

        await client.query(
          `INSERT INTO inventory (product_id, branch_id, stock, reorder_point)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (product_id, COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid), branch_id)
           DO UPDATE SET stock = EXCLUDED.stock`,
          [productId, branchId, p.stock, 3]
        );
      }

      // ─── VOUCHERS ───────────────────────────────────────────────
      for (const v of [
        { code: 'WELCOME10', type: 'percentage', value: 10,  min: 0,    max: 100  },
        { code: 'SAVE50',    type: 'fixed',      value: 50,  min: 500,  max: null },
        { code: 'SUMMER20',  type: 'percentage', value: 20,  min: 1000, max: 50   },
      ]) {
        await client.query(
          `INSERT INTO vouchers (code, discount_type, discount_value, min_order, max_uses)
           VALUES ($1, $2, $3, $4, $5) ON CONFLICT (code) DO NOTHING`,
          [v.code, v.type, v.value, v.min, v.max]
        );
      }
    });

    console.log('\nSeed completed.');
    console.log('  admin@tenpos.ph   / password');
    console.log('  manager@tenpos.ph / password');
    console.log('  cashier@tenpos.ph / password');
    console.log('  PIN for all: 1234');
    process.exit(0);
  } catch (err) {
    console.error('Seed failed:', err);
    process.exit(1);
  }
}

seed();
