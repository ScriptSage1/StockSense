import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { authApi } from '@/api/endpoints'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'
import { FormAlert } from '@/features/auth/FormAlert'
import { email } from '@/features/auth/schemas'
import { AuthLayout } from '@/layouts/AuthLayout'
import { errorMessage } from '@/lib/errors'

const schema = z.object({ email })
type Values = z.infer<typeof schema>

export default function ForgotPassword() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: '' } })

  const onSubmit = handleSubmit(async ({ email: value }) => {
    setError(null)
    try {
      await authApi.forgotPassword(value)
      // Same next step whether or not the account exists (no enumeration).
      navigate('/verify-otp', { state: { email: value } })
    } catch (err) {
      setError(errorMessage(err, 'Could not send a code. Try again.'))
    }
  })

  return (
    <AuthLayout
      title="Reset password"
      subtitle="We'll email you a 6-digit code."
      footer={
        <Link to="/login" className="focus-ring rounded font-medium text-accent hover:text-emphasis">
          Back to sign in
        </Link>
      }
    >
      <FormAlert>{error}</FormAlert>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <Field label="Email" error={errors.email?.message}>
          <Input type="email" autoComplete="email" autoFocus placeholder="you@company.com" {...register('email')} />
        </Field>
        <Button type="submit" variant="primary" className="w-full" loading={isSubmitting}>
          Send code
        </Button>
      </form>
    </AuthLayout>
  )
}
