import { zodResolver } from '@hookform/resolvers/zod'
import { AlertTriangle, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { z } from 'zod'
import { LocationSelect } from '@/components/LocationSelect'
import { PageLoader } from '@/components/PageLoader'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field, Input, Select } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/PageHeader'
import { FormAlert } from '@/features/auth/FormAlert'
import { CategoryDialog } from '@/features/products/CategoryDialog'
import { useCategories, useCreateProduct, useProduct, useUpdateProduct } from '@/hooks/useProducts'
import { applyFieldErrors, errorMessage } from '@/lib/errors'
import type { ProductInput } from '@/types/api'

const nonNegative = (msg: string) =>
  z.string().trim().refine((v) => v === '' || (Number.isFinite(Number(v)) && Number(v) >= 0), msg)

const schema = z
  .object({
    name: z.string().trim().min(1, 'Enter a name').max(160),
    sku: z
      .string()
      .trim()
      .min(1, 'Enter a SKU')
      .max(64)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/, 'Use letters, numbers and . _ / -'),
    category_id: z.string(),
    unit_of_measure: z.string().trim().min(1, 'Enter a unit').max(20),
    reorder_point: nonNegative('Enter 0 or more'),
    initial_location_id: z.string(),
    initial_quantity: nonNegative('Enter 0 or more'),
  })
  .superRefine((v, ctx) => {
    if (v.initial_quantity && Number(v.initial_quantity) > 0 && !v.initial_location_id) {
      ctx.addIssue({ code: 'custom', path: ['initial_location_id'], message: 'Choose where the stock is' })
    }
  })

type Values = z.infer<typeof schema>

const UNITS = ['unit', 'pcs', 'box', 'kg', 'g', 'l', 'ml', 'm', 'sheet', 'pack', 'pallet']

const FIELD_MAP: Record<string, string> = {
  'initial_stock.location_id': 'initial_location_id',
  'initial_stock.quantity': 'initial_quantity',
}

export default function ProductFormPage() {
  const { id } = useParams()
  const editing = Boolean(id)
  const navigate = useNavigate()
  const { data: product, isLoading, isError, error: loadError } = useProduct(id)
  const { data: categories } = useCategories()
  const create = useCreateProduct()
  const update = useUpdateProduct(id ?? '')
  const [catOpen, setCatOpen] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      sku: '',
      category_id: '',
      unit_of_measure: 'unit',
      reorder_point: '',
      initial_location_id: '',
      initial_quantity: '',
    },
  })
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = form

  useEffect(() => {
    if (product) {
      reset({
        name: product.name,
        sku: product.sku,
        category_id: product.category?.id ?? '',
        unit_of_measure: product.unit_of_measure,
        reorder_point: product.reorder_point === null ? '' : String(product.reorder_point),
        initial_location_id: '',
        initial_quantity: '',
      })
    }
  }, [product, reset])

  if (editing && isLoading) return <PageLoader />
  if (editing && isError) {
    return <EmptyState icon={AlertTriangle} title="Couldn't load product" description={errorMessage(loadError)} />
  }

  const onSubmit = handleSubmit(async (v) => {
    setFormError(null)
    const body: ProductInput = {
      name: v.name,
      sku: v.sku.toUpperCase(),
      category_id: v.category_id || null,
      unit_of_measure: v.unit_of_measure,
    }
    if (v.reorder_point !== '') body.reorder_point = Number(v.reorder_point)
    else if (editing && product?.reorder_point !== null) body.clear_reorder_point = true
    try {
      if (editing && id) {
        const saved = await update.mutateAsync(body)
        toast.success('Product updated')
        navigate(`/products/${saved.id}`)
      } else {
        if (v.initial_quantity && Number(v.initial_quantity) > 0) {
          body.initial_stock = { location_id: v.initial_location_id, quantity: Number(v.initial_quantity) }
        }
        const saved = await create.mutateAsync(body)
        toast.success('Product created', { description: `${saved.sku} · ${saved.name}` })
        navigate(`/products/${saved.id}`)
      }
    } catch (err) {
      const applied = applyFieldErrors(err, setError, (f) => FIELD_MAP[f] ?? (f in schema.innerType().shape ? f : null))
      if (!applied) setFormError(errorMessage(err, 'Could not save the product.'))
    }
  })

  return (
    <>
      <PageHeader
        crumbs={[
          { label: 'Products', to: '/products' },
          ...(editing && product ? [{ label: product.sku, to: `/products/${product.id}` }] : []),
          { label: editing ? 'Edit' : 'New' },
        ]}
        title={editing ? 'Edit product' : 'New product'}
      />
      <form onSubmit={onSubmit} noValidate className="max-w-3xl">
        <FormAlert>{formError}</FormAlert>
        <Card className="divide-y divide-border">
          <section className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Name" error={errors.name?.message} className="sm:col-span-2">
              <Input autoFocus={!editing} placeholder="e.g. Steel rod 12mm" {...register('name')} />
            </Field>
            <Field label="SKU / code" error={errors.sku?.message} hint="Unique. Stored in upper case.">
              <Input className="font-mono uppercase" placeholder="STL-ROD-12" {...register('sku')} />
            </Field>
            <Field
              label="Category"
              error={errors.category_id?.message}
              labelAction={
                <button
                  type="button"
                  onClick={() => setCatOpen(true)}
                  className="focus-ring inline-flex items-center gap-1 rounded text-[12.5px] font-medium text-accent hover:text-emphasis"
                >
                  <Plus className="h-3.5 w-3.5" /> New
                </button>
              }
            >
              <Select {...register('category_id')}>
                <option value="">Uncategorised</option>
                {categories?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Unit of measure" error={errors.unit_of_measure?.message}>
              <Input list="uom-options" {...register('unit_of_measure')} />
            </Field>
            <datalist id="uom-options">
              {UNITS.map((u) => (
                <option key={u} value={u} />
              ))}
            </datalist>
            <Field label="Reorder point" error={errors.reorder_point?.message} hint="Alert when total on hand falls to this level.">
              <Input type="number" inputMode="decimal" min={0} step="any" placeholder="Optional" {...register('reorder_point')} />
            </Field>
          </section>

          {!editing && (
            <section className="p-5">
              <h2 className="text-sm font-semibold text-fg">Initial stock</h2>
              <p className="mt-0.5 text-[13px] text-muted">Optional. Recorded as an adjustment in the ledger.</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label="Location" error={errors.initial_location_id?.message}>
                  <LocationSelect placeholder="Select location" {...register('initial_location_id')} />
                </Field>
                <Field label="Quantity" error={errors.initial_quantity?.message}>
                  <Input type="number" inputMode="decimal" min={0} step="any" placeholder="0" {...register('initial_quantity')} />
                </Field>
              </div>
            </section>
          )}

          <div className="flex justify-end gap-2 bg-surface/60 px-5 py-3">
            <Button onClick={() => navigate(editing && id ? `/products/${id}` : '/products')}>Cancel</Button>
            <Button type="submit" variant="primary" loading={isSubmitting} disabled={editing && !isDirty}>
              {editing ? 'Save changes' : 'Create product'}
            </Button>
          </div>
        </Card>
      </form>
      <CategoryDialog
        open={catOpen}
        onOpenChange={setCatOpen}
        onCreated={(cat) => {
          // Wait one frame so the new <option> exists before selecting it.
          window.setTimeout(() => setValue('category_id', cat.id, { shouldDirty: true }), 0)
        }}
      />
    </>
  )
}
