import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useLocation } from 'react-router-dom'
import type { z } from 'zod'
import { Button } from '@/components/ui/Button'
import { Field, Input, PasswordInput } from '@/components/ui/Input'
import { useAuth } from '@/features/auth/AuthProvider'
import { FormAlert } from '@/features/auth/FormAlert'
import { loginSchema } from '@/features/auth/schemas'
import { AuthLayout } from '@/layouts/AuthLayout'
import { errorMessage } from '@/lib/errors'

type Values = z.infer<typeof loginSchema>

export default function Login() {
  const { login, sessionExpired } = useAuth()
  const location = useLocation()
  const passwordReset = Boolean((location.state as { passwordReset?: boolean } | null)?.passwordReset)
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } })

  const onSubmit = handleSubmit(async (values) => {
    setError(null)
    try {
      await login(values.email, values.password)
      // RequireGuest redirects to ?next= (or the dashboard) once authenticated.
    } catch (err) {
      setError(errorMessage(err, 'Could not sign in. Try again.'))
    }
  })

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Welcome back to StockSense."
      footer={
        <>
          New here?{' '}
          <Link to="/register" className="focus-ring rounded font-medium text-accent hover:text-emphasis">
            Create an account
          </Link>
        </>
      }
    >
      <FormAlert tone="success">{passwordReset && !error ? 'Password updated. Sign in with your new password.' : null}</FormAlert>
      <FormAlert tone="info">{sessionExpired && !error ? 'Your session ended. Sign in to continue.' : null}</FormAlert>
      <FormAlert>{error}</FormAlert>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <Field label="Email" error={errors.email?.message}>
          <Input type="email" autoComplete="email" autoFocus placeholder="you@company.com" {...register('email')} />
        </Field>
        <Field
          label="Password"
          error={errors.password?.message}
          labelAction={
            <Link to="/forgot-password" className="focus-ring rounded text-[12.5px] text-muted hover:text-accent">
              Forgot password?
            </Link>
          }
        >
          <PasswordInput autoComplete="current-password" {...register('password')} />
        </Field>
        <Button type="submit" variant="primary" className="w-full" loading={isSubmitting}>
          Sign in
        </Button>
      </form>
    </AuthLayout>
  )
}
