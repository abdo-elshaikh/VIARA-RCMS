const { z } = require('zod');

/**
 * User/Staff validation schemas
 */
const STAFF_ROLES = ['Developer', 'Admin', 'Radiologist', 'Receptionist', 'Cashier', 'Accountant', 'Insurance_Staff', 'Referring_Doctor', 'Technician', 'Nurse', 'HR', 'Marketing'];

// Create user schema (for registration)
const createUserSchema = z.object({
    fullName: z.string()
        .min(3, 'Full name must be at least 3 characters')
        .max(100, 'Full name must be less than 100 characters')
        .trim(),

    email: z.string()
        .email('Invalid email format')
        .max(150, 'Email must be less than 150 characters')
        .toLowerCase()
        .trim(),

    password: z.string()
        .min(8, 'Password must be at least 8 characters')
        .max(100, 'Password must be less than 100 characters')
        .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
        .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
        .regex(/[0-9]/, 'Password must contain at least one number'),

    role: z.enum(STAFF_ROLES, {
        errorMap: () => ({ message: 'Invalid role specified' })
    }),

    isActive: z.boolean().optional()
}).passthrough();

// Login schema
const loginSchema = z.object({
    email: z.string()
        .email('Invalid email format')
        .toLowerCase()
        .trim(),

    password: z.string()
        .min(1, 'Password is required')
});

const enable2FASchema = z.object({
    token: z.string().regex(/^\d{6}$/, 'A six-digit authentication code is required')
});

const verify2FASchema = enable2FASchema.extend({
    tempToken: z.string().min(1).max(4096)
});

// Update user schema
const updateUserSchema = z.object({
    fullName: z.string().min(3).max(100).trim().optional(),
    email: z.string().email().max(150).toLowerCase().trim().optional(),
    role: z.enum(STAFF_ROLES).optional(),
    isActive: z.boolean().optional(),
    password: z.string()
        .min(8, 'Password must be at least 8 characters')
        .max(100, 'Password must be less than 100 characters')
        .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
        .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
        .regex(/[0-9]/, 'Password must contain at least one number')
        .optional()
}).passthrough();

// Change password schema
const changePasswordSchema = z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z.string()
        .min(8, 'New password must be at least 8 characters')
        .max(100, 'New password must be less than 100 characters')
        .regex(/[A-Z]/, 'New password must contain at least one uppercase letter')
        .regex(/[a-z]/, 'New password must contain at least one lowercase letter')
        .regex(/[0-9]/, 'Password must contain at least one number')
}).refine((data) => data.currentPassword !== data.newPassword, {
    message: 'New password must be different from current password',
    path: ['newPassword']
});

module.exports = {
    STAFF_ROLES,
    createUserSchema,
    enable2FASchema,
    loginSchema,
    updateUserSchema,
    changePasswordSchema,
    verify2FASchema
};
