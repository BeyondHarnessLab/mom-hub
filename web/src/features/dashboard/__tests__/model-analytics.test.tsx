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
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { ThemeProvider } from '@/context/theme-provider'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import { Dashboard } from '../index'

// VChart draws on a canvas, which jsdom does not provide.
vi.mock('@visactor/react-vchart', () => ({ VChart: () => null }))

beforeEach(() => {
  window.localStorage.clear()
  useAuthStore.getState().auth.setUser({
    id: 1,
    username: 'dashboard-user',
    role: 1,
    quota: 1000000,
    used_quota: 1000,
    request_count: 1,
  })
  vi.spyOn(api, 'get').mockResolvedValue({ data: { success: true, data: [] } })
})

afterEach(() => {
  cleanup()
  useAuthStore.setState(useAuthStore.getInitialState(), true)
  window.localStorage.clear()
  vi.restoreAllMocks()
})

it('model call analytics shows quota distribution without the call chart or its default', async () => {
  const user = userEvent.setup()
  const root = createRootRoute()
  const authenticated = createRoute({
    getParentRoute: () => root,
    id: '_authenticated',
  })
  const dashboard = createRoute({
    getParentRoute: () => authenticated,
    path: 'dashboard/$section',
    component: Dashboard,
  })
  const router = createRouter({
    routeTree: root.addChildren([authenticated.addChildren([dashboard])]),
    history: createMemoryHistory({ initialEntries: ['/dashboard/models'] }),
  })
  await router.load()
  render(
    <ThemeProvider>
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ThemeProvider>
  )

  expect(await screen.findByText('Quota Distribution')).toBeVisible()
  expect(screen.queryByText('Call Trend')).not.toBeInTheDocument()
  expect(screen.queryByText('Call Count Ranking')).not.toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'Preferences' }))
  const dialog = await screen.findByRole('dialog', {
    name: 'Model Analytics Defaults',
  })
  expect(within(dialog).getByText('Default consumption chart')).toBeVisible()
  expect(
    within(dialog).queryByText('Default model call chart')
  ).not.toBeInTheDocument()
})
