import { z } from 'zod';

export const StockAdjustmentSchema = z.object({
  product_id: z.string().uuid(),
  variant_id: z.string().uuid().optional(),
  branch_id: z.string().uuid(),
  type: z.enum(['in', 'out', 'correction', 'damage', 'return']),
  quantity: z.number().int().positive(),
  reason: z.string().min(1, 'Reason is required').max(500),
});

export const UpdateStockSchema = z.object({
  stock: z.number().int().nonnegative(),
  branch_id: z.string().uuid(),
  variant_id: z.string().uuid().optional(),
});

export const AdjustmentQuerySchema = z.object({
  product_id: z.string().uuid().optional(),
  branch_id: z.string().uuid().optional(),
  type: z.enum(['in', 'out', 'correction', 'damage', 'return']).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type StockAdjustmentInput = z.infer<typeof StockAdjustmentSchema>;
