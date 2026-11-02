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
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { api } from '@/lib/api'

import { ResponseModelBillingSettings } from '../response-model-billing-settings'

let queryClient: QueryClient

function renderSettings(defaultValue: string) {
  queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <ResponseModelBillingSettings defaultValue={defaultValue} />
    </QueryClientProvider>
  )
  return screen.getByRole('textbox', { name: 'Response model billing' })
}

beforeEach(() => {
  vi.spyOn(api, 'put').mockResolvedValue({ data: { success: true } })
})

afterEach(() => {
  queryClient.clear()
  vi.restoreAllMocks()
})

test('saving an edited rule sends the compact option value', async () => {
  const editor = renderSettings('{}')

  fireEvent.input(editor, {
    target: {
      value:
        '{\n  "router/auto": { "fee_rate": 0.05, "models": { "vendor/cheap": "auto/cheap" } }\n}',
    },
  })
  fireEvent.click(
    screen.getByRole('button', { name: 'Save response model billing' })
  )

  await waitFor(() =>
    expect(api.put).toHaveBeenCalledWith('/api/option/', {
      key: 'billing_setting.response_model_billing',
      value:
        '{"router/auto":{"fee_rate":0.05,"models":{"vendor/cheap":"auto/cheap"}}}',
    })
  )
})

test('an emptied editor saves an empty rule set', async () => {
  const editor = renderSettings('{"router/auto":{"fee_rate":0.05}}')

  fireEvent.input(editor, { target: { value: '' } })
  fireEvent.click(
    screen.getByRole('button', { name: 'Save response model billing' })
  )

  await waitFor(() =>
    expect(api.put).toHaveBeenCalledWith('/api/option/', {
      key: 'billing_setting.response_model_billing',
      value: '{}',
    })
  )
})

test.each(['[]', '{"router/auto":'])(
  'text %s that is not a JSON object blocks saving',
  (value) => {
    const editor = renderSettings('{}')
    const save = screen.getByRole('button', {
      name: 'Save response model billing',
    })

    fireEvent.input(editor, { target: { value } })

    expect(editor).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('JSON must be an object')).toBeInTheDocument()
    expect(save).toBeDisabled()
  }
)
