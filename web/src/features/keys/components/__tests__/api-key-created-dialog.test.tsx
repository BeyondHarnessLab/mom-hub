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
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createInstance } from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { ApiKeysDialogs } from '../api-keys-dialogs'
import { ApiKeysProvider, useApiKeys } from '../api-keys-provider'

const createdKey = 'test-only-created-key'
const i18n = createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: { en: { translation: {} } },
})
let queryClient: QueryClient

function OpenCreateDrawer() {
  const { setOpen } = useApiKeys()
  return (
    <button type='button' onClick={() => setOpen('create')}>
      open create
    </button>
  )
}

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const freshAt = Date.now() + 60_000
  queryClient.setQueryData(
    ['status'],
    {
      chats: [
        { 'Web Chat': 'https://chat.example/?key={key}' },
        { 'CC Switch': 'ccswitch' },
      ],
    },
    { updatedAt: freshAt }
  )
  queryClient.setQueryData(
    ['user-groups'],
    { success: true, data: { default: { desc: 'Standard', ratio: 1 } } },
    { updatedAt: freshAt }
  )
  queryClient.setQueryData(['user-models-ccswitch'], {
    success: true,
    data: ['gpt-test'],
  })
  vi.spyOn(api, 'post').mockResolvedValue({
    data: { success: true, data: { id: 9, name: 'ci', key: createdKey } },
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  queryClient.clear()
})

async function createKey() {
  const user = userEvent.setup()
  render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <ApiKeysProvider>
          <OpenCreateDrawer />
          <ApiKeysDialogs />
        </ApiKeysProvider>
      </I18nextProvider>
    </QueryClientProvider>
  )
  await user.click(screen.getByRole('button', { name: 'open create' }))
  await user.type(await screen.findByLabelText('Name'), 'ci')
  const save = screen.getByRole('button', { name: 'Save changes' })
  await waitFor(() => expect(save).toBeEnabled())
  await user.click(save)
  await screen.findByRole('dialog', { name: 'Save your API key' })
  return user
}

it('shows the full key once after creation and discards it when closed', async () => {
  const user = await createKey()
  const copy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()

  expect(screen.getByDisplayValue(`sk-${createdKey}`)).toHaveAttribute(
    'readonly'
  )
  await user.click(screen.getByRole('button', { name: 'Copy API key' }))
  await waitFor(() => expect(copy).toHaveBeenCalledWith(`sk-${createdKey}`))

  await user.click(screen.getByRole('button', { name: "I've saved it" }))
  await waitFor(() =>
    expect(
      screen.queryByRole('dialog', { name: 'Save your API key' })
    ).not.toBeInTheDocument()
  )
  expect(screen.queryByDisplayValue(`sk-${createdKey}`)).not.toBeInTheDocument()
})

it('returns to the created key after closing CC Switch', async () => {
  const user = await createKey()

  // The admin's bare "ccswitch" preset is the same import, so one button.
  expect(screen.getAllByRole('button', { name: 'CC Switch' })).toHaveLength(1)
  await user.click(screen.getByRole('button', { name: 'CC Switch' }))
  await screen.findByRole('dialog', { name: 'Import to CC Switch' })
  await user.click(screen.getByRole('button', { name: 'Cancel' }))

  await screen.findByRole('dialog', { name: 'Save your API key' })
  expect(screen.getByDisplayValue(`sk-${createdKey}`)).toBeInTheDocument()
})

it('opens a chat app with the created key', async () => {
  const user = await createKey()
  const open = vi.spyOn(window, 'open').mockReturnValue(null)

  await user.click(screen.getByRole('button', { name: 'Web Chat' }))

  expect(open).toHaveBeenCalledWith(
    `https://chat.example/?key=sk-${createdKey}`,
    '_blank',
    'noopener'
  )
})
