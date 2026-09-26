import type {
  DashboardFilters,
  LedgerFilters,
  OperationFilters,
  ProductFilters,
} from '@/api/endpoints'

export const qk = {
  me: ['me'] as const,
  users: ['users'] as const,
  dashboard: (f: DashboardFilters) => ['dashboard', f] as const,
  dashboardAll: ['dashboard'] as const,
  products: (f: ProductFilters) => ['products', 'list', f] as const,
  productsAll: ['products'] as const,
  product: (id: string) => ['products', 'detail', id] as const,
  categories: ['categories'] as const,
  warehouses: ['warehouses'] as const,
  warehouse: (id: string) => ['warehouses', id] as const,
  locations: (warehouseId?: string) => ['locations', warehouseId ?? 'all'] as const,
  locationsAll: ['locations'] as const,
  locationStock: (id: string, includeZero: boolean) => ['location-stock', id, includeZero] as const,
  locationStockAll: ['location-stock'] as const,
  operations: (f: OperationFilters) => ['operations', 'list', f] as const,
  operationsAll: ['operations'] as const,
  operation: (id: string) => ['operations', 'detail', id] as const,
  ledger: (f: LedgerFilters) => ['ledger', f] as const,
  ledgerAll: ['ledger'] as const,
}
