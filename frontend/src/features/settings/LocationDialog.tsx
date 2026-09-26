import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Field, Input, Select } from '@/components/ui/Input'
import { FormAlert } from '@/features/auth/FormAlert'
import { useSaveLocation, useWarehouses } from '@/hooks/useWarehouses'
import { applyFieldErrors, errorMessage } from '@/lib/errors'
import type { Location } from '@/types/api'

const schema = z.object({
  name: z.string().trim().min(1, 'Required').max(120),
  short_code: z
    .string()
    .trim()
    .min(1, 'Required')
    .max(20, 'Max 20 characters')
    .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, 'Letters, numbers, - and _'),
  warehouse_id: z.string().min(1, 'Choose a warehouse'),
  is_active: z.boolean(),
})
type Values = z.infer<typeof schema>

export function LocationDialog({
  open,
  onOpenChange,
  location,
  defaultWarehouseId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  location?: Location | null
  defaultWarehouseId?: string
}) {
  const { data: warehouses } = useWarehouses()
  const save = useSaveLocation(location?.id)
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
        name: location?.name ?? '',
        short_code: location?.short_code ?? '',
        warehouse_id: location?.warehouse_id ?? defaultWarehouseId ?? '',
        is_active: location?.is_active ?? true,
      })
    }
  }, [open, location, defaultWarehouseId, reset])

  const onSubmit = handleSubmit(async (v) => {
    setError(null)
    try {
      const saved = await save.mutateAsync({ ...v, short_code: v.short_code.toUpperCase() })
      toast.success(location ? 'Location updated' : `Location ${saved.full_code} created`)
      onOpenChange(false)
    } catch (err) {
      if (!applyFieldErrors(err, setFieldError)) setError(errorMessage(err))
    }
  })

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={location ? 'Edit location' : 'New location'}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" type="submit" form="location-form" loading={save.isPending}>
            {location ? 'Save' : 'Create'}
          </Button>
        </>
      }
    >
      <FormAlert>{error}</FormAlert>
      <form id="location-form" onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-3">
        <Field label="Name" error={errors.name?.message} className="sm:col-span-2">
          <Input autoFocus placeholder="Rack A" {...register('name')} />
        </Field>
        <Field label="Short code" error={errors.short_code?.message}>
          <Input className="font-mono uppercase" placeholder="RACK-A" {...register('short_code')} />
        </Field>
        <Field label="Warehouse" error={errors.warehouse_id?.message} className="sm:col-span-3">
          <Select {...register('warehouse_id')}>
            <option value="">Select warehouse</option>
            {warehouses?.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} ({w.short_code})
              </option>
            ))}
          </Select>
        </Field>
        <label className="flex items-center gap-2 text-[13px] text-fg sm:col-span-3">
          <input type="checkbox" className="h-4 w-4 rounded border-border accent-[#612D53]" {...register('is_active')} />
          Active
        </label>
      </form>
    </Dialog>
  )
}
