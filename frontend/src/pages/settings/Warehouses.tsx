import { motion } from 'framer-motion'
import { AlertTriangle, Building2, ChevronRight, MapPin, Pencil, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { Skeleton } from '@/components/ui/Skeleton'
import { WarehouseDialog } from '@/features/settings/WarehouseDialog'
import { useWarehouses } from '@/hooks/useWarehouses'
import { errorMessage } from '@/lib/errors'
import type { Warehouse } from '@/types/api'

export default function Warehouses() {
  const { data, isLoading, isError, error, refetch } = useWarehouses()
  const [editing, setEditing] = useState<Warehouse | null>(null)
  const [open, setOpen] = useState(false)

  const openDialog = (w: Warehouse | null) => {
    setEditing(w)
    setOpen(true)
  }

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Settings' }, { label: 'Warehouses' }]}
        title="Warehouses"
        description="Physical sites. Each holds one or more stock locations."
        actions={
          <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => openDialog(null)}>
            New warehouse
          </Button>
        }
      />
      {isLoading ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-[132px] rounded-lg" />
          ))}
        </div>
      ) : isError ? (
        <Card>
          <EmptyState icon={AlertTriangle} title="Couldn't load warehouses" description={errorMessage(error)} action={<Button onClick={() => refetch()}>Try again</Button>} />
        </Card>
      ) : !data || data.length === 0 ? (
        <Card>
          <EmptyState
            icon={Building2}
            title="No warehouses yet"
            action={
              <Button variant="primary" onClick={() => openDialog(null)}>
                Create warehouse
              </Button>
            }
          />
        </Card>
      ) : (
        <motion.div
          className="grid gap-3 md:grid-cols-2 xl:grid-cols-3"
          initial="hidden"
          animate="show"
          variants={{ show: { transition: { staggerChildren: 0.04 } } }}
        >
          {data.map((w) => (
            <motion.div key={w.id} variants={{ hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0 } }}>
              <Card className="group flex h-full flex-col p-4 transition-[border-color,box-shadow] hover:border-border-strong hover:shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent-soft font-mono text-[12px] font-semibold text-accent">
                      {w.short_code}
                    </span>
                    <div className="min-w-0">
                      <Link to={`/settings/warehouses/${w.id}`} className="focus-ring block truncate rounded font-medium text-fg hover:text-accent">
                        {w.name}
                      </Link>
                      <p className="truncate text-[13px] text-muted">{w.address || 'No address'}</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon-sm" aria-label={`Edit ${w.name}`} onClick={() => openDialog(w)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
                <div className="mt-auto flex items-center justify-between pt-4">
                  <span className="inline-flex items-center gap-1.5 text-[13px] text-muted">
                    <MapPin className="h-3.5 w-3.5" aria-hidden />
                    {w.location_count} location{w.location_count === 1 ? '' : 's'}
                  </span>
                  <div className="flex items-center gap-2">
                    {!w.is_active && <Badge tone="muted">Inactive</Badge>}
                    <Link
                      to={`/settings/warehouses/${w.id}`}
                      className="focus-ring inline-flex items-center gap-0.5 rounded text-[13px] font-medium text-muted hover:text-accent"
                    >
                      Open <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      )}
      <WarehouseDialog open={open} onOpenChange={setOpen} warehouse={editing} />
    </>
  )
}
