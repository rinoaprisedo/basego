import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Login from './Login'
import { login } from '../../api/auth'

vi.mock('../../api/auth', () => ({
  login: vi.fn(),
  me: vi.fn().mockResolvedValue({ data: { uuid: 'u1' } }),
}))

function renderLogin() {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// Exercises react-hook-form + @hookform/resolvers + zod + react-router together.
describe('Login form', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows validation errors and does not submit invalid input', async () => {
    renderLogin()
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'user@localhost' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('Enter a valid email')).toBeInTheDocument()
    expect(screen.getByText('Password is required')).toBeInTheDocument()
    expect(login).not.toHaveBeenCalled()
  })

  it('submits valid credentials', async () => {
    login.mockResolvedValue({})
    renderLogin()
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'a@b.co' } })
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'secret' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(login).toHaveBeenCalled())
    expect(login.mock.calls[0][0]).toEqual({ email: 'a@b.co', password: 'secret' })
  })
})
