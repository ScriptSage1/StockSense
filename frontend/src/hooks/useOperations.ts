import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { operationsApi, type OperationFilters } from '@/api/endpoints'
import { qk } from '@/api/queryKeys'
import type { Operation, OperationInput } from '@/types/api'

export function useOperations(filters: OperationFilters, enabled = true) {
  return useQuery({
    queryKey: qk.operations(filters),
    queryFn: ({ signal }) => operationsApi.list(filters, signal),
    placeholderData: keepPreviousData,
    enabled,
  })
}

export function useOperation(id: string | undefined) {
  return useQuery({
    queryKey: qk.operation(id ?? ''),
    queryFn: () => operationsApi.get(id as string),
    enabled: Boolean(id),
  })
}

/** Stock-affecting changes ripple through almost every view. Server state is the source of truth. */
function useInvalidateInventory() {
  const qc = useQueryClient()
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: qk.operationsAll }),
      qc.invalidateQueries({ queryKey: qk.productsAll }),
      qc.invalidateQueries({ queryKey: qk.dashboardAll }),
      qc.invalidateQueries({ queryKey: qk.ledgerAll }),
      qc.invalidateQueries({ queryKey: qk.locationStockAll }),
      qc.invalidateQueries({ queryKey: qk.locationsAll }),
    ])
}

export function useCreateOperation() {
  const qc = useQueryClient()
  const invalidate = useInvalidateInventory()
  return useMutation({
    mutationFn: (body: OperationInput) => operationsApi.create(body),
    onSuccess: (op: Operation) => {
      qc.setQueryData(qk.operation(op.id), op)
      return invalidate()
    },
  })
}

export function useUpdateOperation(id: string) {
  const qc = useQueryClient()
  const invalidate = useInvalidateInventory()
  return useMutation({
    mutationFn: (body: OperationInput) => operationsApi.update(id, body),
    onSuccess: (op) => {
      qc.setQueryData(qk.operation(id), op)
      return invalidate()
    },
  })
}

export function useValidateOperation(id: string) {
  const qc = useQueryClient()
  const invalidate = useInvalidateInventory()
  return useMutation({
    mutationFn: () => operationsApi.validate(id),
    onSuccess: (res) => {
      qc.setQueryData(qk.operation(id), res.operation)
      return invalidate()
    },
    onError: () => invalidate(),
  })
}

export function useCancelOperation(id: string) {
  const qc = useQueryClient()
  const invalidate = useInvalidateInventory()
  return useMutation({
    mutationFn: () => operationsApi.cancel(id),
    onSuccess: (op) => {
      qc.setQueryData(qk.operation(id), op)
      return invalidate()
    },
  })
}
