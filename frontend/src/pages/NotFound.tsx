import { Compass } from 'lucide-react'
import { ButtonLink } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'

export default function NotFound() {
  return (
    <EmptyState
      icon={Compass}
      title="Page not found"
      description="The page you're looking for doesn't exist."
      action={<ButtonLink to="/">Go to dashboard</ButtonLink>}
    />
  )
}
