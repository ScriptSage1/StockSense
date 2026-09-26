import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '@/features/auth/AuthProvider'
import Login from './Login'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function renderLogin() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthProvider>
        <MemoryRouter>
          <Login />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  )
}

describe('Login page', () => {
  const fetchMock = vi.fn<typeof fetch>()
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('validates required fields before calling the API', async () => {
    fetchMock.mockResolvedValue(json(401, { detail: 'no session', code: 'REFRESH_INVALID' }))
    renderLogin()
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('Enter your email')).toBeInTheDocument()
    expect(screen.getByText('Enter your password')).toBeInTheDocument()
    // only the initial session-restore call happened
    expect(fetchMock.mock.calls.every(([url]) => String(url).includes('/auth/refresh'))).toBe(true)
  })

  it('shows the server message on bad credentials', async () => {
    fetchMock.mockImplementation(async (url) =>
      String(url).includes('/auth/login')
        ? json(401, { detail: 'Invalid email or password', code: 'INVALID_CREDENTIALS' })
        : json(401, { detail: 'no session', code: 'REFRESH_INVALID' }),
    )
    renderLogin()
    await userEvent.type(screen.getByLabelText('Email'), 'maya@stocksense.dev')
    await userEvent.type(screen.getByLabelText('Password'), 'wrong-pass1')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Invalid email or password'))
  })
})
