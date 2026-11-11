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
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { STATUS_QUERY_KEY } from '@/lib/status-query'

import { UserAuthForm } from '../components/user-auth-form'

// The site has turned password login off and offers GitHub instead.
const status = { password_login_enabled: false, github_oauth: true }

beforeEach(() => {
  window.localStorage.clear()
  vi.spyOn(api, 'get').mockResolvedValue({
    data: { success: true, data: status },
  })
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  vi.restoreAllMocks()
})

async function renderForm(passwordOnly: boolean) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  client.setQueryData(STATUS_QUERY_KEY, status)
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => <UserAuthForm passwordOnly={passwordOnly} />,
    }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

it('with password login off, the regular sign-in form offers only the other sign-in methods', async () => {
  await renderForm(false)

  expect(
    await screen.findByRole('button', { name: /Continue with GitHub/ })
  ).toBeVisible()
  expect(screen.queryByLabelText('Password')).not.toBeInTheDocument()
})

it('with password login off, the password-only form still shows username and password and nothing else', async () => {
  await renderForm(true)

  expect(await screen.findByLabelText('Username or Email')).toBeVisible()
  expect(screen.getByLabelText('Password')).toBeVisible()
  expect(
    screen.queryByRole('button', { name: /Continue with GitHub/ })
  ).not.toBeInTheDocument()
})

it('the password-only form submits the credentials to the password login API', async () => {
  const post = vi
    .spyOn(api, 'post')
    .mockResolvedValue({ data: { success: false, message: 'refused' } })
  await renderForm(true)

  await userEvent.type(
    await screen.findByLabelText('Username or Email'),
    'root'
  )
  await userEvent.type(screen.getByLabelText('Password'), 'root-password')
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

  await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
  expect(post.mock.calls[0][0]).toBe('/api/user/login?turnstile=')
  expect(post.mock.calls[0][1]).toEqual({
    username: 'root',
    password: 'root-password',
  })
})
