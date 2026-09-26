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

  it('asks for the emailed code after the password, then signs in', async () => {
    fetchMock.mockImplementation(async (url, init) => {
      const path = String(url)
      if (path.includes('/auth/login'))
        return json(200, {
          challenge_token: 'challenge-abc',
          purpose: 'login',
          email: 'maya@stocksense.dev',
          expires_in: 600,
          resend_after: 30,
        })
      if (path.includes('/auth/otp/verify')) {
        const body = JSON.parse(String(init?.body))
        return body.otp === '123456'
          ? json(200, {
              access_token: 'tok',
              token_type: 'bearer',
              expires_in: 1800,
              user: { id: 'u1', full_name: 'Maya', email: 'maya@stocksense.dev', role: 'manager', is_active: true, created_at: '' },
            })
          : json(400, { detail: 'Incorrect code. 4 attempts left.', code: 'OTP_INVALID', field: 'otp' })
      }
      return json(401, { detail: 'no session', code: 'REFRESH_INVALID' })
    })
    renderLogin()
    await userEvent.type(screen.getByLabelText('Email'), 'maya@stocksense.dev')
    await userEvent.type(screen.getByLabelText('Password'), 'Passw0rd1')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText('maya@stocksense.dev')).toBeInTheDocument()
    await userEvent.type(await screen.findByLabelText('Digit 1'), '999999')
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Incorrect code'))

    await userEvent.type(screen.getByLabelText('Digit 1'), '123456')
    expect(await screen.findByText('Signed in')).toBeInTheDocument()
    const verifyCalls = fetchMock.mock.calls.filter(([u]) => String(u).includes('/auth/otp/verify'))
    expect(JSON.parse(String(verifyCalls.at(-1)?.[1]?.body))).toEqual({ challenge_token: 'challenge-abc', otp: '123456' })
  })
})
