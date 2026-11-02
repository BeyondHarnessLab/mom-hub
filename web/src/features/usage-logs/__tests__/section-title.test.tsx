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
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import { UsageLogs } from '..'

vi.mock('@lobehub/icons', () => ({}))

const clients: QueryClient[] = []

beforeEach(() => {
  vi.spyOn(api, 'get').mockResolvedValue({
    data: { success: true, data: { items: [], total: 0 } },
  })
})

afterEach(() => {
  cleanup()
  clients.splice(0).forEach((client) => client.clear())
  useAuthStore.getState().auth.reset()
  vi.restoreAllMocks()
})

async function renderSection(section: string, sidebarModulesAdmin: object) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  clients.push(client)
  client.setQueryData(['status'], {
    SidebarModulesAdmin: JSON.stringify(sidebarModulesAdmin),
  })
  useAuthStore.getState().auth.setUser({
    id: 1,
    username: 'alice',
    role: 1,
    permissions: { sidebar_settings: true },
    sidebar_modules: '',
  })
  const root = createRootRoute()
  const auth = createRoute({ getParentRoute: () => root, id: '_authenticated' })
  const logsRoute = createRoute({
    getParentRoute: () => auth,
    path: 'usage-logs/$section',
    component: UsageLogs,
  })
  const router = createRouter({
    routeTree: root.addChildren([auth.addChildren([logsRoute])]),
    history: createMemoryHistory({
      initialEntries: [`/usage-logs/${section}`],
    }),
  })
  await router.load()
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

it('drawing logs alone are titled Drawing Logs when Task Logs is turned off', async () => {
  await renderSection('drawing', {
    console: { enabled: true, midjourney: true, task: false },
  })

  expect(
    await screen.findByRole('heading', { name: 'Drawing Logs' })
  ).toBeInTheDocument()
  expect(screen.queryByRole('tab', { name: 'Task Logs' })).toBeNull()
})

it('with both sections on the page is titled Task Logs and switches between them', async () => {
  await renderSection('drawing', {
    console: { enabled: true, midjourney: true, task: true },
  })

  expect(
    await screen.findByRole('heading', { name: 'Task Logs' })
  ).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: 'Drawing Logs' })).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: 'Task Logs' })).toBeInTheDocument()
})
