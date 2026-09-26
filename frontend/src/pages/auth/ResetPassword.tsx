import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import type { z } from 'zod'
import { authApi } from '@/api/endpoints'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Field, PasswordInput } from '@/components/ui/Input'
import { FormAlert } from '@/features/auth/FormAlert'
import { resetSchema } from '@/features/auth/schemas'
import { AuthLayout } from '@/layouts/AuthLayout'
import { errorMessage } from '@/lib/errors'

type Values = z.infer<typeof resetSchema>

export default function ResetPassword() {
  const navigate = useNavigate()
  const location = useLocation()
  const resetToken = (location.state as { resetToken?: string } | null)?.resetToken
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(resetSchema), defaultValues: { password: '', confirm: '' } })

  if (!resetToken) {
    return (
      <AuthLayout title="Reset password" subtitle="This step needs a verified code.">
        <ButtonLink to="/forgot-password" variant="primary" className="w-full">
          Start again
        </ButtonLink>
      </AuthLayout>
    )
  }

  const onSubmit = handleSubmit(async (v) => {
    setError(null)
    try {
      await authApi.resetPassword(resetToken, v.password)
      navigate('/login', { replace: true, state: { passwordReset: true } })
    } catch (err) {
      setError(errorMessage(err, 'Could not reset the password.'))
    }
  })

  return (
    <AuthLayout
      title="Choose a new password"
      subtitle="You'll be signed out on other devices."
      footer={
        <Link to="/login" className="focus-ring rounded font-medium text-accent hover:text-emphasis">
          Back to sign in
        </Link>
      }
    >
      <FormAlert>{error}</FormAlert>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <Field label="New password" error={errors.password?.message} hint="8+ characters with a letter and a number">
          <PasswordInput autoComplete="new-password" autoFocus {...register('password')} />
        </Field>
        <Field label="Confirm password" error={errors.confirm?.message}>
          <PasswordInput autoComplete="new-password" {...register('confirm')} />
        </Field>
        <Button type="submit" variant="primary" className="w-full" loading={isSubmitting}>
          Update password
        </Button>
      </form>
    </AuthLayout>
  )
}
