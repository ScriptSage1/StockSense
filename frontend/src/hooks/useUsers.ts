import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { usersApi } from '@/api/endpoints'
import { qk } from '@/api/queryKeys'
import type { Role } from '@/types/api'

export function useUsers(enabled = true) {
  return useQuery({ queryKey: qk.users, queryFn: usersApi.list, enabled })
}

export function useUpdateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; role?: Role; is_active?: boolean }) => usersApi.update(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.users }),
  })
}
