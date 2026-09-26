import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Field, Input } from '@/components/ui/Input'
import { useCreateCategory } from '@/hooks/useProducts'
import { errorMessage } from '@/lib/errors'
import type { Category } from '@/types/api'

export function CategoryDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (category: Category) => void
}) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | undefined>()
  const create = useCreateCategory()

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!name.trim()) {
      setError('Enter a name')
      return
    }
    try {
      const cat = await create.mutateAsync(name.trim())
      toast.success(`Category "${cat.name}" created`)
      onCreated(cat)
      setName('')
      setError(undefined)
      onOpenChange(false)
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="New category"
      size="sm"
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" type="submit" form="category-form" loading={create.isPending}>
            Create
          </Button>
        </>
      }
    >
      <form id="category-form" onSubmit={submit} noValidate>
        <Field label="Name" error={error}>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={80} />
        </Field>
      </form>
    </Dialog>
  )
}
