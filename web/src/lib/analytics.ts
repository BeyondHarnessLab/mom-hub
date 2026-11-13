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
export const GA_READY_EVENT = 'modeless:ga-ready'
const GA_ID_PATTERN = /^G-[A-Z0-9]+$/

type Params = Record<string, string | number | boolean>
type Queued = [string, Params]

let queue: Queued[] = []
let listening = false

declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
  }
}

export function isMeasurementId(value: unknown): value is string {
  return typeof value === 'string' && GA_ID_PATTERN.test(value)
}

export function normalizeLinkerDomains(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') continue
    const domain = item.trim().toLowerCase()
    if (!domain || /[/?:#\s]/.test(domain) || seen.has(domain)) continue
    seen.add(domain)
    out.push(domain)
  }
  return out
}

function flush() {
  if (!window.gtag) return
  for (const [event, params] of queue) window.gtag('event', event, params)
  queue = []
}

function enqueue(event: string, params: Params) {
  queue.push([event, params])
  if (queue.length > 50) queue.shift()
  if (listening) return
  listening = true
  window.addEventListener(GA_READY_EVENT, flush, { once: true })
}

/** Send a GA4 event. No-op until the visitor has accepted analytics. */
export function track(event: string, params: Params = {}) {
  if (typeof window === 'undefined') return
  if (window.gtag) {
    window.gtag('event', event, params)
    return
  }
  enqueue(event, params)
}

export function pageView(pathname: string) {
  if (typeof window === 'undefined') return
  track('page_view', {
    page_location: window.location.href,
    page_path: pathname,
    page_title: document.title,
  })
}

/**
 * Install gtag only after consent. Reject means this is never called, so
 * googletagmanager.com is not loaded at all.
 */
export function bootGtag(id: string, linkerDomains: string[]) {
  if (typeof window === 'undefined' || !isMeasurementId(id)) return
  if (window.gtag) return

  const dataLayer: unknown[] = window.dataLayer || []
  window.dataLayer = dataLayer
  window.gtag = function gtag() {
    // gtag requires the Arguments object, not a rest array.
    // eslint-disable-next-line prefer-rest-params
    dataLayer.push(arguments)
  }
  window.gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'granted',
  })
  window.gtag('js', new Date())
  const config: Record<string, unknown> = {
    anonymize_ip: true,
    send_page_view: false,
  }
  if (linkerDomains.length > 0) {
    config.linker = { domains: linkerDomains }
  }
  window.gtag('config', id, config)

  if (!document.querySelector('#ga')) {
    const script = document.createElement('script')
    script.id = 'ga'
    script.async = true
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`
    document.head.appendChild(script)
  }
  window.dispatchEvent(new Event(GA_READY_EVENT))
}

export function hasAnalyticsConfigured(status: unknown): boolean {
  const id =
    status &&
    typeof status === 'object' &&
    'google_analytics_id' in status &&
    (status as { google_analytics_id?: unknown }).google_analytics_id
  return isMeasurementId(id)
}
