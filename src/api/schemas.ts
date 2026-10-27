import { z } from 'zod';

/**
 * Contract schemas for the DummyJSON API.
 * `.strict()` on the core resources means an *added* field fails the contract too —
 * consumers should learn about schema drift from a test, not from production.
 */

const isoDate = z.iso.datetime();

export const ReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().min(1),
  date: isoDate,
  reviewerName: z.string().min(1),
  reviewerEmail: z.email(),
});

export const ProductSchema = z
  .object({
    id: z.number().int().positive(),
    title: z.string().min(1),
    description: z.string().min(1),
    category: z.string().min(1),
    price: z.number().positive(),
    discountPercentage: z.number().min(0).max(100),
    rating: z.number().min(0).max(5),
    stock: z.number().int().min(0),
    tags: z.array(z.string()),
    brand: z.string().optional(),
    sku: z.string().min(1),
    weight: z.number().positive(),
    dimensions: z.object({ width: z.number(), height: z.number(), depth: z.number() }),
    warrantyInformation: z.string(),
    shippingInformation: z.string(),
    availabilityStatus: z.enum(['In Stock', 'Low Stock', 'Out of Stock']),
    reviews: z.array(ReviewSchema),
    returnPolicy: z.string(),
    minimumOrderQuantity: z.number().int().positive(),
    meta: z.object({ createdAt: isoDate, updatedAt: isoDate, barcode: z.string(), qrCode: z.url() }),
    images: z.array(z.url()).min(1),
    thumbnail: z.url(),
  })
  .strict();

export const CartLineSchema = z.object({
  id: z.number().int().positive(),
  title: z.string(),
  price: z.number().positive(),
  quantity: z.number().int().positive(),
  total: z.number(),
  discountPercentage: z.number().min(0).max(100),
  discountedTotal: z.number(),
  thumbnail: z.url(),
});

export const CartSchema = z
  .object({
    id: z.number().int().positive(),
    products: z.array(CartLineSchema).min(1),
    total: z.number(),
    discountedTotal: z.number(),
    userId: z.number().int().positive(),
    totalProducts: z.number().int(),
    totalQuantity: z.number().int(),
  })
  .strict();

export const UserSchema = z.object({
  id: z.number().int().positive(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  username: z.string().min(1),
  email: z.email(),
  age: z.number().int(),
  birthDate: z.string().regex(/^\d{4}-\d{1,2}-\d{1,2}$/),
});

export const AuthTokenSchema = z.object({
  id: z.number().int(),
  username: z.string(),
  email: z.email(),
  accessToken: z.jwt(),
  refreshToken: z.jwt(),
});

export const ErrorSchema = z.object({ message: z.string().min(1) });

export const paginated = <K extends string, T extends z.ZodType>(key: K, item: T) =>
  z
    .object({
      total: z.number().int().min(0),
      skip: z.number().int().min(0),
      limit: z.number().int().min(0),
    })
    .extend({ [key]: z.array(item) } as { [P in K]: z.ZodArray<T> });

export type Product = z.infer<typeof ProductSchema>;
export type Cart = z.infer<typeof CartSchema>;
export type User = z.infer<typeof UserSchema>;
