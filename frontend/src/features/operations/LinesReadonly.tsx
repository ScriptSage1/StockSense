import { Link } from 'react-router-dom'
import { QtyChange } from '@/components/QtyChange'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table'
import { formatQty } from '@/lib/utils'
import type { Operation } from '@/types/api'

export function LinesReadonly({ op }: { op: Operation }) {
  const isAdj = op.type === 'adjustment'
  return (
    <Table>
      <THead>
        <tr>
          <TH>Product</TH>
          <TH className="text-right">{isAdj ? 'Counted' : 'Quantity'}</TH>
          {isAdj && <TH className="text-right">Difference</TH>}
        </tr>
      </THead>
      <TBody>
        {op.lines.map((l) => (
          <TR key={l.id}>
            <TD>
              <Link to={`/products/${l.product.id}`} className="focus-ring rounded hover:text-accent">
                <span className="mr-2 font-mono text-xs text-muted">{l.product.sku}</span>
                <span className="font-medium">{l.product.name}</span>
              </Link>
            </TD>
            <TD className="tabular text-right">
              {formatQty(l.quantity)} <span className="text-xs text-muted">{l.product.unit_of_measure}</span>
            </TD>
            {isAdj && (
              <TD className="text-right">
                {l.delta === null ? <span className="text-muted">—</span> : <QtyChange value={l.delta} className="text-[13px]" />}
              </TD>
            )}
          </TR>
        ))}
      </TBody>
    </Table>
  )
}
