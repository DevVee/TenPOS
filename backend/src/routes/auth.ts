import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { env } from '../config/env';
import { query, queryOne } from '../config/database';
import { validate } from '../middleware/validate';
import { authenticate } from '../middleware/auth';
import { loginLimiter } from '../middleware/rateLimit';
import { logAudit } from '../middleware/audit';
import { LoginSchema, RefreshSchema, ChangePinSchema, VerifyPinSchema } from '../schemas/auth';

const router = Router();

function signAccess(user: { id: string; email: string; name: string; role: string; branch_id: string | null }) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role, branch_id: user.branch_id },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN } as jwt.SignOptions
  );
}

function signRefresh(userId: string) {
  return jwt.sign({ sub: userId }, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN,
  } as jwt.SignOptions);
}

// POST /api/auth/login
router.post('/login', loginLimiter, validate(LoginSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body as { email: string; password: string };

    const user = await queryOne<{
      id: string; email: string; name: string; role: string;
      branch_id: string | null; password_hash: string; status: string;
      failed_logins: number; locked_until: string | null;
    }>(
      'SELECT id, email, name, role, branch_id, password_hash, status, failed_logins, locked_until FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (!user) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    if (user.status !== 'active') {
      res.status(403).json({ error: 'Account is inactive or suspended' });
      return;
    }

    // Brute-force lockout check
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      const mins = Math.ceil((new Date(user.locked_until).getTime() - Date.now()) / 60000);
      res.status(429).json({ error: `Account locked. Try again in ${mins} minute(s).` });
      return;
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      const fails = user.failed_logins + 1;
      const lock = fails >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;
      await query(
        'UPDATE users SET failed_logins = $1, locked_until = $2 WHERE id = $3',
        [fails, lock, user.id]
      );
      await logAudit(req, 'AUTH_LOGIN_FAIL', { email }, 'medium');
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    // Reset on success
    await query(
      'UPDATE users SET failed_logins = 0, locked_until = NULL, last_login = NOW() WHERE id = $1',
      [user.id]
    );

    const accessToken = signAccess(user);
    const refreshRaw = signRefresh(user.id);
    const refreshHash = crypto.createHash('sha256').update(refreshRaw).digest('hex');

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await query(
      'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [user.id, refreshHash, expiresAt]
    );

    await logAudit(req, 'AUTH_LOGIN', { email: user.email, role: user.role }, 'low');

    res.json({
      accessToken,
      refreshToken: refreshRaw,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, branch_id: user.branch_id },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/refresh
router.post('/refresh', validate(RefreshSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body as { refreshToken: string };

    let payload: { sub: string };
    try {
      payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as { sub: string };
    } catch {
      res.status(401).json({ error: 'Invalid or expired refresh token' });
      return;
    }

    const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const stored = await queryOne<{ id: string; user_id: string; revoked: boolean; expires_at: string }>(
      'SELECT id, user_id, revoked, expires_at FROM refresh_tokens WHERE token_hash = $1',
      [hash]
    );

    if (!stored || stored.revoked || new Date(stored.expires_at) < new Date()) {
      res.status(401).json({ error: 'Refresh token invalid or revoked' });
      return;
    }

    const user = await queryOne<{ id: string; email: string; name: string; role: string; branch_id: string | null; status: string }>(
      'SELECT id, email, name, role, branch_id, status FROM users WHERE id = $1',
      [payload.sub]
    );

    if (!user || user.status !== 'active') {
      res.status(401).json({ error: 'User not found or inactive' });
      return;
    }

    // Rotate refresh token
    await query('UPDATE refresh_tokens SET revoked = true WHERE id = $1', [stored.id]);

    const newAccessToken = signAccess(user);
    const newRefreshRaw = signRefresh(user.id);
    const newRefreshHash = crypto.createHash('sha256').update(newRefreshRaw).digest('hex');

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await query(
      'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [user.id, newRefreshHash, expiresAt]
    );

    res.json({ accessToken: newAccessToken, refreshToken: newRefreshRaw });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout
router.post('/logout', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body as { refreshToken?: string };
    if (refreshToken) {
      const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');
      await query('UPDATE refresh_tokens SET revoked = true WHERE token_hash = $1', [hash]);
    } else {
      // Revoke all tokens for this user
      await query('UPDATE refresh_tokens SET revoked = true WHERE user_id = $1', [req.user!.id]);
    }
    await logAudit(req, 'AUTH_LOGOUT', {}, 'low');
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await queryOne<{
      id: string; name: string; email: string; role: string;
      branch_id: string | null; status: string; last_login: string;
      sales_count: number;
    }>(
      'SELECT id, name, email, role, branch_id, status, last_login, sales_count FROM users WHERE id = $1',
      [req.user!.id]
    );
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json(user);
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/pin — set or update PIN
router.post('/pin', authenticate, validate(ChangePinSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { pin } = req.body as { pin: string };
    const pinHash = await bcrypt.hash(pin, env.BCRYPT_ROUNDS);
    await query('UPDATE users SET pin_hash = $1 WHERE id = $2', [pinHash, req.user!.id]);
    await logAudit(req, 'AUTH_PIN_SET', {}, 'low');
    res.json({ message: 'PIN updated successfully' });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/pin/verify
router.post('/pin/verify', authenticate, validate(VerifyPinSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { pin } = req.body as { pin: string };
    const row = await queryOne<{ pin_hash: string | null }>('SELECT pin_hash FROM users WHERE id = $1', [req.user!.id]);
    if (!row?.pin_hash) {
      res.status(400).json({ error: 'No PIN set for this user' });
      return;
    }
    const valid = await bcrypt.compare(pin, row.pin_hash);
    if (!valid) {
      res.status(401).json({ error: 'Incorrect PIN' });
      return;
    }
    res.json({ valid: true });
  } catch (err) {
    next(err);
  }
});

export default router;
