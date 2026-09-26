import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import type { z } from 'zod'
import { Button } from '@/components/ui/Button'
import { Field, Input, PasswordInput } from '@/components/ui/Input'
import { useAuth } from '@/features/auth/AuthProvider'
import { FormAlert } from '@/features/auth/FormAlert'
import { registerSchema } from '@/features/auth/schemas'
import { AuthLayout } from '@/layouts/AuthLayout'
import { applyFieldErrors, errorMessage } from '@/lib/errors'

type Values = z.infer<typeof registerSchema>

export default function Register() {
  const { register: signUp } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setError: setFieldError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(registerSchema),
    defaultValues: { full_name: '', email: '', password: '', confirm: '' },
  })

  const onSubmit = handleSubmit(async (v) => {
    setError(null)
    try {
      await signUp(v.full_name, v.email, v.password)
    } catch (err) {
      if (!applyFieldErrors(err, setFieldError)) setError(errorMessage(err, 'Could not create the account.'))
    }
  })

  return (
    <AuthLayout
      title="Create account"
      subtitle="The first account becomes the workspace manager."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="focus-ring rounded font-medium text-accent hover:text-emphasis">
            Sign in
          </Link>
        </>
      }
    >
      <FormAlert>{error}</FormAlert>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <Field label="Full name" error={errors.full_name?.message}>
          <Input autoComplete="name" autoFocus {...register('full_name')} />
        </Field>
        <Field label="Email" error={errors.email?.message}>
          <Input type="email" autoComplete="email" placeholder="you@company.com" {...register('email')} />
        </Field>
        <Field label="Password" error={errors.password?.message} hint="8+ characters with a letter and a number">
          <PasswordInput autoComplete="new-password" {...register('password')} />
        </Field>
        <Field label="Confirm password" error={errors.confirm?.message}>
          <PasswordInput autoComplete="new-password" {...register('confirm')} />
        </Field>
        <Button type="submit" variant="primary" className="w-full" loading={isSubmitting}>
          Create account
        </Button>
      </form>
    </AuthLayout>
  )
}
