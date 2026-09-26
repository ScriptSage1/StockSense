import { motion, useAnimationControls, useReducedMotion } from 'framer-motion'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { authApi } from '@/api/endpoints'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'
import { FormAlert } from '@/features/auth/FormAlert'
import { OtpInput } from '@/features/auth/OtpInput'
import { AuthLayout } from '@/layouts/AuthLayout'
import { errorMessage, isApiError } from '@/lib/errors'

const RESEND_SECONDS = 60

export default function VerifyOtp() {
  const navigate = useNavigate()
  const location = useLocation()
  const initialEmail = (location.state as { email?: string } | null)?.email ?? ''
  const reduce = useReducedMotion()
  const shake = useAnimationControls()
  const [email, setEmail] = useState(initialEmail)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(initialEmail ? `If ${initialEmail} has an account, a code is on its way.` : null)
  const [submitting, setSubmitting] = useState(false)
  const [resending, setResending] = useState(false)
  const [cooldown, setCooldown] = useState(initialEmail ? RESEND_SECONDS : 0)
  const [mustResend, setMustResend] = useState(false)

  useEffect(() => {
    if (cooldown <= 0) return
    const id = window.setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => window.clearTimeout(id)
  }, [cooldown])

  const verify = async (otp: string) => {
    if (submitting) return
    if (!email) {
      setError('Enter your email')
      return
    }
    if (!/^\d{6}$/.test(otp)) {
      setError('Enter the 6-digit code')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const { reset_token } = await authApi.verifyOtp(email, otp)
      // The reset token is kept in router state (memory) — never in the URL or storage.
      navigate('/reset-password', { replace: true, state: { resetToken: reset_token } })
    } catch (err) {
      setError(errorMessage(err, 'Could not verify the code.'))
      if (!reduce) void shake.start({ x: [0, -9, 9, -6, 6, -3, 0], transition: { duration: 0.42 } })
      if (isApiError(err, 'OTP_EXPIRED') || isApiError(err, 'OTP_MAX_ATTEMPTS')) setMustResend(true)
      setCode('')
    } finally {
      setSubmitting(false)
    }
  }

  const resend = async () => {
    if (!email) {
      setError('Enter your email')
      return
    }
    setResending(true)
    setError(null)
    try {
      await authApi.forgotPassword(email)
      setNotice('A new code is on its way.')
      setMustResend(false)
      setCooldown(RESEND_SECONDS)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setResending(false)
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    void verify(code)
  }

  return (
    <AuthLayout
      title="Enter code"
      subtitle="Codes expire after 10 minutes."
      footer={
        <Link to="/login" className="focus-ring rounded font-medium text-accent hover:text-emphasis">
          Back to sign in
        </Link>
      }
    >
      <FormAlert tone="success">{!error ? notice : null}</FormAlert>
      <FormAlert>{error}</FormAlert>
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        {!initialEmail && (
          <Field label="Email">
            <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
        )}
        <motion.div animate={shake}>
          <OtpInput
            value={code}
            onChange={setCode}
            invalid={Boolean(error)}
            disabled={submitting || mustResend}
            onComplete={(v) => void verify(v)}
          />
        </motion.div>
        <Button type="submit" variant="primary" className="w-full" loading={submitting} disabled={mustResend}>
          Verify
        </Button>
        <div className="flex items-center justify-center gap-1 text-[13px] text-muted">
          Didn't get it?
          <button
            type="button"
            onClick={resend}
            disabled={cooldown > 0 || resending}
            className="focus-ring rounded font-medium text-accent hover:text-emphasis disabled:cursor-not-allowed disabled:text-subtle"
          >
            {cooldown > 0 ? `Resend in ${cooldown}s` : resending ? 'Sending…' : 'Resend code'}
          </button>
        </div>
      </form>
    </AuthLayout>
  )
}
