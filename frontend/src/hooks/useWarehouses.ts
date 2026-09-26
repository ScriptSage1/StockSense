import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { locationsApi, warehousesApi, type LocationInput, type WarehouseInput } from '@/api/endpoints'
import { qk } from '@/api/queryKeys'

export function useWarehouses() {
  return useQuery({ queryKey: qk.warehouses, queryFn: warehousesApi.list, staleTime: 5 * 60_000 })
}

export function useWarehouse(id: string | undefined) {
  return useQuery({
    queryKey: qk.warehouse(id ?? ''),
    queryFn: () => warehousesApi.get(id as string),
    enabled: Boolean(id),
  })
}

export function useLocations(warehouseId?: string) {
  return useQuery({
    queryKey: qk.locations(warehouseId),
    queryFn: () => locationsApi.list(warehouseId),
    staleTime: 5 * 60_000,
  })
}

export function useLocationStock(id: string | undefined | null, includeZero = false) {
  return useQuery({
    queryKey: qk.locationStock(id ?? '', includeZero),
    queryFn: () => locationsApi.stock(id as string, includeZero),
    enabled: Boolean(id),
  })
}

function useInvalidateStructure() {
  const qc = useQueryClient()
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: qk.warehouses }),
      qc.invalidateQueries({ queryKey: qk.locationsAll }),
      qc.invalidateQueries({ queryKey: qk.dashboardAll }),
    ])
}

export function useSaveWarehouse(id?: string) {
  const invalidate = useInvalidateStructure()
  return useMutation({
    mutationFn: (body: WarehouseInput) => (id ? warehousesApi.update(id, body) : warehousesApi.create(body)),
    onSuccess: () => invalidate(),
  })
}

export function useSaveLocation(id?: string) {
  const invalidate = useInvalidateStructure()
  return useMutation({
    mutationFn: (body: LocationInput) => (id ? locationsApi.update(id, body) : locationsApi.create(body)),
    onSuccess: () => invalidate(),
  })
}
