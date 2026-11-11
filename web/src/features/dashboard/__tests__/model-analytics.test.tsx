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
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { ThemeProvider } from '@/context/theme-provider'
import { api } from '@/lib/api'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

import { Dashboard } from '../index'

// VChart draws on a canvas, which jsdom does not provide.
vi.mock('@visactor/react-vchart', () => ({ VChart: () => null }))

beforeEach(() => {
  window.localStorage.clear()
  vi.spyOn(api, 'get').mockResolvedValue({ data: { success: true, data: [] } })
})

afterEach(() => {
  cleanup()
  useAuthStore.setState(useAuthStore.getInitialState(), true)
  window.localStorage.clear()
  vi.restoreAllMocks()
})

async function renderDashboard(role: number) {
  useAuthStore.getState().auth.setUser({
    id: 1,
    username: 'dashboard-user',
    role,
    quota: 1000000,
    used_quota: 1000,
    request_count: 1,
  })
  const router = createRouter({
    routeTree: createRootRoute({ component: Dashboard }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
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
}

it('the usage card shows quota, tokens, RPM and TPM beside the balance, without count or cache stats', async () => {
  await renderDashboard(ROLE.USER)

  const card = await screen.findByRole('region', { name: 'Usage at a glance' })
  for (const stat of [
    'Total Quota',
    'Total Tokens',
    'Average RPM',
    'Average TPM',
  ]) {
    expect(within(card).getByRole('group', { name: stat })).toBeVisible()
  }
  for (const stat of ['Total Count', 'Cache Read', 'Cache Write']) {
    expect(
      within(card).queryByRole('group', { name: stat })
    ).not.toBeInTheDocument()
  }
  expect(within(card).getByText('Credit remaining')).toBeVisible()
  expect(within(card).getByText('Wallet').closest('a')).toHaveAttribute(
    'href',
    '/wallet'
  )
  expect(
    screen.queryByRole('button', { name: 'Filter' })
  ).not.toBeInTheDocument()
  expect(screen.queryByText('Historical Usage')).not.toBeInTheDocument()
  expect(screen.queryByText('Request Count')).not.toBeInTheDocument()
})

it('with no saved preferences the overview loads the last 7 days in daily buckets', async () => {
  await renderDashboard(ROLE.USER)

  expect(
    await screen.findByRole('combobox', { name: 'Time range' })
  ).toHaveTextContent('7 Days')
  await waitFor(() =>
    expect(api.get).toHaveBeenCalledWith(
      '/api/data/self',
      expect.objectContaining({
        params: expect.objectContaining({ default_time: 'day' }),
      })
    )
  )
  const call = vi
    .mocked(api.get)
    .mock.calls.find(([url]) => url === '/api/data/self')
  const params =
    (call?.[1] as { params?: Record<string, number> } | undefined)?.params ?? {}
  expect(params.end_timestamp - params.start_timestamp).toBe(7 * 24 * 3600)
})

it('a default range saved in Preferences still wins over the 7-day default', async () => {
  window.localStorage.setItem(
    'dashboard_models_chart_preferences',
    JSON.stringify({ defaultTimeRangeDays: 1, defaultTimeGranularity: 'hour' })
  )
  await renderDashboard(ROLE.USER)

  expect(
    await screen.findByRole('combobox', { name: 'Time range' })
  ).toHaveTextContent('1 Day')
})

it('stat cards show a title and a value with no description line', async () => {
  await renderDashboard(ROLE.USER)

  const tokens = await screen.findByRole('group', { name: 'Total Tokens' })
  expect(tokens).toHaveTextContent(/^Total Tokens0$/)
  for (const description of [
    'Statistical count',
    'Statistical quota',
    'Statistical tokens',
    'Requests per minute',
    'Tokens per minute',
  ]) {
    expect(screen.queryByText(description)).not.toBeInTheDocument()
  }
})

it.each([
  { name: 'a user', role: ROLE.USER, siteWide: false },
  { name: 'an admin', role: ROLE.ADMIN, siteWide: true },
])(
  '$name sees the site-wide label on the usage card: $siteWide',
  async (row) => {
    await renderDashboard(row.role)

    const card = await screen.findByRole('region', {
      name: 'Usage at a glance',
    })
    expect(within(card).queryByText('All users') !== null).toBe(row.siteWide)
  }
)

it('picking 1 Day from the select reloads the stats for that day with hourly buckets', async () => {
  const user = userEvent.setup()
  await renderDashboard(ROLE.USER)
  const select = await screen.findByRole('combobox', { name: 'Time range' })
  vi.mocked(api.get).mockClear()

  await user.click(select)
  await user.click(await screen.findByRole('option', { name: '1 Day' }))

  expect(select).toHaveTextContent('1 Day')
  await waitFor(() =>
    expect(api.get).toHaveBeenCalledWith(
      '/api/data/self',
      expect.objectContaining({
        params: expect.objectContaining({ default_time: 'hour' }),
      })
    )
  )
  const call = vi
    .mocked(api.get)
    .mock.calls.find(([url]) => url === '/api/data/self')
  const params =
    (call?.[1] as { params?: Record<string, number> } | undefined)?.params ?? {}
  expect(params.end_timestamp - params.start_timestamp).toBe(24 * 3600)
})

it('the quota distribution chart is an area chart only, with no chart type to pick', async () => {
  const user = userEvent.setup()
  await renderDashboard(ROLE.USER)

  expect(
    await screen.findByRole('region', { name: 'Quota Distribution' })
  ).toBeVisible()
  expect(screen.queryByText('Call Trend')).not.toBeInTheDocument()
  expect(screen.queryByText('Call Count Ranking')).not.toBeInTheDocument()
  for (const chartType of ['Bar Chart', 'Area Chart']) {
    expect(
      screen.queryByRole('button', { name: chartType })
    ).not.toBeInTheDocument()
  }

  await user.click(screen.getByRole('button', { name: 'Preferences' }))
  const dialog = await screen.findByRole('dialog', {
    name: 'Model Analytics Defaults',
  })
  expect(within(dialog).getByText('Default range')).toBeVisible()
  expect(
    within(dialog).queryByText('Default consumption chart')
  ).not.toBeInTheDocument()
  expect(
    within(dialog).queryByText('Default model call chart')
  ).not.toBeInTheDocument()
})

it('a user gets no analytics tabs and no flow chart', async () => {
  await renderDashboard(ROLE.USER)

  expect(await screen.findByText('Quota Distribution')).toBeVisible()
  expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
  expect(screen.queryByText('Flow')).not.toBeInTheDocument()
})

it('an admin switches between model and user analytics while the usage card stays', async () => {
  const user = userEvent.setup()
  await renderDashboard(ROLE.ADMIN)

  const tabs = await screen.findAllByRole('tab')
  expect(tabs.map((tab) => tab.textContent)).toEqual([
    'Model Call Analytics',
    'User Analytics',
  ])

  await user.click(screen.getByRole('tab', { name: 'User Analytics' }))

  expect(screen.getByRole('tab', { name: 'User Analytics' })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  expect(await screen.findByText('User Consumption Ranking')).toBeVisible()
  expect(screen.queryByText('Quota Distribution')).not.toBeInTheDocument()
  expect(
    screen.getByRole('region', { name: 'Usage at a glance' })
  ).toBeVisible()
})
