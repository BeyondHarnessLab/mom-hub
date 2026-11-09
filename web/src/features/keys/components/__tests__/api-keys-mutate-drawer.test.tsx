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
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import type { ApiKey } from '../../types'

const { createInstance } = await import('i18next')
const { I18nextProvider, initReactI18next } = await import('react-i18next')
const { QueryClient, QueryClientProvider } =
  await import('@tanstack/react-query')
const { api } = await import('@/lib/api')
const { ApiKeysProvider } = await import('../api-keys-provider')
const { ApiKeysMutateDrawer } = await import('../api-keys-mutate-drawer')

const i18n = createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: { en: { translation: {} } },
})

type ApiMethod = (url: string, data?: unknown) => Promise<{ data: unknown }>
type MockableApi = {
  get: ApiMethod
  post: ApiMethod
}
type RenderedDrawer = {
  queryClient: InstanceType<typeof QueryClient>
}

const apiClient = api as unknown as MockableApi
const originalGet = apiClient.get
const originalPost = apiClient.post
let renderedDrawer: RenderedDrawer | null = null

function installApiFixtures(createdPayloads: Array<Record<string, unknown>>) {
  apiClient.get = async (url) => {
    switch (url) {
      case '/api/status':
        return { data: { data: { default_use_auto_group: true } } }
      case '/api/user/self/groups':
        return {
          data: {
            success: true,
            data: {
              auto: { desc: 'Automatic routing', ratio: 'auto' },
              default: { desc: 'Standard access', ratio: 1 },
              vip: { desc: 'Priority access', ratio: 2 },
            },
          },
        }
      default:
        throw new Error(`Unexpected GET ${url}`)
    }
  }
  apiClient.post = async (url, data) => {
    expect(url).toBe('/api/token/')
    expect(data && typeof data === 'object').toBeTruthy()
    createdPayloads.push(data as Record<string, unknown>)
    return { data: { success: true, data: {} } }
  }
}

const groupsWithAuto = {
  auto: { desc: 'Automatic routing', ratio: 'auto' },
  default: { desc: 'Standard access', ratio: 1 },
  vip: { desc: 'Priority access', ratio: 2 },
}

async function renderCreateDrawer(
  groups: Record<string, unknown> = groupsWithAuto
): Promise<void> {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const freshAt = Date.now() + 60_000
  queryClient.setQueryData(
    ['status'],
    { default_use_auto_group: true },
    { updatedAt: freshAt }
  )
  queryClient.setQueryData(
    ['user-groups'],
    { success: true, data: groups },
    { updatedAt: freshAt }
  )
  renderedDrawer = { queryClient }

  render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <ApiKeysProvider>
          <ApiKeysMutateDrawer open onOpenChange={() => undefined} />
        </ApiKeysProvider>
      </I18nextProvider>
    </QueryClientProvider>
  )
  await waitFor(
    () => {
      const saveButton = findButton('Save changes', false)
      expect(saveButton).toBeEnabled()
    },
    { timeout: 1500 }
  )
}

function findButton(text: string, required: true): HTMLButtonElement
function findButton(text: string, required: false): HTMLButtonElement | null
function findButton(text: string, required = true): HTMLButtonElement | null {
  const button = screen
    .queryAllByRole<HTMLButtonElement>('button')
    .find((candidate) => candidate.textContent?.includes(text))
  if (required && !button) {
    throw new Error(`Expected button containing "${text}"`)
  }
  return button ?? null
}

function findLabel(labelText: string): HTMLLabelElement | undefined {
  return [...document.querySelectorAll<HTMLLabelElement>('label')].find(
    (candidate) => candidate.textContent?.trim() === labelText
  )
}

function getControlByLabel(labelText: 'Name'): HTMLInputElement
function getControlByLabel(labelText: string): HTMLElement {
  const label = findLabel(labelText)
  if (!label) {
    throw new Error(`Expected label "${labelText}"`)
  }

  const control =
    label.control ??
    label
      .closest('[data-slot="form-item"]')
      ?.querySelector<HTMLElement>(
        '[data-slot="form-control"], input, textarea, button[role="combobox"], [role="group"]'
      )
  if (!control) {
    throw new Error(`Expected control for label "${labelText}"`)
  }
  return control
}

function changeInput(input: HTMLInputElement, value: string): void {
  fireEvent.input(input, { target: { value } })
}

afterEach(() => {
  apiClient.get = originalGet
  apiClient.post = originalPost
  localStorage.clear()
  if (renderedDrawer) {
    renderedDrawer.queryClient.clear()
    renderedDrawer = null
  }
})

describe('API keys mutate drawer create form', () => {
  test('shows no group, quantity or advanced settings controls', async () => {
    installApiFixtures([])
    await renderCreateDrawer()

    for (const label of [
      'Group',
      'Auto group order',
      'Cross-group retry',
      'Quantity',
      'Model Limits',
      'IP Whitelist (supports CIDR)',
      'Allow querying user quota',
    ]) {
      expect(findLabel(label)).toBeUndefined()
    }
    expect(findButton('Advanced Settings', false)).toBeNull()
  })

  test('creates one auto key that inherits the global order when auto is the default', async () => {
    const createdPayloads: Array<Record<string, unknown>> = []
    installApiFixtures(createdPayloads)
    await renderCreateDrawer()

    changeInput(getControlByLabel('Name'), 'single')
    fireEvent.click(findButton('Save changes', true))
    await waitFor(() => expect(createdPayloads).toHaveLength(1))

    expect(createdPayloads[0]).toMatchObject({
      name: 'single',
      group: 'auto',
      cross_group_retry: true,
      model_limits_enabled: false,
      model_limits: '',
      allow_ips: '',
      allow_user_quota_query: true,
    })
    expect(createdPayloads[0]).not.toHaveProperty('auto_groups')
  })

  test('creates a key in the user group when the user cannot use auto', async () => {
    const createdPayloads: Array<Record<string, unknown>> = []
    installApiFixtures(createdPayloads)
    await renderCreateDrawer({
      default: { desc: 'Standard access', ratio: 1 },
    })

    changeInput(getControlByLabel('Name'), 'no-auto')
    fireEvent.click(findButton('Save changes', true))
    await waitFor(() => expect(createdPayloads).toHaveLength(1))

    expect(createdPayloads[0]?.group).toBe('')
    expect(createdPayloads[0]?.cross_group_retry).toBe(false)
  })
})

describe('API keys mutate drawer update form', () => {
  test('keeps the stored group, auto order and restrictions when a key is renamed', async () => {
    installApiFixtures([])
    const stored: ApiKey = {
      id: 7,
      name: 'restricted',
      key: '',
      status: 1,
      remain_quota: 0,
      used_quota: 0,
      unlimited_quota: true,
      expired_time: -1,
      created_time: 1,
      accessed_time: 0,
      group: 'auto',
      auto_groups: ['vip'],
      cross_group_retry: false,
      model_limits_enabled: true,
      model_limits: 'gpt-4o,claude-sonnet',
      allow_ips: '10.0.0.0/8',
      allow_user_quota_query: false,
    }
    const getFixture = apiClient.get
    vi.spyOn(apiClient, 'get').mockImplementation((url) =>
      url === '/api/token/7'
        ? Promise.resolve({ data: { success: true, data: stored } })
        : getFixture(url)
    )
    const put = vi
      .spyOn(api, 'put')
      .mockResolvedValue({ data: { success: true } })
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    renderedDrawer = { queryClient }
    render(
      <QueryClientProvider client={queryClient}>
        <I18nextProvider i18n={i18n}>
          <ApiKeysProvider>
            <ApiKeysMutateDrawer
              open
              currentRow={stored}
              onOpenChange={() => undefined}
            />
          </ApiKeysProvider>
        </I18nextProvider>
      </QueryClientProvider>
    )
    await waitFor(() => expect(findButton('Save changes', true)).toBeEnabled())

    changeInput(getControlByLabel('Name'), 'renamed')
    fireEvent.click(findButton('Save changes', true))
    await waitFor(() => expect(put).toHaveBeenCalled())

    const payload = put.mock.calls[0][1]
    expect(payload).toMatchObject({
      id: 7,
      name: 'renamed',
      group: 'auto',
      cross_group_retry: false,
      model_limits_enabled: true,
      model_limits: 'gpt-4o,claude-sonnet',
      allow_ips: '10.0.0.0/8',
      allow_user_quota_query: false,
    })
    expect(payload).not.toHaveProperty('auto_groups')
  })
})

describe('API key expiry across editing sessions', () => {
  test.each(['close', 'save'] as const)(
    'keeps an uncached key non-expiring after %s of a key with an expiry',
    async (finish) => {
      installApiFixtures([])
      const first: ApiKey = {
        id: 1,
        name: 'expiring',
        key: '',
        status: 1,
        remain_quota: 0,
        used_quota: 0,
        unlimited_quota: true,
        expired_time: 2000000000,
        created_time: 1,
        accessed_time: 0,
        group: 'default',
        auto_groups: [],
        cross_group_retry: false,
        model_limits_enabled: false,
        model_limits: '',
        allow_ips: '',
        allow_user_quota_query: true,
      }
      const second = { ...first, id: 2, name: 'non-expiring', expired_time: -1 }
      let resolveDetail!: (value: { data: unknown }) => void
      const detail = new Promise<{ data: unknown }>((resolve) => {
        resolveDetail = resolve
      })
      const getFixture = apiClient.get
      const get = vi.spyOn(apiClient, 'get').mockImplementation((url) => {
        if (url === '/api/token/1') {
          return Promise.resolve({ data: { success: true, data: first } })
        }
        if (url === '/api/token/2') return detail
        return getFixture(url)
      })
      const put = vi
        .spyOn(api, 'put')
        .mockResolvedValue({ data: { success: true } })
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      })
      renderedDrawer = { queryClient }
      const close = vi.fn()
      const tree = (currentRow: ApiKey, open: boolean) => (
        <QueryClientProvider client={queryClient}>
          <I18nextProvider i18n={i18n}>
            <ApiKeysProvider>
              <ApiKeysMutateDrawer
                open={open}
                currentRow={currentRow}
                onOpenChange={close}
              />
            </ApiKeysProvider>
          </I18nextProvider>
        </QueryClientProvider>
      )
      const view = render(tree(first, true))
      await waitFor(() =>
        expect(findButton('Save changes', true)).toBeEnabled()
      )
      await waitFor(() => expect(screen.getByLabelText('Time')).toBeEnabled())

      if (finish === 'save') {
        fireEvent.click(findButton('Save changes', true))
        await waitFor(() => expect(put).toHaveBeenCalled())
        expect(put.mock.calls[0][1]).toMatchObject({
          id: 1,
          expired_time: 2000000000,
        })
      } else {
        fireEvent.click(screen.getAllByRole('button', { name: 'Close' })[0])
      }
      await waitFor(() => expect(close.mock.calls[0]?.[0]).toBe(false))
      view.rerender(tree(first, false))
      await waitFor(() =>
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      )
      view.rerender(tree(second, true))
      await waitFor(() => expect(get).toHaveBeenCalledWith('/api/token/2'))
      expect(findButton('Save changes', true)).toBeDisabled()
      await act(async () =>
        resolveDetail({ data: { success: true, data: second } })
      )
      await waitFor(() =>
        expect(findButton('Save changes', true)).toBeEnabled()
      )
      expect(
        screen.getByRole('button', { name: 'Never expires' })
      ).toBeVisible()
      expect(screen.getByLabelText('Time')).toBeDisabled()
      fireEvent.click(findButton('Save changes', true))
      await waitFor(() =>
        expect(put).toHaveBeenLastCalledWith(
          '/api/token/',
          expect.objectContaining({ id: 2, expired_time: -1 })
        )
      )
    }
  )

  test.each(['Never', 'Clear'])(
    'submits a non-expiring key when its date is cleared with %s',
    async (action) => {
      const payloads: Array<Record<string, unknown>> = []
      installApiFixtures(payloads)
      await renderCreateDrawer()
      changeInput(getControlByLabel('Name'), 'no-expiry')
      fireEvent.click(screen.getByRole('button', { name: '1 Month' }))
      expect(screen.getByLabelText('Time')).toBeEnabled()
      fireEvent.click(screen.getByRole('button', { name: action }))
      expect(
        screen.getByRole('button', { name: 'Never expires' })
      ).toBeVisible()
      expect(screen.getByLabelText('Time')).toBeDisabled()
      fireEvent.click(findButton('Save changes', true))
      await waitFor(() => expect(payloads).toHaveLength(1))
      expect(payloads[0]?.expired_time).toBe(-1)
    }
  )
})
