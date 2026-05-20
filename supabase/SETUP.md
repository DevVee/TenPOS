# Supabase Setup Guide — TenPOS

## One-time steps (do this once)

### 1. Create the Supabase project
1. Go to [supabase.com](https://supabase.com) → New project
2. Name: `TenPOS`
3. Database password: choose a strong one, save it somewhere safe
4. Region: **Southeast Asia (Singapore)** — closest to Philippines
5. Wait ~2 minutes for the project to provision

### 2. Get your API keys
1. Supabase Dashboard → Your project → **Settings → API**
2. Copy:
   - **Project URL** → paste into `web/.env` as `VITE_SUPABASE_URL`
   - **anon / public key** → paste into `web/.env` as `VITE_SUPABASE_ANON_KEY`

### 3. Run the migrations (in order)
Go to **SQL Editor** in Supabase Dashboard and run each file:

| Order | File | What it does |
|-------|------|-------------|
| 1st | `migrations/001_schema.sql` | Creates all tables |
| 2nd | `migrations/002_rls.sql` | Enables Row Level Security |
| 3rd | `migrations/003_indexes.sql` | Adds performance indexes |
| 4th | `migrations/004_seed.sql` | Inserts sample branch + products |

### 4. Create your admin account
1. Supabase Dashboard → **Authentication → Users → Add user**
2. Email: `admin@tenpos.ph`
3. Password: (strong password)
4. Click "Create user" — copy the UUID shown

5. In **SQL Editor**, run:
```sql
insert into staff (auth_id, branch_id, name, email, role, status)
values (
  '<paste UUID here>',
  'a0000000-0000-0000-0000-000000000001',
  'Admin',
  'admin@tenpos.ph',
  'admin',
  'active'
);
```

### 5. Enable Realtime (optional, for live sync between terminals)
1. Supabase Dashboard → **Database → Replication**
2. Enable replication for: `transactions`, `stock_levels`, `products`

### 6. Set up Storage (for product images)
1. Supabase Dashboard → **Storage → New bucket**
2. Name: `products`
3. Public: ✅ Yes (images are public)
4. Max file size: 5 MB

---

## Local development

```bash
# 1. Copy env file
cp web/.env.example web/.env
# 2. Fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY

# 3. Start web dev server
cd web && npm run dev
```

## Production deployment (Vercel)

1. Connect GitHub repo to Vercel
2. Set root directory: `web`
3. Add environment variables in Vercel dashboard:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_APP_URL` (your Vercel URL)
4. Deploy ✅
