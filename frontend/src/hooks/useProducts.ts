import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { categoriesApi, productsApi, type ProductFilters } from '@/api/endpoints'
import { qk } from '@/api/queryKeys'
import type { Category, ProductInput } from '@/types/api'

export function useProducts(filters: ProductFilters, enabled = true) {
  return useQuery({
    queryKey: qk.products(filters),
    queryFn: ({ signal }) => productsApi.list(filters, signal),
    placeholderData: keepPreviousData,
    enabled,
  })
}

export function useProduct(id: string | undefined) {
  return useQuery({
    queryKey: qk.product(id ?? ''),
    queryFn: () => productsApi.get(id as string),
    enabled: Boolean(id),
  })
}

function useInvalidateCatalog() {
  const qc = useQueryClient()
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: qk.productsAll }),
      qc.invalidateQueries({ queryKey: qk.categories }),
      qc.invalidateQueries({ queryKey: qk.dashboardAll }),
      qc.invalidateQueries({ queryKey: qk.ledgerAll }),
      qc.invalidateQueries({ queryKey: qk.locationStockAll }),
    ])
}

export function useCreateProduct() {
  const invalidate = useInvalidateCatalog()
  return useMutation({
    mutationFn: (body: ProductInput) => productsApi.create(body),
    onSuccess: () => invalidate(),
  })
}

export function useUpdateProduct(id: string) {
  const qc = useQueryClient()
  const invalidate = useInvalidateCatalog()
  return useMutation({
    mutationFn: (body: Partial<ProductInput>) => productsApi.update(id, body),
    onSuccess: (product) => {
      qc.setQueryData(qk.product(id), product)
      return invalidate()
    },
  })
}

export function useDeleteProduct() {
  const invalidate = useInvalidateCatalog()
  return useMutation({
    mutationFn: (id: string) => productsApi.remove(id),
    onSuccess: () => invalidate(),
  })
}

export function useCategories() {
  return useQuery({ queryKey: qk.categories, queryFn: categoriesApi.list, staleTime: 5 * 60_000 })
}

export function useCreateCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => categoriesApi.create(name),
    onSuccess: (cat) => {
      qc.setQueryData<Category[]>(qk.categories, (old) =>
        [...(old ?? []), cat].sort((a, b) => a.name.localeCompare(b.name)),
      )
      return qc.invalidateQueries({ queryKey: qk.categories })
    },
  })
}
