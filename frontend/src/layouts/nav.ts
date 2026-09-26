import {
  Building2,
  History,
  LayoutDashboard,
  MapPin,
  Package,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { OPERATION_TYPES } from '@/features/operations/config'

export interface NavLeaf {
  label: string
  to: string
  icon: LucideIcon
  end?: boolean
}

export interface NavGroup {
  label: string
  icon: LucideIcon
  basePath: string
  children: NavLeaf[]
  managerOnly?: boolean
}

export type NavEntry = NavLeaf | NavGroup

export function isGroup(e: NavEntry): e is NavGroup {
  return 'children' in e
}

export const NAV: NavEntry[] = [
  { label: 'Dashboard', to: '/', icon: LayoutDashboard, end: true },
  { label: 'Products', to: '/products', icon: Package },
  {
    label: 'Operations',
    icon: OPERATION_TYPES.transfer.icon,
    basePath: '/operations',
    children: Object.values(OPERATION_TYPES).map((c) => ({
      label: c.plural === 'Internal transfers' ? 'Transfers' : c.plural,
      to: `/operations/${c.slug}`,
      icon: c.icon,
    })),
  },
  { label: 'Move history', to: '/history', icon: History },
  {
    label: 'Settings',
    icon: Building2,
    basePath: '/settings',
    managerOnly: true,
    children: [
      { label: 'Warehouses', to: '/settings/warehouses', icon: Building2 },
      { label: 'Locations', to: '/settings/locations', icon: MapPin },
      { label: 'Team', to: '/settings/team', icon: Users },
    ],
  },
]
