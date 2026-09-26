import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { dashboardApi, type DashboardFilters } from '@/api/endpoints'
import { qk } from '@/api/queryKeys'

export function useDashboard(filters: DashboardFilters) {
  return useQuery({
    queryKey: qk.dashboard(filters),
    queryFn: () => dashboardApi.summary(filters),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  })
}
