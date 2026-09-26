import { zodResolver } from '@hookform/resolvers/zod'
import { AlertTriangle, ArrowRight, Ban, CheckCircle2, History, Printer, Save } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { LocationSelect } from '@/components/LocationSelect'
import { PageLoader } from '@/components/PageLoader'
import { StatusBadge } from '@/components/StatusBadge'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/Dialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field, Input, Textarea } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/PageHeader'
import { Tooltip } from '@/components/ui/Tooltip'
import { useAuth } from '@/features/auth/AuthProvider'
import { FormAlert } from '@/features/auth/FormAlert'
import { OPEN_STATUSES, OPERATION_TYPES, TYPE_BY_SLUG, operationPath } from '@/features/operations/config'
import {
  emptyValues,
  operationSchema,
  serverFieldMapper,
  toFormValues,
  toPayload,
  type OperationFormValues,
} from '@/features/operations/form'
import { LineEditor } from '@/features/operations/LineEditor'
import { LinesReadonly } from '@/features/operations/LinesReadonly'
import { StatusStepper } from '@/features/operations/StatusStepper'
import {
  useCancelOperation,
  useCreateOperation,
  useOperation,
  useUpdateOperation,
  useValidateOperation,
} from '@/hooks/useOperations'
import { useProduct } from '@/hooks/useProducts'
import { useLocationStock } from '@/hooks/useWarehouses'
import { applyFieldErrors, errorMessage, isApiError } from '@/lib/errors'
import { formatDate, formatDateTime, todayIso } from '@/lib/utils'
import type { Operation, OperationType, Shortage } from '@/types/api'

export default function OperationPage() {
  const { typeSlug = '', id } = useParams()
  const type = TYPE_BY_SLUG[typeSlug]
  const query = useOperation(id)

  if (!type) return <Navigate to="/operations/receipts" replace />
  if (id) {
    if (query.isLoading) return <PageLoader />
    if (query.isError || !query.data) {
      return (
        <EmptyState
          icon={AlertTriangle}
          title="Operation unavailable"
          description={errorMessage(query.error)}
          action={<ButtonLink to={operationPath(type)}>Back to list</ButtonLink>}
        />
      )
    }
    if (query.data.type !== type) return <Navigate to={operationPath(query.data.type, query.data.id)} replace />
    return <OperationEditor key={query.data.id} type={type} op={query.data} />
  }
  return <OperationEditor key="new" type={type} op={null} />
}

function OperationEditor({ type, op }: { type: OperationType; op: Operation | null }) {
  const cfg = OPERATION_TYPES[type]
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { isManager } = useAuth()
  const prefillId = !op ? params.get('product') ?? undefined : undefined
  const { data: prefill } = useProduct(prefillId)

  const editable = !op || OPEN_STATUSES.includes(op.status)
  const create = useCreateOperation()
  const update = useUpdateOperation(op?.id ?? '')
  const validate = useValidateOperation(op?.id ?? '')
  const cancel = useCancelOperation(op?.id ?? '')

  const [formError, setFormError] = useState<string | null>(null)
  const [shortages, setShortages] = useState<Shortage[]>([])
  const [confirm, setConfirm] = useState<'validate' | 'cancel' | null>(null)

  const schema = useMemo(() => operationSchema(type), [type])
  const form = useForm<OperationFormValues>({
    resolver: zodResolver(schema),
    defaultValues: op ? toFormValues(op) : { ...emptyValues(), scheduled_date: todayIso() },
  })
  const {
    control,
    register,
    handleSubmit,
    reset,
    setError,
    setValue,
    getValues,
    formState: { errors, isDirty },
  } = form

  // Server state is authoritative: re-sync the form whenever the operation changes.
  // Keyed on updated_at/status so background refetches of an unchanged record don't wipe edits.
  const version = op ? `${op.updated_at}|${op.status}` : null
  const opRef = useRef(op)
  opRef.current = op
  useEffect(() => {
    if (opRef.current) reset(toFormValues(opRef.current))
  }, [version, reset])

  // Prefill a line from ?product= when creating.
  useEffect(() => {
    if (!op && prefill && getValues('lines').every((l) => !l.product)) {
      setValue('lines', [{ product: { id: prefill.id, name: prefill.name, sku: prefill.sku, unit_of_measure: prefill.unit_of_measure }, quantity: '' }])
    }
  }, [op, prefill, getValues, setValue])

  // Warn before leaving with unsaved edits.
  useEffect(() => {
    if (!isDirty || !editable) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty, editable])

  const sourceId = useWatch({ control, name: 'source_location_id' })
  const destId = useWatch({ control, name: 'destination_location_id' })
  const stockLocation = type === 'delivery' || type === 'transfer' ? sourceId : destId
  const stock = useLocationStock(editable ? stockLocation || null : null, true)
  const availability = useMemo(() => {
    if (!stockLocation || !stock.data) return null
    return new Map<string, number>(stock.data.items.map((i) => [i.product_id, i.quantity] as [string, number]))
  }, [stockLocation, stock.data])

  const busy = create.isPending || update.isPending || validate.isPending || cancel.isPending

  const handleServerError = (err: unknown, values: OperationFormValues) => {
    if (isApiError(err, 'INSUFFICIENT_STOCK')) {
      setShortages(err.body.shortages ?? [])
      setFormError(errorMessage(err))
      return
    }
    const applied = applyFieldErrors(err, setError, serverFieldMapper(values))
    if (!applied || (isApiError(err) && err.status !== 422)) setFormError(errorMessage(err))
  }

  /** Persists the form (create or update). Returns the saved operation, or null on failure. */
  const persist = async (values: OperationFormValues): Promise<Operation | null> => {
    setFormError(null)
    setShortages([])
    const payload = toPayload(type, values)
    try {
      if (!op) {
        const created = await create.mutateAsync({ ...payload, type })
        toast.success(`${created.reference} created`)
        navigate(operationPath(type, created.id), { replace: true })
        return created
      }
      if (!isDirty) return op
      const saved = await update.mutateAsync(payload)
      return saved
    } catch (err) {
      handleServerError(err, values)
      return null
    }
  }

  const onSave = handleSubmit(async (values) => {
    const saved = await persist(values)
    if (saved && op) toast.success('Changes saved')
  })

  const runValidate = handleSubmit(async (values) => {
    setConfirm(null)
    const saved = await persist(values)
    if (!saved || !op) return
    try {
      const res = await validate.mutateAsync()
      toast.success(`${res.operation.reference} validated`, {
        description: `${res.ledger_entries.length} stock move${res.ledger_entries.length === 1 ? '' : 's'} recorded`,
      })
    } catch (err) {
      handleServerError(err, values)
    }
  })

  const runCancel = async () => {
    try {
      const res = await cancel.mutateAsync()
      toast.success(`${res.reference} canceled`)
      setConfirm(null)
    } catch (err) {
      setConfirm(null)
      toast.error(errorMessage(err))
    }
  }

  const needsManager = type === 'adjustment' && !isManager
  const lineCount = op?.lines.length ?? 0

  return (
    <>
      <PageHeader
        crumbs={[{ label: cfg.plural, to: operationPath(type) }, { label: op ? op.reference : 'New' }]}
        title={op ? <span className="font-mono tracking-normal">{op.reference}</span> : `New ${cfg.label.toLowerCase()}`}
        meta={op && <StatusBadge status={op.status} />}
        actions={
          <>
            {op && (
              <Button variant="ghost" size="icon" aria-label="Print" onClick={() => window.print()}>
                <Printer className="h-4 w-4" />
              </Button>
            )}
            {op && editable && isManager && (
              <Button onClick={() => setConfirm('cancel')} disabled={busy} icon={<Ban className="h-4 w-4" />}>
                Cancel
              </Button>
            )}
            {editable && (
              <Button
                variant={op ? 'secondary' : 'primary'}
                onClick={onSave}
                loading={create.isPending || (update.isPending && !validate.isPending)}
                disabled={busy || (Boolean(op) && !isDirty)}
                icon={<Save className="h-4 w-4" />}
              >
                {op ? 'Save' : 'Save draft'}
              </Button>
            )}
            {op && editable && (
              <Tooltip content="Manager approval required" disabled={!needsManager}>
                <span tabIndex={needsManager ? 0 : undefined}>
                  <Button
                    variant="primary"
                    onClick={() => setConfirm('validate')}
                    loading={validate.isPending}
                    disabled={busy || needsManager}
                    icon={<CheckCircle2 className="h-4 w-4" />}
                  >
                    Validate
                  </Button>
                </span>
              </Tooltip>
            )}
            {op?.status === 'done' && (
              <ButtonLink to={`/history?operation=${op.id}&ref=${encodeURIComponent(op.reference)}`} icon={<History className="h-4 w-4" />}>
                Stock moves
              </ButtonLink>
            )}
          </>
        }
      />

      {/* Vertical padding (cancelled by negative margin) leaves room for the Done burst. */}
      <div className="no-print -my-5 mb-0 overflow-x-auto py-5">
        <StatusStepper type={type} status={op ? op.status : 'new'} />
      </div>

      <FormAlert>{formError}</FormAlert>

      {op?.status === 'done' && (
        <FormAlert tone="success">
          Validated by {op.validated_by?.full_name ?? 'unknown'} on {formatDateTime(op.validated_at)}. Stock updated.
        </FormAlert>
      )}
      {op?.status === 'canceled' && (
        <FormAlert tone="info">
          Canceled by {op.canceled_by?.full_name ?? 'unknown'} on {formatDateTime(op.canceled_at)}.
        </FormAlert>
      )}

      <form onSubmit={onSave} noValidate className="space-y-6">
        <Card className="print-full">
          <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
            {cfg.contactLabel && (
              <Field label={cfg.contactLabel} error={errors.supplier_or_customer?.message}>
                <Input
                  placeholder={type === 'receipt' ? 'e.g. Tata Steel' : 'e.g. Azure Interior'}
                  disabled={!editable}
                  {...register('supplier_or_customer')}
                />
              </Field>
            )}
            {cfg.needsSource && (
              <Field label={type === 'transfer' ? 'From' : 'Source location'} error={errors.source_location_id?.message}>
                <LocationSelect disabled={!editable} {...register('source_location_id')} />
              </Field>
            )}
            {cfg.needsDestination && (
              <Field
                label={type === 'adjustment' ? 'Location' : type === 'transfer' ? 'To' : 'Destination location'}
                error={errors.destination_location_id?.message}
              >
                <LocationSelect
                  disabled={!editable}
                  excludeId={type === 'transfer' ? sourceId || null : null}
                  {...register('destination_location_id')}
                />
              </Field>
            )}
            {type !== 'adjustment' && (
              <Field label="Scheduled date" error={errors.scheduled_date?.message}>
                <Input type="date" disabled={!editable} {...register('scheduled_date')} />
              </Field>
            )}
            <Field
              label="Notes"
              error={errors.notes?.message}
              className={type === 'transfer' || type === 'adjustment' ? 'sm:col-span-2 lg:col-span-1' : 'sm:col-span-2 lg:col-span-3'}
            >
              <Textarea rows={type === 'transfer' || type === 'adjustment' ? 1 : 2} disabled={!editable} placeholder="Optional" {...register('notes')} />
            </Field>
          </div>
          {op && (
            <div className="flex flex-wrap gap-x-6 gap-y-1 border-t border-border px-5 py-3 text-xs text-muted">
              <span>Created by {op.created_by.full_name}</span>
              <span>{formatDateTime(op.created_at)}</span>
              {op.scheduled_date && <span>Scheduled {formatDate(op.scheduled_date)}</span>}
              {type === 'transfer' && op.source_location && op.destination_location && (
                <span className="inline-flex items-center gap-1 font-mono">
                  {op.source_location.full_code} <ArrowRight className="h-3 w-3" /> {op.destination_location.full_code}
                </span>
              )}
            </div>
          )}
        </Card>

        <Card className="print-full overflow-hidden">
          <CardHeader
            title={type === 'adjustment' ? 'Counted products' : 'Products'}
            description={
              editable
                ? type === 'adjustment'
                  ? 'Enter the physical count. The difference is posted on validation.'
                  : type === 'receipt'
                    ? 'Stock increases at the destination on validation.'
                    : 'Availability is checked again, atomically, on validation.'
                : `${lineCount} line${lineCount === 1 ? '' : 's'}`
            }
            className="pb-3"
          />
          {editable ? (
            <LineEditor
              type={type}
              control={control}
              register={register}
              errors={errors}
              availability={availability}
              availabilityLoading={stock.isFetching}
              shortages={shortages}
              disabled={busy}
            />
          ) : (
            op && <LinesReadonly op={op} />
          )}
        </Card>

        {editable && (
          <div className="no-print flex justify-end gap-2 sm:hidden">
            <Button type="submit" variant="primary" loading={busy} className="w-full">
              {op ? 'Save' : 'Save draft'}
            </Button>
          </div>
        )}
        {!op && (
          <p className="text-[13px] text-muted">
            Drafts don't change stock. Validate the {cfg.label.toLowerCase()} once it's saved.
          </p>
        )}
      </form>

      <ConfirmDialog
        open={confirm === 'validate'}
        onOpenChange={(o) => setConfirm(o ? 'validate' : null)}
        title={`Validate ${op?.reference ?? ''}?`}
        description={
          type === 'receipt'
            ? 'Stock will increase at the destination. This cannot be undone.'
            : type === 'delivery'
              ? 'Stock will leave the source location. This cannot be undone.'
              : type === 'transfer'
                ? 'Stock will move between locations. This cannot be undone.'
                : 'On-hand will be set to the counted quantities. This cannot be undone.'
        }
        confirmLabel="Validate"
        loading={validate.isPending || update.isPending}
        onConfirm={() => void runValidate()}
      />
      <ConfirmDialog
        open={confirm === 'cancel'}
        onOpenChange={(o) => setConfirm(o ? 'cancel' : null)}
        title={`Cancel ${op?.reference ?? ''}?`}
        description="The operation will be closed without moving stock."
        confirmLabel="Cancel operation"
        tone="danger"
        loading={cancel.isPending}
        onConfirm={() => void runCancel()}
      />
      {!editable && op && (
        <div className="no-print mt-6">
          <Link to={operationPath(type)} className="focus-ring rounded text-[13px] text-muted hover:text-accent">
            Back to {cfg.plural.toLowerCase()}
          </Link>
        </div>
      )}
    </>
  )
}
