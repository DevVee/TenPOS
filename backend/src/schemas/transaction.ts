import { z } from 'zod';

const PaymentSchema = z.object({
  method: z.enum(['cash', 'gcash', 'paymaya', 'card']),
  amount: z.number().positive(),
  reference: z.string().optional(),
});

const TransactionItemSchema = z.object({
  product_id: z.string().uuid(),
  variant_id: z.string().uuid().optional(),
  quantity: z.number().int().positive(),
  unit_price: z.number().positive(),
  discount: z.number().nonnegative().default(0),
  note: z.string().optional(),
});

export const CreateTransactionSchema = z.object({
  branch_id: z.string().uuid(),
  items: z.array(TransactionItemSchema).min(1, 'At least one item required'),
  payments: z.array(PaymentSchema).min(1, 'At least one payment required'),
  discount: z.number().nonnegative().default(0),
  voucher_code: z.string().optional(),
});

export const VoidTransactionSchema = z.object({
  reason: z.string().min(1, 'Void reason is required').max(500),
});

export const ReturnItemSchema = z.object({
  items: z.array(z.object({
    transaction_item_id: z.string().uuid(),
    quantity: z.number().int().positive(),
    reason: z.string().min(1),
  })).min(1),
});

export const TransactionQuerySchema = z.object({
  cashier_id: z.string().uuid().optional(),
  branch_id: z.string().uuid().optional(),
  status: z.enum(['completed', 'voided', 'returned']).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type CreateTransactionInput = z.infer<typeof CreateTransactionSchema>;
