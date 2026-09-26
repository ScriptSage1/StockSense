import { api, request } from '@/api/client'
import type {
  Category,
  Challenge,
  DashboardSummary,
  LedgerEntry,
  Location,
  LocationStock,
  Message,
  Operation,
  OperationInput,
  OperationStatus,
  OperationSummary,
  OperationType,
  Page,
  Product,
  ProductInput,
  ProductSummary,
  Role,
  StockFilter,
  TokenResponse,
  User,
  ValidateResponse,
  Warehouse,
  WarehouseDetail,
} from '@/types/api'

// ---------------------------------------------------------------- auth
export const authApi = {
  /** Step 1: checks the password and emails a code. */
  login: (email: string, password: string) =>
    request<Challenge>('/auth/login', { method: 'POST', body: { email, password }, auth: false }),
  /** Step 1: creates the (unverified) account and emails a code. */
  register: (full_name: string, email: string, password: string) =>
    request<Challenge>('/auth/register', { method: 'POST', body: { full_name, email, password }, auth: false }),
  /** Step 2 of sign-in / sign-up: the code for a session. */
  verifyChallenge: (challenge_token: string, otp: string) =>
    request<TokenResponse>('/auth/otp/verify', { method: 'POST', body: { challenge_token, otp }, auth: false }),
  resendChallenge: (challenge_token: string) =>
    request<Challenge>('/auth/otp/resend', { method: 'POST', body: { challenge_token }, auth: false }),
  logout: () => api.post<Message>('/auth/logout'),
  forgotPassword: (email: string) =>
    request<Message>('/auth/forgot-password', { method: 'POST', body: { email }, auth: false }),
  verifyOtp: (email: string, otp: string) =>
    request<{ reset_token: string; expires_in: number }>('/auth/verify-otp', {
      method: 'POST',
      body: { email, otp },
      auth: false,
    }),
  resetPassword: (reset_token: string, new_password: string) =>
    request<Message>('/auth/reset-password', { method: 'POST', body: { reset_token, new_password }, auth: false }),
}

// ---------------------------------------------------------------- users
export const usersApi = {
  me: () => api.get<User>('/users/me'),
  updateMe: (body: { full_name?: string }) => api.put<User>('/users/me', body),
  /** Password change step 1: confirms the current password and emails a code. */
  startPasswordChange: (current_password: string) =>
    api.post<Challenge>('/users/me/password/otp', { current_password }),
  confirmPasswordChange: (body: { challenge_token: string; otp: string; new_password: string }) =>
    api.post<User>('/users/me/password', body),
  list: () => api.get<User[]>('/users'),
  update: (id: string, body: { role?: Role; is_active?: boolean }) => api.put<User>(`/users/${id}`, body),
}

// ---------------------------------------------------------------- dashboard
export interface DashboardFilters {
  type?: OperationType
  status?: OperationStatus
  warehouse_id?: string
  location_id?: string
  category_id?: string
}
export const dashboardApi = {
  summary: (f: DashboardFilters) => api.get<DashboardSummary>('/dashboard/summary', { ...f }),
}

// ---------------------------------------------------------------- products & categories
export interface ProductFilters {
  q?: string
  category_id?: string
  stock_status?: StockFilter
  sort?: 'name' | 'sku' | '-created_at' | 'on_hand'
  page?: number
  page_size?: number
}
export const productsApi = {
  list: (f: ProductFilters, signal?: AbortSignal) => api.get<Page<ProductSummary>>('/products', { ...f }, signal),
  get: (id: string) => api.get<Product>(`/products/${id}`),
  create: (body: ProductInput) => api.post<Product>('/products', body),
  update: (id: string, body: Partial<ProductInput>) => api.put<Product>(`/products/${id}`, body),
  remove: (id: string) => api.delete<void>(`/products/${id}`),
}
export const categoriesApi = {
  list: () => api.get<Category[]>('/categories'),
  create: (name: string) => api.post<Category>('/categories', { name }),
}

// ---------------------------------------------------------------- warehouses & locations
export interface WarehouseInput {
  name: string
  short_code: string
  address?: string | null
  is_active?: boolean
}
export interface LocationInput {
  name: string
  short_code: string
  warehouse_id: string
  is_active?: boolean
}
export const warehousesApi = {
  list: () => api.get<Warehouse[]>('/warehouses'),
  get: (id: string) => api.get<WarehouseDetail>(`/warehouses/${id}`),
  create: (body: WarehouseInput) => api.post<Warehouse>('/warehouses', body),
  update: (id: string, body: Partial<WarehouseInput>) => api.put<Warehouse>(`/warehouses/${id}`, body),
}
export const locationsApi = {
  list: (warehouse_id?: string) => api.get<Location[]>('/locations', { warehouse_id }),
  stock: (id: string, include_zero = false) => api.get<LocationStock>(`/locations/${id}/stock`, { include_zero }),
  create: (body: LocationInput) => api.post<Location>('/locations', body),
  update: (id: string, body: Partial<LocationInput>) => api.put<Location>(`/locations/${id}`, body),
}

// ---------------------------------------------------------------- operations
export interface OperationFilters {
  type?: OperationType
  status?: string
  warehouse_id?: string
  location_id?: string
  category_id?: string
  q?: string
  date_from?: string
  date_to?: string
  sort?: string
  page?: number
  page_size?: number
}
export const operationsApi = {
  list: (f: OperationFilters, signal?: AbortSignal) =>
    api.get<Page<OperationSummary>>('/operations', { ...f }, signal),
  get: (id: string) => api.get<Operation>(`/operations/${id}`),
  create: (body: OperationInput) => api.post<Operation>('/operations', body),
  update: (id: string, body: OperationInput) => api.put<Operation>(`/operations/${id}`, body),
  validate: (id: string) => api.post<ValidateResponse>(`/operations/${id}/validate`),
  cancel: (id: string) => api.post<Operation>(`/operations/${id}/cancel`),
}

// ---------------------------------------------------------------- ledger
export interface LedgerFilters {
  product_id?: string
  location_id?: string
  operation_id?: string
  type?: OperationType
  direction?: 'in' | 'out'
  q?: string
  from_date?: string
  to_date?: string
  page?: number
  page_size?: number
}
export const ledgerApi = {
  list: (f: LedgerFilters, signal?: AbortSignal) => api.get<Page<LedgerEntry>>('/ledger', { ...f }, signal),
}
