import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, LogOut, PanelLeftClose, PanelLeftOpen, UserRound } from 'lucide-react'
import { useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { Logo } from '@/components/Logo'
import {
  DropdownContent,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
  DropdownSeparator,
  DropdownTrigger,
} from '@/components/ui/DropdownMenu'
import { Tooltip } from '@/components/ui/Tooltip'
import { useAuth } from '@/features/auth/AuthProvider'
import { cn, initials } from '@/lib/utils'
import { NAV, isGroup, type NavGroup, type NavLeaf } from './nav'

const itemBase =
  'focus-ring group relative flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[13.5px] font-medium transition-colors duration-150'

function Leaf({ item, collapsed, nested, onNavigate }: { item: NavLeaf; collapsed: boolean; nested?: boolean; onNavigate?: () => void }) {
  const Icon = item.icon
  const link = (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          itemBase,
          nested && !collapsed && 'pl-9 text-[13px]',
          collapsed && 'justify-center px-0',
          isActive ? 'text-fg' : 'text-muted hover:bg-fg/[0.04] hover:text-fg',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            // The highlight glides between items instead of jumping.
            <motion.span
              layoutId="sidebar-active"
              className="absolute inset-0 -z-0 rounded-md bg-panel shadow-sm"
              transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              aria-hidden
            />
          )}
          {(!nested || collapsed) && (
            <Icon
              className={cn(
                'relative h-[18px] w-[18px] shrink-0 transition-transform duration-200 group-hover:scale-110',
                isActive ? 'text-accent' : 'text-subtle group-hover:text-muted',
              )}
              aria-hidden
            />
          )}
          {nested && !collapsed && (
            <span
              className={cn('absolute left-[18px] z-10 h-1.5 w-1.5 rounded-full', isActive ? 'bg-accent' : 'bg-border-strong')}
              aria-hidden
            />
          )}
          {!collapsed && <span className="relative truncate">{item.label}</span>}
          {collapsed && <span className="sr-only">{item.label}</span>}
        </>
      )}
    </NavLink>
  )
  return collapsed ? (
    <Tooltip content={item.label} side="right">
      {link}
    </Tooltip>
  ) : (
    link
  )
}

function Group({ group, collapsed, onNavigate }: { group: NavGroup; collapsed: boolean; onNavigate?: () => void }) {
  const { pathname } = useLocation()
  const inside = pathname.startsWith(group.basePath)
  const [open, setOpen] = useState(true)
  const Icon = group.icon
  if (collapsed) {
    return (
      <div className="space-y-0.5 border-t border-border/70 pt-1.5 first:border-0">
        {group.children.map((c) => (
          <Leaf key={c.to} item={c} collapsed nested onNavigate={onNavigate} />
        ))}
      </div>
    )
  }
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cn(itemBase, 'w-full', inside ? 'text-fg' : 'text-muted hover:bg-fg/[0.04] hover:text-fg')}
      >
        <Icon className={cn('h-[18px] w-[18px] shrink-0', inside ? 'text-accent' : 'text-subtle')} aria-hidden />
        <span className="flex-1 text-left">{group.label}</span>
        <ChevronDown className={cn('h-4 w-4 text-subtle transition-transform duration-200', !open && '-rotate-90')} aria-hidden />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="space-y-0.5 pb-1 pt-0.5">
              {group.children.map((c) => (
                <Leaf key={c.to} item={c} collapsed={false} nested onNavigate={onNavigate} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function NavList({ collapsed = false, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const { isManager } = useAuth()
  return (
    <nav aria-label="Main" className="space-y-0.5">
      {NAV.filter((e) => !(isGroup(e) && e.managerOnly && !isManager)).map((entry) =>
        isGroup(entry) ? (
          <Group key={entry.label} group={entry} collapsed={collapsed} onNavigate={onNavigate} />
        ) : (
          <Leaf key={entry.to} item={entry} collapsed={collapsed} onNavigate={onNavigate} />
        ),
      )}
    </nav>
  )
}

export function ProfileMenu({ collapsed = false, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  if (!user) return null
  return (
    <DropdownMenu>
      <DropdownTrigger asChild>
        <button
          type="button"
          className={cn(
            'focus-ring flex w-full items-center gap-2.5 rounded-md p-1.5 text-left transition-colors hover:bg-fg/[0.04]',
            collapsed && 'justify-center',
          )}
          aria-label="Account menu"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-charcoal text-[11px] font-semibold text-white">
            {initials(user.full_name)}
          </span>
          {!collapsed && (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-fg">{user.full_name}</span>
              <span className="block truncate text-xs capitalize text-muted">{user.role}</span>
            </span>
          )}
        </button>
      </DropdownTrigger>
      <DropdownContent side={collapsed ? 'right' : 'top'} align="start">
        <DropdownLabel>{user.email}</DropdownLabel>
        <DropdownSeparator />
        <DropdownItem
          icon={<UserRound />}
          onSelect={() => {
            onNavigate?.()
            navigate('/profile')
          }}
        >
          My profile
        </DropdownItem>
        <DropdownItem
          icon={<LogOut />}
          onSelect={async () => {
            onNavigate?.()
            await logout()
            navigate('/login', { replace: true })
          }}
        >
          Log out
        </DropdownItem>
      </DropdownContent>
    </DropdownMenu>
  )
}

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 68 : 244 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className="no-print sticky top-0 hidden h-screen shrink-0 flex-col overflow-hidden lg:flex"
    >
      <div className={cn('flex h-14 items-center px-4', collapsed && 'justify-center px-0')}>
        <Logo collapsed={collapsed} />
      </div>
      <div className={cn('scrollbar-thin flex-1 overflow-y-auto px-3 py-2', collapsed && 'px-2.5')}>
        <NavList collapsed={collapsed} />
      </div>
      <div className={cn('space-y-1 px-3 pb-3', collapsed && 'px-2.5')}>
        <Tooltip content={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} side="right">
          <button
            type="button"
            onClick={onToggle}
            className={cn(itemBase, 'w-full text-muted hover:bg-fg/[0.04] hover:text-fg', collapsed && 'justify-center px-0')}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <PanelLeftOpen className="h-[18px] w-[18px]" /> : <PanelLeftClose className="h-[18px] w-[18px]" />}
            {!collapsed && <span>Collapse</span>}
          </button>
        </Tooltip>
        <div className="border-t border-border/80 pt-2">
          <ProfileMenu collapsed={collapsed} />
        </div>
      </div>
    </motion.aside>
  )
}
