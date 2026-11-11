/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import type { SystemStatus } from '@/features/auth/types'
import { api } from '@/lib/api'
import { STATUS_QUERY_KEY } from '@/lib/status-query'

import { showsSignUpLink } from '../../lib/sign-up'
import { SignUpForm } from '../components/sign-up-form'

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  vi.restoreAllMocks()
})

async function renderSignUpForm(status: SystemStatus) {
  vi.spyOn(api, 'get').mockResolvedValue({
    data: { success: true, data: status },
  })
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  client.setQueryData(STATUS_QUERY_KEY, status)
  const router = createRouter({
    routeTree: createRootRoute({ component: SignUpForm }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

it('with password registration open, the sign-up form asks for a username and password', async () => {
  await renderSignUpForm({ github_oauth: true })

  expect(await screen.findByLabelText('Username')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Create account' })).toBeVisible()
  expect(
    screen.getByRole('button', { name: /Continue with GitHub/ })
  ).toBeVisible()
})

it('with password registration off, the sign-up form offers only third-party sign-up', async () => {
  await renderSignUpForm({
    github_oauth: true,
    password_register_enabled: false,
  })

  expect(
    await screen.findByRole('button', { name: /Continue with GitHub/ })
  ).toBeVisible()
  expect(screen.queryByLabelText('Username')).not.toBeInTheDocument()
  expect(
    screen.queryByRole('textbox', { name: 'Password' })
  ).not.toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: 'Create account' })
  ).not.toBeInTheDocument()
})

it('with registration off, the sign-up form says so and offers no way to sign up', async () => {
  await renderSignUpForm({ github_oauth: true, register_enabled: false })

  expect(
    await screen.findByText(
      'New user registration has been disabled by administrator'
    )
  ).toBeVisible()
  expect(screen.queryByLabelText('Username')).not.toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: /Continue with GitHub/ })
  ).not.toBeInTheDocument()
})

it.each([
  { name: 'status not loaded yet', status: null, shown: true },
  { name: 'registration open', status: {}, shown: true },
  {
    name: 'password registration off',
    status: { password_register_enabled: false },
    shown: false,
  },
  {
    name: 'registration off',
    status: { register_enabled: false },
    shown: false,
  },
  {
    name: 'self-use mode',
    status: { self_use_mode_enabled: true },
    shown: false,
  },
])('the sign-in pages link to sign-up with $name: $shown', (row) => {
  expect(showsSignUpLink(row.status)).toBe(row.shown)
})
