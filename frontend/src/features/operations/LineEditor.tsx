import { AnimatePresence, motion } from 'framer-motion'
import { AlertCircle, Plus, Trash2 } from 'lucide-react'
import { Controller, useFieldArray, useWatch, type Control, type FieldErrors, type UseFormRegister } from 'react-hook-form'
import { ProductPicker } from '@/components/ProductPicker'
import { QtyChange } from '@/components/QtyChange'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { cn, formatQty } from '@/lib/utils'
import type { OperationType, Shortage } from '@/types/api'
import type { OperationFormValues } from './form'

interface Props {
  type: OperationType
  control: Control<OperationFormValues>
  register: UseFormRegister<OperationFormValues>
  errors: FieldErrors<OperationFormValues>
  /** Live on-hand at the relevant location, keyed by product id (null while no location chosen). */
  availability: Map<string, number> | null
  availabilityLoading?: boolean
  shortages?: Shortage[]
  disabled?: boolean
}

const COLS: Record<OperationType, { stockLabel: string | null; qtyLabel: string }> = {
  receipt: { stockLabel: 'On hand', qtyLabel: 'Quantity' },
  delivery: { stockLabel: 'Available', qtyLabel: 'Quantity' },
  transfer: { stockLabel: 'Available', qtyLabel: 'Quantity' },
  adjustment: { stockLabel: 'Current', qtyLabel: 'Counted' },
}

export function LineEditor({ type, control, register, errors, availability, availabilityLoading, shortages = [], disabled }: Props) {
  const { fields, append, remove } = useFieldArray({ control, name: 'lines' })
  const lines = useWatch({ control, name: 'lines' })
  const cols = COLS[type]
  const isMove = type === 'delivery' || type === 'transfer'
  const chosen = (lines ?? []).map((l) => l?.product?.id).filter(Boolean) as string[]

  return (
    <div>
      <div className="hidden grid-cols-[minmax(0,1fr)_110px_130px_110px_40px] gap-3 border-b border-border bg-surface px-5 py-2 text-xs font-medium text-muted md:grid">
        <span>Product</span>
        <span className="text-right">{cols.stockLabel}</span>
        <span className="text-right">{cols.qtyLabel}</span>
        <span className="text-right">{type === 'adjustment' ? 'Difference' : isMove ? 'After move' : 'After receipt'}</span>
        <span className="sr-only">Remove</span>
      </div>
      <ul>
        <AnimatePresence initial={false}>
          {fields.map((field, index) => {
            const line = lines?.[index]
            const productId = line?.product?.id
            const qty = Number(line?.quantity)
            const hasQty = line?.quantity?.trim() !== '' && Number.isFinite(qty)
            const onHand = productId && availability ? availability.get(productId) ?? 0 : null
            const shortage = shortages.find((s) => s.product_id === productId)
            const short = Boolean(shortage) || (isMove && onHand !== null && hasQty && qty > onHand)
            const delta = onHand !== null && hasQty ? (type === 'adjustment' ? qty - onHand : isMove ? -qty : qty) : null
            const lineErrors = errors.lines?.[index]
            const unit = line?.product?.unit_of_measure

            return (
              <motion.li
                key={field.id}
                layout="position"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.18 }}
                className={cn('border-b border-border', short && 'bg-danger-soft/50')}
              >
                <div className="grid grid-cols-[minmax(0,1fr)_40px] items-start gap-3 px-5 py-3 md:grid-cols-[minmax(0,1fr)_110px_130px_110px_40px]">
                  <div className="min-w-0">
                    <Controller
                      control={control}
                      name={`lines.${index}.product`}
                      render={({ field: f }) => (
                        <ProductPicker
                          ref={f.ref}
                          value={f.value}
                          onChange={(p) => f.onChange(p)}
                          excludeIds={chosen}
                          availability={availability ?? undefined}
                          disabled={disabled}
                          aria-label={`Product for line ${index + 1}`}
                          aria-invalid={Boolean(lineErrors?.product) || undefined}
                        />
                      )}
                    />
                    {lineErrors?.product?.message && (
                      <p className="mt-1 text-[12.5px] text-danger" role="alert">
                        {lineErrors.product.message}
                      </p>
                    )}
                  </div>

                  <div className="order-last col-span-2 grid grid-cols-3 gap-3 md:contents">
                    <div className="text-right md:pt-2">
                      <span className="text-xs text-muted md:hidden">{cols.stockLabel} </span>
                      <span className={cn('tabular text-[13px]', short ? 'font-semibold text-danger' : 'text-muted')}>
                        {!productId ? '—' : availabilityLoading ? '…' : onHand === null ? '—' : formatQty(onHand)}
                      </span>
                    </div>
                    <div>
                      <label className="sr-only" htmlFor={`line-${field.id}-qty`}>
                        {cols.qtyLabel} for line {index + 1}
                      </label>
                      <Input
                        id={`line-${field.id}-qty`}
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="any"
                        placeholder="0"
                        disabled={disabled}
                        aria-invalid={Boolean(lineErrors?.quantity) || short || undefined}
                        className="tabular text-right"
                        {...register(`lines.${index}.quantity`)}
                      />
                      {lineErrors?.quantity?.message && (
                        <p className="mt-1 text-right text-[12.5px] text-danger" role="alert">
                          {lineErrors.quantity.message}
                        </p>
                      )}
                    </div>
                    <div className="text-right md:pt-2">
                      {delta === null ? (
                        <span className="text-[13px] text-subtle">—</span>
                      ) : type === 'adjustment' ? (
                        <QtyChange value={delta} className="text-[13px]" />
                      ) : (
                        <span className={cn('tabular text-[13px]', short ? 'text-danger' : 'text-muted')}>
                          {formatQty((onHand ?? 0) + delta)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-end md:pt-0.5">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => remove(index)}
                      disabled={disabled}
                      aria-label={`Remove line ${index + 1}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {short && (
                  <p className="-mt-1 flex items-center gap-1.5 px-5 pb-3 text-[12.5px] text-danger" role="alert">
                    <AlertCircle className="h-3.5 w-3.5" aria-hidden />
                    {shortage
                      ? `Only ${formatQty(shortage.available)} ${unit ?? ''} available — ${formatQty(shortage.requested)} requested`
                      : `Only ${formatQty(onHand)} ${unit ?? ''} available at the source`}
                  </p>
                )}
              </motion.li>
            )
          })}
        </AnimatePresence>
      </ul>
      <div className="px-5 py-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => append({ product: null, quantity: '' })}
          disabled={disabled}
          icon={<Plus className="h-4 w-4" />}
          className="-ml-2 text-accent hover:text-accent"
        >
          Add product
        </Button>
      </div>
    </div>
  )
}
