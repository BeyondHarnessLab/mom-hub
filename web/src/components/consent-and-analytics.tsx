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
import { useRouterState } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { useStatus } from '@/hooks/use-status'
import {
  bootGtag,
  isMeasurementId,
  normalizeLinkerDomains,
  pageView,
} from '@/lib/analytics'
import {
  type ConsentChoice,
  COOKIE_SETTINGS_ATTR,
  readConsentChoice,
  saveConsentChoice,
} from '@/lib/consent-storage'

/**
 * Cookie consent + Google Analytics 4.
 *
 * Nothing from Google loads until the visitor accepts. Reject means no
 * gtag.js at all. The choice is stored in a Domain=.modeless.ai cookie
 * (and localStorage) so a decision on the marketing site is reused here.
 */
export function ConsentAndAnalytics() {
  const { status } = useStatus()
  const gaId = isMeasurementId(status?.google_analytics_id)
    ? status.google_analytics_id
    : ''
  const linkerDomains = normalizeLinkerDomains(status?.ga_linker_domains)
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })

  const [choice, setChoice] = useState<ConsentChoice | null | undefined>(
    undefined
  )
  const [open, setOpen] = useState(false)
  const lastTrackedPath = useRef<string | null>(null)

  useEffect(() => {
    const current = readConsentChoice()
    setChoice(current)
    setOpen(current === null)
    const reopen = (event: Event) => {
      const target = (event.target as HTMLElement | null)?.closest(
        `[${COOKIE_SETTINGS_ATTR}]`
      )
      if (!target) return
      event.preventDefault()
      setOpen(true)
    }
    document.addEventListener('click', reopen)
    return () => document.removeEventListener('click', reopen)
  }, [])

  useEffect(() => {
    if (!gaId || choice !== 'granted') return
    bootGtag(gaId, linkerDomains)
  }, [gaId, choice, linkerDomains])

  useEffect(() => {
    if (!gaId || choice !== 'granted') return
    if (lastTrackedPath.current === pathname) return
    lastTrackedPath.current = pathname
    pageView(pathname)
  }, [gaId, choice, pathname])

  if (!gaId) return null

  const decide = (next: ConsentChoice) => {
    saveConsentChoice(next)
    setChoice(next)
    setOpen(false)
    if (window.gtag) {
      window.gtag('consent', 'update', { analytics_storage: next })
    }
    if (next === 'denied' && choice === 'granted') {
      window.location.reload()
    }
  }

  if (!open) return null

  return (
    <section
      role='dialog'
      aria-modal='false'
      aria-labelledby='consent-title'
      aria-describedby='consent-body'
      className='bg-card ring-foreground/10 fixed inset-x-3 bottom-3 z-50 mx-auto max-w-[560px] rounded-2xl p-5 shadow-lg ring-1 md:inset-x-auto md:right-6 md:bottom-6 md:p-6'
    >
      <h2
        id='consent-title'
        className='text-[17px] font-medium tracking-[-0.01em]'
      >
        Analytics cookies
      </h2>
      <p
        id='consent-body'
        className='text-muted-foreground mt-2 text-sm leading-[1.6]'
      >
        With your OK we use Google Analytics to count visits and see which pages
        help. No ads, no selling data. If you already chose this on modeless.ai,
        we reuse that choice. You can change it any time from &ldquo;Cookie
        settings&rdquo;. See the{' '}
        <a
          href={
            status?.privacy_policy_enabled
              ? '/privacy-policy'
              : 'https://modeless.ai/privacy-policy'
          }
          className='text-foreground border-b border-current'
        >
          Privacy Policy
        </a>
        .
      </p>
      <div className='mt-4 flex flex-wrap gap-2.5'>
        <Button type='button' size='sm' onClick={() => decide('granted')}>
          Accept analytics
        </Button>
        <Button
          type='button'
          size='sm'
          variant='outline'
          onClick={() => decide('denied')}
        >
          Reject
        </Button>
      </div>
    </section>
  )
}
