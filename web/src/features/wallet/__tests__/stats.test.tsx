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
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'

import { WalletStatsCard } from '../components/wallet-stats-card'

afterEach(() => cleanup())

it('the wallet stats show balance and total usage, and no API request count', () => {
  render(
    <WalletStatsCard
      user={{
        id: 1,
        username: 'alice',
        quota: 500000,
        used_quota: 250000,
        request_count: 42,
        aff_quota: 0,
        aff_history_quota: 0,
        aff_count: 0,
        group: 'default',
      }}
    />
  )

  expect(screen.getByText('Current Balance')).toBeVisible()
  expect(screen.getByText('Total Usage')).toBeVisible()
  expect(screen.queryByText('API Requests')).not.toBeInTheDocument()
  expect(screen.queryByText('42')).not.toBeInTheDocument()
})
