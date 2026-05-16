import { z } from 'zod';

export const ProductVariantSchema = z.object({
  label: z.string().min(1).max(100),
  value: z.string().min(1).max(255),
  price_adjustment: z.number().default(0),
});

export const CreateProductSchema = z.object({
  sku: z.string().min(1).max(100),
  barcode: z.string().max(100).optional(),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  category_id: z.string().uuid().optional(),
  price: z.number().positive('Price must be positive'),
  cost: z.number().nonnegative().optional(),
  image_url: z.string().url().optional(),
  variants: z.array(ProductVariantSchema).optional().default([]),
});

export const UpdateProductSchema = CreateProductSchema.partial();

export const ProductQuerySchema = z.object({
  search: z.string().optional(),
  category_id: z.string().uuid().optional(),
  active: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const CreateCategorySchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
});

export const UpdateCategorySchema = CreateCategorySchema.partial();

export type CreateProductInput = z.infer<typeof CreateProductSchema>;
export type UpdateProductInput = z.infer<typeof UpdateProductSchema>;
