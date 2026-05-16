import { z } from 'zod';

export const CreateStaffSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.enum(['admin', 'manager', 'cashier', 'viewer']),
  branch_id: z.string().uuid().optional(),
  pin: z.string().regex(/^\d{4,6}$/).optional(),
});

export const UpdateStaffSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  email: z.string().email().optional(),
  password: z.string().min(8).optional(),
  role: z.enum(['admin', 'manager', 'cashier', 'viewer']).optional(),
  branch_id: z.string().uuid().nullable().optional(),
  status: z.enum(['active', 'inactive', 'suspended']).optional(),
});

export const StaffQuerySchema = z.object({
  role: z.enum(['admin', 'manager', 'cashier', 'viewer']).optional(),
  branch_id: z.string().uuid().optional(),
  status: z.enum(['active', 'inactive', 'suspended']).optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const CreateBranchSchema = z.object({
  name: z.string().min(1).max(255),
  address: z.string().optional(),
  manager_name: z.string().optional(),
  terminal_count: z.number().int().positive().default(1),
});

export const UpdateBranchSchema = CreateBranchSchema.partial().extend({
  active: z.boolean().optional(),
});

export const CreateVoucherSchema = z.object({
  code: z.string().min(3).max(50).toUpperCase(),
  discount_type: z.enum(['percentage', 'fixed']),
  discount_value: z.number().positive(),
  min_order: z.number().nonnegative().default(0),
  max_uses: z.number().int().positive().optional(),
  expiry: z.string().optional(),
});

export const UpdateVoucherSchema = CreateVoucherSchema.partial().extend({
  active: z.boolean().optional(),
});

export const ValidateVoucherSchema = z.object({
  code: z.string().min(1),
  subtotal: z.number().positive(),
});
