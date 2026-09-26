import { motion, useAnimationControls, useReducedMotion } from 'framer-motion'
import { ArrowLeft, MailCheck } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { authApi } from '@/api/endpoints'
import { Button } from '@/components/ui/Button'
import { FormAlert } from '@/features/auth/FormAlert'
import { OtpInput } from '@/features/auth/OtpInput'
import { errorMessage, isApiError } from '@/lib/errors'
import type { Challenge } from '@/types/api'

/** Seconds left from `seconds`, restarting whenever `key` changes. */
export function useCountdown(seconds: number, key: unknown): number {
  const [left, setLeft] = useState(seconds)
  useEffect(() => {
    setLeft(seconds)
    const started = Date.now()
    const id = window.setInterval(() => {
      const remaining = Math.max(0, seconds - Math.floor((Date.now() - started) / 1000))
      setLeft(remaining)
      if (remaining === 0) window.clearInterval(id)
    }, 1000)
    return () => window.clearInterval(id)
  }, [seconds, key])
  return left
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

/** A check mark that draws itself. */
export function SuccessCheck({ label }: { label: string }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="flex flex-col items-center py-6 text-center"
      role="status"
    >
      <span className="relative flex h-16 w-16 items-center justify-center">
        {!reduce && (
          <motion.span
            className="absolute inset-0 rounded-full bg-success/20"
            initial={{ scale: 0.6, opacity: 0.8 }}
            animate={{ scale: 1.6, opacity: 0 }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            aria-hidden
          />
        )}
        <svg viewBox="0 0 52 52" className="h-16 w-16 text-success" aria-hidden>
          <motion.circle
            cx="26" cy="26" r="24" fill="none" stroke="currentColor" strokeWidth="2.5"
            initial={reduce ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          />
          <motion.path
            d="M15 27 l7 7 l15 -16" fill="none" stroke="currentColor" strokeWidth="3.5"
            strokeLinecap="round" strokeLinejoin="round"
            initial={reduce ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.3, delay: 0.3, ease: 'easeOut' }}
          />
        </svg>
      </span>
      <p className="mt-3 text-sm font-medium text-fg">{label}</p>
    </motion.div>
  )
}

/**
 * The second step of sign-in, sign-up and password change: enter the emailed code.
 * `verify` performs the API call; `onDone` receives its result after the success animation.
 */
export function OtpStep<T>({
  challenge,
  onChallengeChange,
  verify,
  onDone,
  onBack,
  backLabel = 'Back',
  submitLabel = 'Verify',
  successLabel = 'Verified',
}: {
  challenge: Challenge
  onChallengeChange: (next: Challenge) => void
  verify: (code: string) => Promise<T>
  onDone: (result: T) => void
  onBack?: () => void
  backLabel?: string
  submitLabel?: string
  successLabel?: string
}) {
  const reduce = useReducedMotion()
  const shake = useAnimationControls()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [phase, setPhase] = useState<'idle' | 'verifying' | 'success'>('idle')
  const [mustResend, setMustResend] = useState(false)
  const [expired, setExpired] = useState(false)
  const [resending, setResending] = useState(false)
  const cooldown = useCountdown(challenge.resend_after, challenge.challenge_token)
  const validFor = useCountdown(challenge.expires_in, challenge.challenge_token)
  const done = useRef<number>()

  useEffect(() => () => window.clearTimeout(done.current), [])
  useEffect(() => {
    if (validFor === 0 && phase === 'idle') setMustResend(true)
  }, [validFor, phase])

  const fail = (message: string) => {
    setError(message)
    setCode('')
    if (!reduce) void shake.start({ x: [0, -9, 9, -6, 6, -3, 0], transition: { duration: 0.42 } })
  }

  const submit = async (value: string) => {
    if (phase !== 'idle' || mustResend) return
    if (!/^\d{6}$/.test(value)) {
      fail('Enter the 6-digit code')
      return
    }
    setPhase('verifying')
    setError(null)
    try {
      const result = await verify(value)
      setCode(value)
      setPhase('success')
      done.current = window.setTimeout(() => onDone(result), reduce ? 0 : 900)
    } catch (err) {
      setPhase('idle')
      fail(errorMessage(err, 'Could not verify the code.'))
      if (isApiError(err, 'OTP_EXPIRED') || isApiError(err, 'OTP_MAX_ATTEMPTS')) setMustResend(true)
      if (isApiError(err, 'CHALLENGE_INVALID')) setExpired(true)
    }
  }

  const resend = async () => {
    setResending(true)
    setError(null)
    try {
      const next = await authApi.resendChallenge(challenge.challenge_token)
      onChallengeChange(next)
      setNotice('A new code is on its way.')
      setMustResend(false)
      setCode('')
    } catch (err) {
      setError(errorMessage(err))
      if (isApiError(err, 'CHALLENGE_INVALID')) setExpired(true)
    } finally {
      setResending(false)
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    void submit(code)
  }

  if (phase === 'success') {
    return (
      <div>
        <OtpInput value={code} onChange={() => undefined} success disabled />
        <SuccessCheck label={successLabel} />
      </div>
    )
  }

  return (
    <div>
      <div className="mb-5 flex items-center gap-3 rounded-lg border border-border bg-surface px-3.5 py-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent motion-safe:animate-float">
          <MailCheck className="h-[18px] w-[18px]" aria-hidden />
        </span>
        <p className="min-w-0 text-[13px] text-muted">
          We sent a 6-digit code to <span className="break-words font-medium text-fg">{challenge.email}</span>
        </p>
      </div>

      <FormAlert tone="success">{!error ? notice : null}</FormAlert>
      <FormAlert>{error}</FormAlert>

      <form onSubmit={onSubmit} noValidate className="space-y-5">
        <motion.div animate={shake}>
          <OtpInput
            value={code}
            onChange={(v) => {
              setCode(v)
              if (error) setError(null)
            }}
            invalid={Boolean(error)}
            disabled={phase !== 'idle' || mustResend || expired}
            onComplete={(v) => void submit(v)}
          />
        </motion.div>

        <p className="text-center text-xs text-subtle" aria-live="polite">
          {expired
            ? 'This step has expired.'
            : mustResend
              ? 'This code can no longer be used. Request a new one.'
              : `Code expires in ${mmss(validFor)}`}
        </p>

        {expired ? (
          onBack && (
            <Button type="button" variant="primary" className="w-full" onClick={onBack}>
              Start again
            </Button>
          )
        ) : (
          <Button type="submit" variant="primary" className="w-full" loading={phase === 'verifying'} disabled={mustResend}>
            {submitLabel}
          </Button>
        )}

        <div className="flex items-center justify-between gap-2 text-[13px] text-muted">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="focus-ring group inline-flex items-center gap-1 rounded hover:text-fg"
            >
              <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" aria-hidden />
              {backLabel}
            </button>
          ) : (
            <span />
          )}
          {!expired && (
            <button
              type="button"
              onClick={resend}
              disabled={cooldown > 0 || resending}
              className="focus-ring rounded font-medium text-accent hover:text-emphasis disabled:cursor-not-allowed disabled:text-subtle"
            >
              {cooldown > 0 ? `Resend in ${cooldown}s` : resending ? 'Sending…' : 'Resend code'}
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
