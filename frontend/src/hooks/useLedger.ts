import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ledgerApi, type LedgerFilters } from '@/api/endpoints'
import { qk } from '@/api/queryKeys'

export function useLedger(filters: LedgerFilters, enabled = true) {
  return useQuery({
    queryKey: qk.ledger(filters),
    queryFn: ({ signal }) => ledgerApi.list(filters, signal),
    placeholderData: keepPreviousData,
    enabled,
  })
}
