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
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import { api } from '@/lib/api'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'
import { useSystemConfigStore } from '@/stores/system-config-store'

import { OverviewDashboard } from '../overview-dashboard'

let client: QueryClient
const originalGetAnimations = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'getAnimations'
)

// The FAQ scroll area reads element animations, which jsdom does not provide.
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'getAnimations', {
    configurable: true,
    value: () => [],
  })
})

afterAll(() => {
  if (originalGetAnimations) {
    Object.defineProperty(
      HTMLElement.prototype,
      'getAnimations',
      originalGetAnimations
    )
    return
  }
  Reflect.deleteProperty(HTMLElement.prototype, 'getAnimations')
})

beforeEach(() => {
  window.localStorage.clear()
  useSystemConfigStore.setState(useSystemConfigStore.getInitialState(), true)
  client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (url === '/api/status') {
      return {
        data: {
          data: {
            api_info_enabled: true,
            api_info: [
              {
                url: 'https://api.example.com',
                route: 'Primary',
                description: 'Main route',
                color: 'blue',
              },
            ],
            announcements_enabled: true,
            announcements: [{ id: 1, content: 'Maintenance tonight' }],
            faq_enabled: true,
            faq: [{ id: 1, question: 'How do I top up?', answer: 'Wallet' }],
            uptime_kuma_enabled: true,
          },
        },
      }
    }
    return { data: { success: true, data: [] } }
  })
})

afterEach(() => {
  cleanup()
  client.clear()
  useAuthStore.setState(useAuthStore.getInitialState(), true)
  useSystemConfigStore.setState(useSystemConfigStore.getInitialState(), true)
  window.localStorage.clear()
  vi.restoreAllMocks()
})

async function renderOverview(role: number) {
  useAuthStore.getState().auth.setUser({
    id: 1,
    username: 'dashboard-user',
    role,
    quota: 1000000,
    used_quota: 1000,
    request_count: 1,
  })
  const router = createRouter({
    routeTree: createRootRoute({ component: OverviewDashboard }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

describe('overview content panels', () => {
  it.each([
    { name: 'a user', role: ROLE.USER },
    { name: 'an admin', role: ROLE.ADMIN },
  ])(
    '$name sees the FAQ but not API info, announcements or uptime when all are enabled',
    async (row) => {
      await renderOverview(row.role)

      expect(await screen.findByText('How do I top up?')).toBeVisible()
      expect(screen.queryByText('API Info')).not.toBeInTheDocument()
      expect(screen.queryByText('Maintenance tonight')).not.toBeInTheDocument()
      expect(screen.queryByText('Uptime')).not.toBeInTheDocument()
      expect(api.get).not.toHaveBeenCalledWith('/api/uptime/status')
    }
  )
})
