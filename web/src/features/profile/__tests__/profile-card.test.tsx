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
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'

import { ProfileCard } from '../components/profile-card'
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

function renderProfileCard() {
  return render(
    <ProfileCard
      profile={profile}
      loading={false}
      onProfileUpdate={() => undefined}
      quotaRemindEnabled
      quotaRemindThreshold={1000}
    />
  )
}

it('the profile shows identity, language and settings inside a single card', () => {
  const { container } = renderProfileCard()

  const cards = container.querySelectorAll('[data-slot="card"]')
  expect(cards).toHaveLength(1)
  const card = cards[0] as HTMLElement
  expect(within(card).getByRole('heading', { name: 'Alice' })).toBeVisible()
  expect(
    within(card).getByRole('region', { name: 'Language Preferences' })
  ).toBeVisible()
  expect(within(card).getByRole('region', { name: 'Settings' })).toBeVisible()
  expect(
    within(card).getByRole('button', { name: 'Save Settings' })
  ).toBeVisible()
})

it('the profile card shows no balance, usage or request stats', () => {
  renderProfileCard()

  for (const stat of ['Current Balance', 'Total Usage', 'API Requests']) {
    expect(screen.queryByText(stat)).not.toBeInTheDocument()
  }
})
