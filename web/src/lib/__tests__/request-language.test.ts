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
import type { AxiosAdapter } from 'axios'
import i18next from 'i18next'
import { afterEach, expect, test } from 'vitest'

import { api } from '@/lib/http-client'

const originalAdapter = api.defaults.adapter

afterEach(async () => {
  api.defaults.adapter = originalAdapter
  await i18next.changeLanguage('en')
})

async function statedLanguageOfNextRequest(): Promise<unknown> {
  let stated: unknown
  const adapter: AxiosAdapter = async (config) => {
    stated = config.headers.get('Accept-Language')
    return { data: { success: true }, status: 200, statusText: 'OK', headers: {}, config }
  }
  api.defaults.adapter = adapter
  await api.post('/api/verification')
  return stated
}

// The backend writes emails and messages in the language a request states.
test.each([
  ['en', 'en'],
  ['zhCN', 'zh-CN'],
  ['zhTW', 'zh-TW'],
  ['fr', 'fr'],
  ['ru', 'ru'],
  ['ja', 'ja'],
  ['vi', 'vi'],
  ['not a language', 'en'],
])(
  'a request made while the interface is in %s states %s',
  async (interfaceLanguage, expected) => {
    await i18next.changeLanguage(interfaceLanguage)

    expect(await statedLanguageOfNextRequest()).toBe(expected)
  }
)
