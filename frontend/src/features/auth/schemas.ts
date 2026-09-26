import { z } from 'zod'

export const email = z.string().trim().min(1, 'Enter your email').email('Enter a valid email')

export const newPassword = z
  .string()
  .min(8, 'At least 8 characters')
  .max(128, 'Too long')
  .regex(/[A-Za-z]/, 'Include a letter')
  .regex(/\d/, 'Include a number')

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Enter your password'),
})

export const registerSchema = z
  .object({
    full_name: z.string().trim().min(2, 'Enter your full name').max(120),
    email,
    password: newPassword,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: "Passwords don't match" })

export const resetSchema = z
  .object({ password: newPassword, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: "Passwords don't match" })
