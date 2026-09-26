import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Field, Input, Textarea } from '@/components/ui/Input'
import { FormAlert } from '@/features/auth/FormAlert'
import { useSaveWarehouse } from '@/hooks/useWarehouses'
import { applyFieldErrors, errorMessage } from '@/lib/errors'
import type { Warehouse } from '@/types/api'

const schema = z.object({
  name: z.string().trim().min(2, 'At least 2 characters').max(120),
  short_code: z
    .string()
    .trim()
    .min(1, 'Required')
    .max(10, 'Max 10 characters')
    .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, 'Letters, numbers, - and _'),
  address: z.string().max(500),
  is_active: z.boolean(),
})
type Values = z.infer<typeof schema>

export function WarehouseDialog({
  open,
  onOpenChange,
  warehouse,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  warehouse?: Warehouse | null
}) {
  const save = useSaveWarehouse(warehouse?.id)
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    reset,
    setError: setFieldError,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema) })

  useEffect(() => {
    if (open) {
      setError(null)
      reset({
        name: warehouse?.name ?? '',
        short_code: warehouse?.short_code ?? '',
        address: warehouse?.address ?? '',
        is_active: warehouse?.is_active ?? true,
      })
    }
  }, [open, warehouse, reset])

  const onSubmit = handleSubmit(async (v) => {
    setError(null)
    try {
      const saved = await save.mutateAsync({ ...v, short_code: v.short_code.toUpperCase(), address: v.address.trim() || null })
      toast.success(warehouse ? 'Warehouse updated' : `Warehouse ${saved.short_code} created`)
      onOpenChange(false)
    } catch (err) {
      if (!applyFieldErrors(err, setFieldError)) setError(errorMessage(err))
    }
  })

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={warehouse ? 'Edit warehouse' : 'New warehouse'}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" type="submit" form="warehouse-form" loading={save.isPending}>
            {warehouse ? 'Save' : 'Create'}
          </Button>
        </>
      }
    >
      <FormAlert>{error}</FormAlert>
      <form id="warehouse-form" onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-3">
        <Field label="Name" error={errors.name?.message} className="sm:col-span-2">
          <Input autoFocus placeholder="Main Warehouse" {...register('name')} />
        </Field>
        <Field label="Short code" error={errors.short_code?.message} hint="Used in references">
          <Input className="font-mono uppercase" placeholder="WH" {...register('short_code')} />
        </Field>
        <Field label="Address" error={errors.address?.message} className="sm:col-span-3">
          <Textarea rows={2} placeholder="Optional" {...register('address')} />
        </Field>
        <label className="flex items-center gap-2 text-[13px] text-fg sm:col-span-3">
          <input type="checkbox" className="h-4 w-4 rounded border-border accent-[#612D53]" {...register('is_active')} />
          Active
        </label>
      </form>
    </Dialog>
  )
}
