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

import { getApiBaseUrl } from '../api-base-url'

describe('getApiBaseUrl', () => {
  test.each([
    {
      name: 'API Address wins over Server Address',
      status: {
        api_address: 'https://api.example.com',
        server_address: 'https://console.example.com',
      },
      expected: 'https://api.example.com',
    },
    {
      name: 'blank API Address falls back to Server Address',
      status: {
        api_address: '  ',
        server_address: 'https://console.example.com/',
      },
      expected: 'https://console.example.com',
    },
    {
      name: 'surrounding spaces and trailing slashes are removed',
      status: { api_address: ' https://api.example.com/gateway// ' },
      expected: 'https://api.example.com/gateway',
    },
    {
      name: 'non-string values are ignored',
      status: { api_address: 42, server_address: null },
      expected: window.location.origin,
    },
  ])('$name', ({ status, expected }) => {
    expect(getApiBaseUrl(status)).toBe(expected)
  })

  test('without a configured address returns the current origin by default', () => {
    expect(getApiBaseUrl(null)).toBe(window.location.origin)
  })

  test('without a configured address returns the given fallback', () => {
    expect(getApiBaseUrl({ api_address: '', server_address: '' }, '')).toBe('')
  })
})
