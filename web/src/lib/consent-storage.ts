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
/**
 * Shared analytics-consent storage for the Modeless marketing site and
 * console. The cookie name, JSON shape, version and Domain=.modeless.ai
 * must stay in sync with BeyondHarnessLab/modeless-web
 * (src/components/site/consent.tsx and this helper's counterpart) so a
 * choice on https://modeless.ai is honored on https://console.modeless.ai
 * without a second prompt.
 */
export const CONSENT_KEY = 'modeless-consent'
export const COOKIE_SETTINGS_ATTR = 'data-cookie-settings'
export const CONSENT_VERSION = 1
export const CONSENT_COOKIE_DOMAIN = 'modeless.ai'
const CONSENT_MAX_AGE_SECONDS = 60 * 60 * 24 * 365

export type ConsentChoice = 'granted' | 'denied'

type StoredConsent = {
  v: number
  analytics: ConsentChoice
  at: string
}

export function isConsentChoice(value: unknown): value is ConsentChoice {
  return value === 'granted' || value === 'denied'
}

function parseStored(raw: string | null | undefined): ConsentChoice | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<StoredConsent>
    if (parsed?.v !== CONSENT_VERSION || !isConsentChoice(parsed.analytics)) {
      return null
    }
    return parsed.analytics
  } catch {
    return null
  }
}

export function canShareConsentCookie(hostname: string): boolean {
  return (
    hostname === CONSENT_COOKIE_DOMAIN ||
    hostname.endsWith(`.${CONSENT_COOKIE_DOMAIN}`)
  )
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const prefix = `${name}=`
  for (const part of document.cookie.split(';')) {
    const piece = part.trim()
    if (piece.startsWith(prefix)) {
      return decodeURIComponent(piece.slice(prefix.length))
    }
  }
  return null
}

function writeCookie(choice: ConsentChoice) {
  if (typeof document === 'undefined' || typeof window === 'undefined') return
  if (!canShareConsentCookie(window.location.hostname)) return
  const value = encodeURIComponent(
    JSON.stringify({
      v: CONSENT_VERSION,
      analytics: choice,
      at: new Date().toISOString(),
    } satisfies StoredConsent)
  )
  document.cookie = [
    `${CONSENT_KEY}=${value}`,
    'Path=/',
    `Domain=.${CONSENT_COOKIE_DOMAIN}`,
    `Max-Age=${CONSENT_MAX_AGE_SECONDS}`,
    'Secure',
    'SameSite=Lax',
  ].join('; ')
}

function readLocal(): ConsentChoice | null {
  try {
    return parseStored(localStorage.getItem(CONSENT_KEY))
  } catch {
    return null
  }
}

function writeLocal(choice: ConsentChoice) {
  try {
    localStorage.setItem(
      CONSENT_KEY,
      JSON.stringify({
        v: CONSENT_VERSION,
        analytics: choice,
        at: new Date().toISOString(),
      } satisfies StoredConsent)
    )
  } catch {
    // storage blocked: cookie (or this page view) still holds the choice
  }
}

/** Cookie first (shared across modeless.ai hosts), then localStorage. */
export function readConsentChoice(): ConsentChoice | null {
  const fromCookie = parseStored(readCookie(CONSENT_KEY))
  if (fromCookie) {
    writeLocal(fromCookie)
    return fromCookie
  }
  const fromLocal = readLocal()
  if (fromLocal) {
    writeCookie(fromLocal)
    return fromLocal
  }
  return null
}

export function saveConsentChoice(choice: ConsentChoice) {
  writeLocal(choice)
  writeCookie(choice)
}
