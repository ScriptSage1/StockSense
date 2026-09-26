import { zodResolver } from '@hookform/resolvers/zod'
import { AnimatePresence, motion } from 'framer-motion'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useLocation } from 'react-router-dom'
import type { z } from 'zod'
import { authApi } from '@/api/endpoints'
import { Button } from '@/components/ui/Button'
import { Field, Input, PasswordInput } from '@/components/ui/Input'
import { useAuth } from '@/features/auth/AuthProvider'
import { FormAlert } from '@/features/auth/FormAlert'
import { OtpStep } from '@/features/auth/OtpStep'
import { loginSchema } from '@/features/auth/schemas'
import { AuthLayout, stepMotion } from '@/layouts/AuthLayout'
import { errorMessage } from '@/lib/errors'
import type { Challenge } from '@/types/api'

type Values = z.infer<typeof loginSchema>

export default function Login() {
  const { login, completeSignIn, sessionExpired } = useAuth()
  const location = useLocation()
  const passwordReset = Boolean((location.state as { passwordReset?: boolean } | null)?.passwordReset)
  const [error, setError] = useState<string | null>(null)
  const [challenge, setChallenge] = useState<Challenge | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } })

  const onSubmit = handleSubmit(async (values) => {
    setError(null)
    try {
      setChallenge(await login(values.email, values.password))
    } catch (err) {
      setError(errorMessage(err, 'Could not sign in. Try again.'))
    }
  })

  // An unconfirmed account finishes sign-up here instead.
  const confirming = challenge?.purpose === 'register'

  return (
    <AuthLayout
      title={challenge ? (confirming ? 'Confirm your email' : 'Check your email') : 'Sign in'}
      subtitle={
        challenge
          ? confirming
            ? 'Your account isn’t confirmed yet. Enter the code to finish.'
            : 'Enter the code to finish signing in.'
          : 'Welcome back to StockSense.'
      }
      footer={
        <>
          New here?{' '}
          <Link to="/register" className="focus-ring rounded font-medium text-accent hover:text-emphasis">
            Create an account
          </Link>
        </>
      }
    >
      <AnimatePresence mode="wait" initial={false}>
        {challenge ? (
          <motion.div key="code" {...stepMotion}>
            <OtpStep
              challenge={challenge}
              onChallengeChange={setChallenge}
              verify={(code) => authApi.verifyChallenge(challenge.challenge_token, code)}
              // RequireGuest then redirects to ?next= (or the dashboard).
              onDone={completeSignIn}
              onBack={() => setChallenge(null)}
              backLabel="Different account"
              submitLabel="Sign in"
              successLabel="Signed in"
            />
          </motion.div>
        ) : (
          <motion.div key="password" {...stepMotion}>
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
          </motion.div>
        )}
      </AnimatePresence>
    </AuthLayout>
  )
}
