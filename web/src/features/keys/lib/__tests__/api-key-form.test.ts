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
import { describe, expect, test } from 'vitest'

import type { ApiKey } from '../../types'
import {
  getApiKeyFormDefaultValues,
  transformApiKeyToFormDefaults,
  transformFormDataToPayload,
} from '../api-key-form'

const baseApiKey: ApiKey = {
  id: 1,
  name: 'test',
  key: 'sk-test',
  status: 1,
  remain_quota: 0,
  used_quota: 0,
  unlimited_quota: true,
  expired_time: -1,
  created_time: 1,
  accessed_time: 0,
  group: 'auto',
  auto_groups: null,
  cross_group_retry: true,
  model_limits_enabled: false,
  model_limits: '',
  allow_ips: '',
  allow_user_quota_query: false,
}

describe('API key group mapping', () => {
  test('gives a new key the auto group with cross-group retry when auto is the default', () => {
    const payload = transformFormDataToPayload(getApiKeyFormDefaultValues(true))

    expect(payload.group).toBe('auto')
    expect(payload.cross_group_retry).toBe(true)
  })

  test('gives a new key the user group without cross-group retry when auto is not the default', () => {
    const payload = transformFormDataToPayload(
      getApiKeyFormDefaultValues(false)
    )

    expect(payload.group).toBe('')
    expect(payload.cross_group_retry).toBe(false)
  })

  test('leaves auto_groups out of the payload so the server keeps the stored order', () => {
    const payload = transformFormDataToPayload(
      transformApiKeyToFormDefaults({
        ...baseApiKey,
        auto_groups: ['vip', 'default'],
      })
    )

    expect(payload).not.toHaveProperty('auto_groups')
  })
})

describe('API key settings the drawer no longer shows', () => {
  test('saves an edited key with its stored group, model limits and IP whitelist', () => {
    const payload = transformFormDataToPayload(
      transformApiKeyToFormDefaults({
        ...baseApiKey,
        group: 'vip',
        cross_group_retry: false,
        model_limits_enabled: true,
        model_limits: 'gpt-4o,claude-sonnet',
        allow_ips: '10.0.0.0/8',
      })
    )

    expect(payload).toMatchObject({
      group: 'vip',
      cross_group_retry: false,
      model_limits_enabled: true,
      model_limits: 'gpt-4o,claude-sonnet',
      allow_ips: '10.0.0.0/8',
    })
  })

  test('creates a key without model limits or an IP whitelist', () => {
    const payload = transformFormDataToPayload(getApiKeyFormDefaultValues(true))

    expect(payload).toMatchObject({
      model_limits_enabled: false,
      model_limits: '',
      allow_ips: '',
    })
  })

  test('lets a new key query the user quota by default', () => {
    for (const defaultUseAutoGroup of [true, false]) {
      const defaults = getApiKeyFormDefaultValues(defaultUseAutoGroup)

      expect(transformFormDataToPayload(defaults).allow_user_quota_query).toBe(
        true
      )
    }
  })

  test.each([true, false])(
    'keeps the stored user quota query value %s when an existing key is saved',
    (stored) => {
      const defaults = transformApiKeyToFormDefaults({
        ...baseApiKey,
        allow_user_quota_query: stored,
      })

      expect(transformFormDataToPayload(defaults).allow_user_quota_query).toBe(
        stored
      )
    }
  )
})
