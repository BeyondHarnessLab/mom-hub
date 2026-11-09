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

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import { Wallet } from '../index'

const user = {
  id: 1,
  username: 'wallet-user',
  role: 1,
  quota: 1000000,
  used_quota: 1000,
  request_count: 1,
}

let onlineTopup: boolean

beforeEach(() => {
  onlineTopup = true
  useAuthStore.getState().auth.setUser(user)
  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (url === '/api/user/self') {
      return { data: { success: true, data: user } }
    }
    if (url === '/api/user/topup/info') {
      return {
        data: {
          success: true,
          data: {
            enable_online_topup: onlineTopup,
            enable_redemption: true,
            pay_methods: onlineTopup
              ? [{ name: 'Alipay', type: 'alipay' }]
              : [],
            amount_options: [10, 20],
            min_topup: 1,
          },
        },
      }
    }
    return { data: { success: true, data: [] } }
  })
})

afterEach(() => {
  cleanup()
  useAuthStore.setState(useAuthStore.getInitialState(), true)
  vi.restoreAllMocks()
})

async function renderWallet() {
  const router = createRouter({
    routeTree: createRootRoute({ component: Wallet }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

it('the wallet hides the redemption code entry even when the site enables redemption', async () => {
  await renderWallet()

  expect(await screen.findByText('Add Funds')).toBeVisible()
  expect(screen.queryByText('Have a Code?')).not.toBeInTheDocument()
  expect(
    screen.queryByPlaceholderText('Enter your redemption code')
  ).not.toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: 'Redeem' })
  ).not.toBeInTheDocument()
})

it('without online top-up the wallet points to the administrator, not to a redemption code', async () => {
  onlineTopup = false
  await renderWallet()

  expect(
    await screen.findByText(
      'Online payment is not enabled. Please contact the administrator.'
    )
  ).toBeVisible()
  expect(screen.queryByText(/use redemption code/)).not.toBeInTheDocument()
})
