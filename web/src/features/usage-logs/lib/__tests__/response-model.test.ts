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

import {
  getModelCalls,
  isResponseModelMismatch,
  type ResponseModelObservation,
} from '../response-model'

function observation(
  returned: string,
  overrides: Partial<ResponseModelObservation> = {}
): ResponseModelObservation {
  return {
    requested_model: 'requested',
    upstream_model: 'mapped',
    returned_model: returned,
    ...overrides,
  }
}

describe('isResponseModelMismatch', () => {
  test.each([
    ['requested', 'exact requested model'],
    ['mapped', 'exact upstream model'],
    ['Requested', 'case-only difference'],
    ['requested-2026-09-01', 'dated variant of the requested model'],
    ['mapped-2026-09-01', 'dated variant of the upstream model'],
    ['deepseek/requested', 'provider path in front of the requested model'],
    ['vendor/MAPPED', 'provider path with a case-only difference'],
    ['accounts/vendor/models/requested', 'nested provider path'],
  ])('treats %s as compatible (%s)', (returned) => {
    expect(isResponseModelMismatch(observation(returned))).toBe(false)
  })

  test.each([
    ['other', 'different model'],
    ['request', 'shorter name that the expected model extends'],
    ['vendor/other', 'different model behind a provider path'],
    ['vendor/request', 'provider path with a shorter name'],
    ['vendor/', 'provider path with no model segment'],
    ['vendor', 'provider segment alone'],
  ])('flags %s as a mismatch (%s)', (returned) => {
    expect(isResponseModelMismatch(observation(returned))).toBe(true)
  })

  test('compares against provider-qualified requested and upstream names as written', () => {
    expect(
      isResponseModelMismatch(
        observation('vendor/requested-2026-09-01', {
          requested_model: 'vendor/requested',
        })
      )
    ).toBe(false)
    expect(
      isResponseModelMismatch(
        observation('vendor/other', { requested_model: 'vendor/requested' })
      )
    ).toBe(true)
  })

  test('empty expected names never match', () => {
    expect(
      isResponseModelMismatch(
        observation('other', { requested_model: '', upstream_model: '' })
      )
    ).toBe(true)
  })

  test('returns false without an observation or a returned model', () => {
    expect(isResponseModelMismatch(undefined)).toBe(false)
    expect(isResponseModelMismatch(observation(''))).toBe(false)
  })
})

describe('getModelCalls', () => {
  test('returns no rows when the log reports no model calls', () => {
    expect(
      getModelCalls({ prompt_tokens: 10, completion_tokens: 5 }, {})
    ).toEqual([])
  })

  test('puts the aggregator first with the log usage and its share, then each call', () => {
    expect(
      getModelCalls(
        { prompt_tokens: 1811, completion_tokens: 135 },
        {
          cache_tokens: 64,
          settle_model: 'deepseek/deepseek-v4.1-flash',
          response_quota: 371,
          model_calls: [
            {
              role: 'advisor',
              model: 'zai-org/glm-5.3-flash',
              prompt_tokens: 508,
              completion_tokens: 765,
              quota: 241,
            },
          ],
        }
      )
    ).toEqual([
      {
        role: 'aggregator',
        model: 'deepseek/deepseek-v4.1-flash',
        promptTokens: 1811,
        completionTokens: 135,
        cacheTokens: 64,
        quota: 371,
        keptEntryPrice: false,
      },
      {
        role: 'advisor',
        model: 'zai-org/glm-5.3-flash',
        promptTokens: 508,
        completionTokens: 765,
        cacheTokens: 0,
        quota: 241,
        keptEntryPrice: false,
      },
    ])
  })

  test('reads calls from admin_info on older logs and marks calls that kept the entry price', () => {
    const rows = getModelCalls(
      { prompt_tokens: 1811, completion_tokens: 135 },
      {
        admin_info: {
          response_model_billing: {
            response_model: 'deepseek/deepseek-v4.1-flash',
            billing_model: 'auto-nv/deepseek-v4.1-flash',
            calls: [
              {
                role: 'advisor',
                response_model: 'vendor/other',
                fallback: 'unlisted_response_model',
                prompt_tokens: 662,
                completion_tokens: 35,
                cache_tokens: 159,
                quota: 106,
              },
            ],
          },
        },
      }
    )
    expect(
      rows.map((row) => [row.model, row.quota, row.keptEntryPrice])
    ).toEqual([
      ['deepseek/deepseek-v4.1-flash', undefined, false],
      ['vendor/other', 106, true],
    ])
  })
})
