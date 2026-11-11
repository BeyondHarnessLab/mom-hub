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
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { RoutedModelPricesCard } from '../components/routed-model-prices-card'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function renderCard(data: unknown) {
  vi.spyOn(api, 'get').mockResolvedValue({ data: { success: true, data } })
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <RoutedModelPricesCard />
    </QueryClientProvider>
  )
}

it('lists each routed model with the routers that reach it and its own prices', async () => {
  renderCard([
    {
      model_name: 'anthropic/claude-opus-5-5',
      routers: ['nvrouter/auto'],
      billing_expr: 'tier("base", p * 5 + c * 25 + cr * 0.5)',
    },
    {
      model_name: 'zai-org/glm-5.3-flash',
      routers: ['nvrouter/auto', 'nvrouter/fusion'],
      billing_expr: 'tier("base", p * 0.1 + c * 0.4 + cr * 0.02)',
    },
  ])

  const opus = await screen.findByRole('row', {
    name: /anthropic\/claude-opus-5-5/,
  })
  const glm = screen.getByRole('row', { name: /zai-org\/glm-5\.3-flash/ })
  expect(api.get).toHaveBeenCalledWith('/api/user/routed_model_pricing')
  expect(within(opus).getByText('nvrouter/auto')).toBeVisible()
  expect(within(opus).queryByText('nvrouter/fusion')).not.toBeInTheDocument()
  expect(within(glm).getByText('nvrouter/auto')).toBeVisible()
  expect(within(glm).getByText('nvrouter/fusion')).toBeVisible()
  // The model's own prices per 1M tokens, with no router fee on top.
  expect(opus).toHaveTextContent(/Input\s*5(?![\d.])/)
  expect(opus).toHaveTextContent(/Output\s*25(?![\d.])/)
  expect(opus).toHaveTextContent(/\$0\.5(?!\d)/)
})

it.each([
  { name: 'no router model is set up for the user', data: [] },
  { name: 'the server answers with something other than a list', data: {} },
])('shows nothing when $name', async (row) => {
  renderCard(row.data)

  await vi.waitFor(() =>
    expect(api.get).toHaveBeenCalledWith('/api/user/routed_model_pricing')
  )
  expect(screen.queryByText('Routed model prices')).not.toBeInTheDocument()
})
