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
import { afterEach, describe, expect, test } from 'vitest'

import {
  CONSENT_COOKIE_DOMAIN,
  CONSENT_KEY,
  CONSENT_VERSION,
  canShareConsentCookie,
  readConsentChoice,
  saveConsentChoice,
} from '../consent-storage'

afterEach(() => {
  document.cookie = `${CONSENT_KEY}=; Path=/; Max-Age=0`
  document.cookie = `${CONSENT_KEY}=; Path=/; Domain=.${CONSENT_COOKIE_DOMAIN}; Max-Age=0`
  localStorage.removeItem(CONSENT_KEY)
})

describe('canShareConsentCookie', () => {
  test('covers the marketing site and console subdomain', () => {
    expect(canShareConsentCookie('modeless.ai')).toBe(true)
    expect(canShareConsentCookie('console.modeless.ai')).toBe(true)
    expect(canShareConsentCookie('www.modeless.ai')).toBe(true)
    expect(canShareConsentCookie('evil-modeless.ai')).toBe(false)
    expect(canShareConsentCookie('localhost')).toBe(false)
  })
})

describe('consent storage', () => {
  test('prefers the shared cookie over localStorage', () => {
    localStorage.setItem(
      CONSENT_KEY,
      JSON.stringify({
        v: CONSENT_VERSION,
        analytics: 'denied',
        at: '2026-01-01T00:00:00.000Z',
      })
    )
    document.cookie = `${CONSENT_KEY}=${encodeURIComponent(
      JSON.stringify({
        v: CONSENT_VERSION,
        analytics: 'granted',
        at: '2026-01-02T00:00:00.000Z',
      })
    )}; Path=/`
    expect(readConsentChoice()).toBe('granted')
  })

  test('migrates a localStorage-only choice onto the cookie when the host can share it', () => {
    const written: string[] = []
    const cookieDesc = Object.getOwnPropertyDescriptor(
      Document.prototype,
      'cookie'
    )
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get: () => cookieDesc?.get?.call(document) ?? '',
      set: (value: string) => {
        written.push(value)
        cookieDesc?.set?.call(document, value)
      },
    })
    const originalLocation = window.location
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { hostname: 'console.modeless.ai' },
    })
    localStorage.setItem(
      CONSENT_KEY,
      JSON.stringify({
        v: CONSENT_VERSION,
        analytics: 'granted',
        at: '2026-01-01T00:00:00.000Z',
      })
    )
    expect(readConsentChoice()).toBe('granted')
    expect(
      written.some(
        (row) =>
          row.includes(CONSENT_KEY) &&
          row.includes(`Domain=.${CONSENT_COOKIE_DOMAIN}`)
      )
    ).toBe(true)
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    })
    if (cookieDesc) Object.defineProperty(document, 'cookie', cookieDesc)
  })

  test('ignores a stale version', () => {
    localStorage.setItem(
      CONSENT_KEY,
      JSON.stringify({
        v: 0,
        analytics: 'granted',
        at: '2026-01-01T00:00:00.000Z',
      })
    )
    expect(readConsentChoice()).toBeNull()
  })

  test('saveConsentChoice writes localStorage', () => {
    saveConsentChoice('denied')
    expect(readConsentChoice()).toBe('denied')
  })
})
