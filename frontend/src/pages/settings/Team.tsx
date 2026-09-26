import { AlertTriangle, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Select } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/PageHeader'
import { Table, TableSkeleton, TBody, TD, TH, THead, TR } from '@/components/ui/Table'
import { useAuth } from '@/features/auth/AuthProvider'
import { useUpdateUser, useUsers } from '@/hooks/useUsers'
import { errorMessage } from '@/lib/errors'
import { formatDate, initials } from '@/lib/utils'
import type { Role } from '@/types/api'

export default function Team() {
  const { user: me } = useAuth()
  const { data, isLoading, isError, error, refetch } = useUsers()
  const update = useUpdateUser()

  const change = async (id: string, body: { role?: Role; is_active?: boolean }, label: string) => {
    try {
      await update.mutateAsync({ id, ...body })
      toast.success(label)
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Settings' }, { label: 'Team' }]}
        title="Team"
        description="New sign-ups join as staff. Promote trusted people to manager."
      />
      <Card className="overflow-hidden">
        {isLoading ? (
          <TableSkeleton rows={4} cols={4} />
        ) : isError ? (
          <EmptyState icon={AlertTriangle} title="Couldn't load team" description={errorMessage(error)} action={<Button onClick={() => refetch()}>Try again</Button>} />
        ) : !data || data.length === 0 ? (
          <EmptyState icon={Users} title="No team members" />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Member</TH>
                <TH className="hidden md:table-cell">Joined</TH>
                <TH>Role</TH>
                <TH className="text-right">Access</TH>
              </tr>
            </THead>
            <TBody>
              {data.map((u) => {
                const self = u.id === me?.id
                return (
                  <TR key={u.id}>
                    <TD>
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-fg/[0.07] text-[11px] font-semibold text-fg">
                          {initials(u.full_name)}
                        </span>
                        <div className="min-w-0">
                          <div className="truncate font-medium">
                            {u.full_name} {self && <span className="text-xs font-normal text-muted">(you)</span>}
                          </div>
                          <div className="truncate text-xs text-muted">{u.email}</div>
                        </div>
                      </div>
                    </TD>
                    <TD className="hidden text-muted md:table-cell">{formatDate(u.created_at)}</TD>
                    <TD>
                      <Select
                        aria-label={`Role for ${u.full_name}`}
                        value={u.role}
                        disabled={self || update.isPending}
                        onChange={(e) => change(u.id, { role: e.target.value as Role }, `${u.full_name} is now ${e.target.value}`)}
                        className="w-32"
                      >
                        <option value="staff">Staff</option>
                        <option value="manager">Manager</option>
                      </Select>
                    </TD>
                    <TD className="text-right">
                      {self ? (
                        <Badge tone="success" dot>Active</Badge>
                      ) : (
                        <Button
                          size="sm"
                          variant={u.is_active ? 'secondary' : 'subtle'}
                          disabled={update.isPending}
                          onClick={() =>
                            change(u.id, { is_active: !u.is_active }, u.is_active ? `${u.full_name} disabled` : `${u.full_name} enabled`)
                          }
                        >
                          {u.is_active ? 'Disable' : 'Enable'}
                        </Button>
                      )}
                    </TD>
                  </TR>
                )
              })}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  )
}
