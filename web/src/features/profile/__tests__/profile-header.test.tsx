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

import { ProfileHeader } from '../components/profile-header'
import type { UserProfile } from '../types'

const profile: UserProfile = {
  id: 7,
  username: 'alice',
  display_name: 'Alice',
  role: 1,
  group: 'default',
  quota: 1000000,
  used_quota: 2500,
  request_count: 42,
  status: 1,
  aff_count: 0,
  aff_quota: 0,
  aff_history_quota: 0,
  created_time: 0,
}

afterEach(() => {
  cleanup()
})

function renderProfileHeader() {
  return render(<ProfileHeader profile={profile} loading={false} />)
}

it('the header shows the name, role, user ID, username and group', () => {
  renderProfileHeader()

  expect(screen.getByRole('heading', { name: 'Alice' })).toBeVisible()
  expect(screen.getByText('@alice · default')).toBeVisible()
  for (const badge of ['User', 'User ID 7']) {
    expect(screen.getByText(badge)).toBeVisible()
  }
})

it('the header shows no balance, usage or request stats', () => {
  renderProfileHeader()

  for (const stat of ['Current Balance', 'Total Usage', 'API Requests']) {
    expect(screen.queryByText(stat)).not.toBeInTheDocument()
  }
})
