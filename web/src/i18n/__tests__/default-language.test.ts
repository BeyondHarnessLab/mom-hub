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
import { createInstance } from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { i18nOptions } from '../options'

async function openConsole() {
  const instance = createInstance()
  await instance.use(LanguageDetector).init({ ...i18nOptions, debug: false })
  return instance
}

function useChineseBrowser() {
  vi.spyOn(navigator, 'language', 'get').mockReturnValue('zh-CN')
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['zh-CN', 'zh'])
}

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('interface language when the console opens', () => {
  test('a first visit from a Chinese browser opens in English', async () => {
    useChineseBrowser()

    const console = await openConsole()

    expect(console.language).toBe('en')
  })

  test('a language the user picked is kept on the next visit', async () => {
    useChineseBrowser()
    const firstVisit = await openConsole()
    await firstVisit.changeLanguage('zhTW')

    const nextVisit = await openConsole()

    expect(nextVisit.language).toBe('zhTW')
  })

  test('a language detected from the browser by earlier versions is dropped', async () => {
    useChineseBrowser()
    localStorage.setItem('i18nextLng', 'zhCN')

    const console = await openConsole()

    expect(console.language).toBe('en')
  })
})
