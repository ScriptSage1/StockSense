import { zodResolver } from '@hookform/resolvers/zod'
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { usersApi } from '@/api/endpoints'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { Field, Input, PasswordInput } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/PageHeader'
import { useAuth } from '@/features/auth/AuthProvider'
import { FormAlert } from '@/features/auth/FormAlert'
import { OtpStep } from '@/features/auth/OtpStep'
import { newPassword } from '@/features/auth/schemas'
import { stepMotion } from '@/layouts/AuthLayout'
import { applyFieldErrors, errorMessage } from '@/lib/errors'
import { formatDate, initials } from '@/lib/utils'
import type { Challenge } from '@/types/api'

const nameSchema = z.object({ full_name: z.string().trim().min(2, 'At least 2 characters').max(120) })
const passwordSchema = z
  .object({ current_password: z.string().min(1, 'Enter your current password'), new_password: newPassword, confirm: z.string() })
  .refine((v) => v.new_password === v.confirm, { path: ['confirm'], message: "Passwords don't match" })

export default function Profile() {
  const { user, setUser } = useAuth()
  const [nameError, setNameError] = useState<string | null>(null)
  const [pwError, setPwError] = useState<string | null>(null)
  // Step 2 of a password change: the emailed code. The new password waits here in memory only.
  const [pending, setPending] = useState<{ challenge: Challenge; newPassword: string } | null>(null)

  const nameForm = useForm<z.infer<typeof nameSchema>>({ resolver: zodResolver(nameSchema), defaultValues: { full_name: user?.full_name ?? '' } })
  const pwForm = useForm<z.infer<typeof passwordSchema>>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { current_password: '', new_password: '', confirm: '' },
  })

  useEffect(() => {
    if (user) nameForm.reset({ full_name: user.full_name })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.full_name])

  if (!user) return null

  const saveName = nameForm.handleSubmit(async (v) => {
    setNameError(null)
    try {
      const updated = await usersApi.updateMe({ full_name: v.full_name })
      setUser(updated)
      toast.success('Profile updated')
    } catch (err) {
      if (!applyFieldErrors(err, nameForm.setError)) setNameError(errorMessage(err))
    }
  })

  const savePassword = pwForm.handleSubmit(async (v) => {
    setPwError(null)
    try {
      const challenge = await usersApi.startPasswordChange(v.current_password)
      setPending({ challenge, newPassword: v.new_password })
    } catch (err) {
      if (!applyFieldErrors(err, pwForm.setError)) setPwError(errorMessage(err))
    }
  })

  const passwordChanged = () => {
    setPending(null)
    pwForm.reset()
    toast.success('Password changed', { description: 'Other sessions were signed out.' })
  }

  return (
    <>
      <PageHeader title="My profile" />
      <div className="grid max-w-4xl gap-6 lg:grid-cols-3">
        <Card className="p-5 lg:row-span-2">
          <div className="flex flex-col items-center text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-charcoal text-lg font-semibold text-white">
              {initials(user.full_name)}
            </span>
            <p className="mt-3 font-medium text-fg">{user.full_name}</p>
            <p className="text-[13px] text-muted">{user.email}</p>
            <Badge tone="accent" className="mt-3 capitalize">
              {user.role}
            </Badge>
          </div>
          <dl className="mt-6 space-y-2 border-t border-border pt-4 text-[13px]">
            <div className="flex justify-between">
              <dt className="text-muted">Member since</dt>
              <dd>{formatDate(user.created_at)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Access</dt>
              <dd>{user.role === 'manager' ? 'Full' : 'Operations'}</dd>
            </div>
          </dl>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Details" />
          <form onSubmit={saveName} noValidate className="space-y-4 p-5">
            <FormAlert>{nameError}</FormAlert>
            <Field label="Full name" error={nameForm.formState.errors.full_name?.message}>
              <Input autoComplete="name" {...nameForm.register('full_name')} />
            </Field>
            <Field label="Email" hint="Contact a manager to change your email.">
              <Input value={user.email} disabled readOnly />
            </Field>
            <div className="flex justify-end">
              <Button type="submit" variant="primary" loading={nameForm.formState.isSubmitting} disabled={!nameForm.formState.isDirty}>
                Save
              </Button>
            </div>
          </form>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title="Password"
            description={
              pending
                ? 'Enter the code we emailed you to confirm the change.'
                : 'Changing it needs a code from your email and signs out your other sessions.'
            }
          />
          <AnimatePresence mode="wait" initial={false}>
          {pending ? (
            <motion.div key="code" {...stepMotion} className="p-5">
              <div className="mx-auto max-w-sm">
                <OtpStep
                  challenge={pending.challenge}
                  onChallengeChange={(challenge) => setPending((p) => (p ? { ...p, challenge } : p))}
                  verify={(otp) =>
                    usersApi.confirmPasswordChange({
                      challenge_token: pending.challenge.challenge_token,
                      otp,
                      new_password: pending.newPassword,
                    })
                  }
                  onDone={passwordChanged}
                  onBack={() => setPending(null)}
                  backLabel="Cancel"
                  submitLabel="Confirm change"
                  successLabel="Password changed"
                />
              </div>
            </motion.div>
          ) : (
          <motion.form key="form" {...stepMotion} onSubmit={savePassword} noValidate className="grid gap-4 p-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <FormAlert>{pwError}</FormAlert>
            </div>
            <Field label="Current password" error={pwForm.formState.errors.current_password?.message} className="sm:col-span-2">
              <PasswordInput autoComplete="current-password" {...pwForm.register('current_password')} />
            </Field>
            <Field label="New password" error={pwForm.formState.errors.new_password?.message}>
              <PasswordInput autoComplete="new-password" {...pwForm.register('new_password')} />
            </Field>
            <Field label="Confirm new password" error={pwForm.formState.errors.confirm?.message}>
              <PasswordInput autoComplete="new-password" {...pwForm.register('confirm')} />
            </Field>
            <div className="flex justify-end sm:col-span-2">
              <Button type="submit" variant="primary" loading={pwForm.formState.isSubmitting}>
                Send code
              </Button>
            </div>
          </motion.form>
          )}
          </AnimatePresence>
        </Card>
      </div>
    </>
  )
}
