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
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'

import { SidebarProvider } from '@/components/ui/sidebar'

import { ChatPresetsItem } from '../chat-presets-item'

test('lists only chat presets that do not embed the API key', async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  client.setQueryData(['status'], {
    chats: [
      { 'Key Chat': 'https://chat.example/?key={key}' },
      { 'Cherry Studio': 'cherrystudio://providers?data={cherryConfig}' },
      { 'Open Chat': 'https://open-chat.example/' },
    ],
  })
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => (
        <SidebarProvider defaultOpen>
          <ChatPresetsItem item={{ title: 'Chat', type: 'chat-presets' }} />
        </SidebarProvider>
      ),
    }),
    history: createMemoryHistory({ initialEntries: ['/dashboard'] }),
  })
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )

  await userEvent.click(await screen.findByRole('button', { name: 'Chat' }))

  expect(await screen.findByText('Open Chat')).toBeInTheDocument()
  expect(screen.queryByText('Key Chat')).not.toBeInTheDocument()
  expect(screen.queryByText('Cherry Studio')).not.toBeInTheDocument()
})
