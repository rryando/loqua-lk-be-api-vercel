import { z } from 'zod';

// Common API Error Schema
export const APIErrorSchema = z.object({
    error: z.object({
        code: z.string(),
        message: z.string(),
        details: z.any().optional(),
    }),
    timestamp: z.string(),
});

// Common Success Response Schema
export const SuccessResponseSchema = z.object({
    success: z.boolean(),
    message: z.string().optional(),
    timestamp: z.string(),
});

// Pagination Schema
export const PaginationSchema = z.object({
    limit: z.number().positive(),
    offset: z.number().nonnegative(),
    has_next: z.boolean(),
});

// Common Query Parameters
export const PaginationQuerySchema = z.object({
    limit: z.string().transform(Number).optional().default("10"),
    offset: z.string().transform(Number).optional().default("0"),
});

// Path Parameter Schemas
export const UserIdParamSchema = z.object({
    user_id: z.string(),
});

export const SessionIdParamSchema = z.object({
    session_id: z.string(),
});
