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
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'
import { useSystemConfigStore } from '@/stores/system-config-store'

import { OverviewDashboard } from '../overview-dashboard'

// VChart draws on a canvas, which jsdom does not provide.
vi.mock('@visactor/react-vchart', () => ({ VChart: () => null }))

let client: QueryClient
let keyLookupError: Error | null
let statusOverrides: Record<string, unknown>

beforeEach(() => {
  window.localStorage.clear()
  useSystemConfigStore.setState(useSystemConfigStore.getInitialState(), true)
  useAuthStore.getState().auth.setUser({
    id: 1,
    username: 'dashboard-user',
    role: 1,
    quota: 1000000,
    used_quota: 1000,
    request_count: 1,
  })
  client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  keyLookupError = null
  statusOverrides = {}
  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    switch (url) {
      case '/api/token/?p=1&size=10':
        if (keyLookupError) throw keyLookupError
        return {
          data: {
            success: true,
            data: {
              items: [{ id: 1, name: 'App key', key: 'masked', status: 1 }],
            },
          },
        }
      case '/api/status':
        return {
          data: {
            data: {
              api_info_enabled: false,
              announcements_enabled: false,
              faq_enabled: false,
              uptime_kuma_enabled: false,
              ...statusOverrides,
            },
          },
        }
      case '/api/user/models':
        return { data: { success: true, data: ['gpt-4o-mini'] } }
      case '/api/data/self':
        return { data: { success: true, data: [] } }
      default:
        throw new Error(`Unexpected dashboard request: ${url}`)
    }
  })
})

afterEach(() => {
  cleanup()
  client.clear()
  useAuthStore.setState(useAuthStore.getInitialState(), true)
  useSystemConfigStore.setState(useSystemConfigStore.getInitialState(), true)
  window.localStorage.clear()
})

async function renderOverview() {
  const router = createRouter({
    routeTree: createRootRoute({ component: OverviewDashboard }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

function setupGuidePanel(toggle: HTMLElement) {
  return document.getElementById(toggle.getAttribute('aria-controls') ?? '')
}

describe('overview setup guide', () => {
  it('with setup complete the guide starts hidden behind the header toggle', async () => {
    await renderOverview()

    const toggle = await screen.findByRole('button', { name: 'Setup guide' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(setupGuidePanel(toggle)).toBeInTheDocument()
    expect(setupGuidePanel(toggle)).not.toBeVisible()
    expect(screen.queryByText('First API request')).not.toBeInTheDocument()
  })

  it('shows only the three steps and the curl example, with no extra Create API Key buttons', async () => {
    const user = userEvent.setup()
    await renderOverview()
    const toggle = await screen.findByRole('button', { name: 'Setup guide' })

    await user.click(toggle)

    const panel = screen.getByRole('region', { name: 'Setup guide' })
    expect(
      within(panel)
        .getAllByRole('link')
        .map((link) => link.getAttribute('href'))
    ).toEqual(['/keys', '/wallet', '/playground'])
    expect(within(panel).getByText('First API request')).toBeVisible()
    expect(
      within(panel).getByRole('button', { name: 'Copy ready-to-run curl' })
    ).toBeVisible()
    expect(
      screen.queryByRole('button', { name: /Create API Key/ })
    ).not.toBeInTheDocument()
    for (const text of [
      'Build on your API gateway in minutes',
      'Recommended actions',
      'Route active',
    ]) {
      expect(screen.queryByText(text)).not.toBeInTheDocument()
    }
  })

  it('builds the curl example from the API Address, not the Server Address', async () => {
    const user = userEvent.setup()
    statusOverrides = {
      server_address: 'https://console.example.com',
      api_address: 'https://api.example.com/',
    }
    await renderOverview()
    await user.click(await screen.findByRole('button', { name: 'Setup guide' }))

    const panel = screen.getByRole('region', { name: 'Setup guide' })
    expect(
      await within(panel).findByText(
        'curl https://api.example.com/v1/chat/completions \\'
      )
    ).toBeVisible()
  })

  it('toggles the guide from the keyboard while focus stays on the header toggle', async () => {
    const user = userEvent.setup()
    await renderOverview()
    const toggle = await screen.findByRole('button', { name: 'Setup guide' })

    await user.tab()
    expect(toggle).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(setupGuidePanel(toggle)).toBeVisible()

    await user.keyboard(' ')
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(setupGuidePanel(toggle)).not.toBeVisible()
    expect(toggle).toHaveFocus()
  })

  it('restores the chosen guide visibility after remounting', async () => {
    const user = userEvent.setup()
    const first = await renderOverview()
    await user.click(await screen.findByRole('button', { name: 'Setup guide' }))
    first.unmount()

    const second = await renderOverview()
    const reopened = await screen.findByRole('button', { name: 'Setup guide' })
    expect(reopened).toHaveAttribute('aria-expanded', 'true')
    await user.click(reopened)
    second.unmount()

    await renderOverview()
    expect(
      await screen.findByRole('button', { name: 'Setup guide' })
    ).toHaveAttribute('aria-expanded', 'false')
  })

  it('opens the guide for an incomplete setup and keeps it closed once hidden', async () => {
    const user = userEvent.setup()
    useAuthStore
      .getState()
      .auth.setUser({ id: 1, username: 'new-user', role: 1 })
    const first = await renderOverview()

    const toggle = await screen.findByRole('button', { name: 'Setup guide' })
    await waitFor(() => expect(toggle).toHaveAttribute('aria-expanded', 'true'))
    expect(setupGuidePanel(toggle)).toBeVisible()
    await user.click(toggle)
    first.unmount()

    await renderOverview()
    expect(
      await screen.findByRole('button', { name: 'Setup guide' })
    ).toHaveAttribute('aria-expanded', 'false')
  })

  it('closes the guide on its own when the remaining setup step completes', async () => {
    useAuthStore.getState().auth.setUser({
      id: 1,
      username: 'dashboard-user',
      role: 1,
      quota: 1000000,
    })
    await renderOverview()
    const toggle = await screen.findByRole('button', { name: 'Setup guide' })
    await waitFor(() => expect(toggle).toHaveAttribute('aria-expanded', 'true'))

    act(() => {
      useAuthStore.getState().auth.setUser({
        id: 1,
        username: 'dashboard-user',
        role: 1,
        quota: 1000000,
        request_count: 1,
      })
    })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(setupGuidePanel(toggle)).not.toBeVisible()
  })

  it('treats setup as incomplete and keeps the guide open when the key lookup fails', async () => {
    keyLookupError = new Error('Key lookup unavailable')
    await renderOverview()

    const toggle = await screen.findByRole('button', { name: 'Setup guide' })
    await waitFor(() => expect(toggle).toHaveAttribute('aria-expanded', 'true'))
    expect(setupGuidePanel(toggle)).toBeVisible()
  })
})
