// Types mirror the FastAPI Pydantic schemas (backend/app/schemas).

export type Role = 'manager' | 'staff'
export type OperationType = 'receipt' | 'delivery' | 'transfer' | 'adjustment'
export type OperationStatus = 'draft' | 'waiting' | 'ready' | 'done' | 'canceled'
export type StockFilter = 'in_stock' | 'low' | 'out' | 'attention'

export interface Page<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  pages: number
}

export interface ApiErrorBody {
  detail: string
  code: string
  field?: string | null
  errors?: { field: string | null; detail: string }[]
  shortages?: Shortage[]
  remaining_attempts?: number
}

export interface Shortage {
  line_index: number
  product_id: string
  sku: string
  name: string
  requested: number
  available: number
}

// ---------------------------------------------------------------- auth / users
export interface User {
  id: string
  full_name: string
  email: string
  role: Role
  is_active: boolean
  created_at: string
}

export interface TokenResponse {
  access_token: string
  token_type: 'bearer'
  expires_in: number
  user: User
}

export interface Message {
  detail: string
}

// ---------------------------------------------------------------- warehouses
export interface WarehouseRef {
  id: string
  name: string
  short_code: string
}

export interface Warehouse extends WarehouseRef {
  address: string | null
  is_active: boolean
  location_count: number
  created_at: string
}

export interface LocationRef {
  id: string
  name: string
  short_code: string
  full_code: string
  warehouse_id: string
}

export interface Location extends LocationRef {
  warehouse: WarehouseRef
  is_active: boolean
  product_count: number
  total_units: number
  created_at: string
}

export interface WarehouseDetail extends Warehouse {
  locations: Location[]
}

export interface LocationStockItem {
  product_id: string
  sku: string
  name: string
  unit_of_measure: string
  quantity: number
}

export interface LocationStock {
  location: Location
  items: LocationStockItem[]
  total_units: number
}

// ---------------------------------------------------------------- products
export interface Category {
  id: string
  name: string
  product_count: number
}

export interface ProductSummary {
  id: string
  name: string
  sku: string
  category: { id: string; name: string } | null
  unit_of_measure: string
  is_active: boolean
  total_on_hand: number
  reorder_point: number | null
  is_low_stock: boolean
  is_out_of_stock: boolean
  updated_at: string
}

export interface StockByLocation {
  location: LocationRef
  warehouse_name: string
  quantity: number
}

export interface Product extends ProductSummary {
  created_at: string
  stock_by_location: StockByLocation[]
}

export interface ProductInput {
  name: string
  sku: string
  category_id: string | null
  unit_of_measure: string
  reorder_point?: number | null
  clear_reorder_point?: boolean
  initial_stock?: { location_id: string; quantity: number } | null
}

// ---------------------------------------------------------------- operations
export interface UserRef {
  id: string
  full_name: string
}

export interface ProductRef {
  id: string
  name: string
  sku: string
  unit_of_measure: string
}

export interface OperationLine {
  id: string
  product: ProductRef
  quantity: number
  available: number | null
  delta: number | null
  is_short: boolean
}

export interface LedgerBrief {
  id: string
  product_id: string
  quantity: number
  from_location_id: string | null
  to_location_id: string | null
  performed_at: string
}

export interface OperationSummary {
  id: string
  reference: string
  type: OperationType
  status: OperationStatus
  supplier_or_customer: string | null
  source_location: LocationRef | null
  destination_location: LocationRef | null
  scheduled_date: string | null
  is_late: boolean
  line_count: number
  total_quantity: number
  created_by: UserRef
  created_at: string
  validated_at: string | null
}

export interface Operation extends OperationSummary {
  notes: string | null
  lines: OperationLine[]
  validated_by: UserRef | null
  canceled_by: UserRef | null
  canceled_at: string | null
  updated_at: string
  ledger_entries: LedgerBrief[]
}

export interface OperationInput {
  type?: OperationType
  supplier_or_customer?: string | null
  source_location_id?: string | null
  destination_location_id?: string | null
  scheduled_date?: string | null
  notes?: string | null
  lines?: { product_id: string; quantity: number }[]
}

export interface ValidateResponse {
  operation: Operation
  ledger_entries: LedgerBrief[]
}

// ---------------------------------------------------------------- ledger
export interface LedgerEntry {
  id: string
  operation: { id: string; reference: string; type: OperationType; supplier_or_customer: string | null }
  product: ProductRef
  from_location: LocationRef | null
  to_location: LocationRef | null
  quantity: number
  direction: 'in' | 'out'
  type: OperationType
  performed_by: UserRef
  performed_at: string
}

// ---------------------------------------------------------------- dashboard
export interface TypeBreakdown {
  open: number
  ready: number
  waiting: number
  draft: number
  late: number
  upcoming: number
  today: number
}

export interface DashboardSummary {
  total_products: number
  products_in_stock: number
  total_units: number
  low_stock_count: number
  out_of_stock_count: number
  pending_receipts: number
  pending_deliveries: number
  scheduled_transfers: number
  pending_adjustments: number
  receipts: TypeBreakdown
  deliveries: TypeBreakdown
  transfers: TypeBreakdown
  adjustments: TypeBreakdown
  status_counts: Record<OperationStatus, number>
  low_stock_items: {
    id: string
    name: string
    sku: string
    unit_of_measure: string
    total_on_hand: number
    reorder_point: number | null
    is_out_of_stock: boolean
  }[]
  pending_operations: OperationSummary[]
  recent_moves: LedgerEntry[]
  generated_at: string
}
