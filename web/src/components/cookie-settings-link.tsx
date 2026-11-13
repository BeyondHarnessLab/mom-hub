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
import { useStatus } from '@/hooks/use-status'
import { hasAnalyticsConfigured } from '@/lib/analytics'
import { cn } from '@/lib/utils'

type CookieSettingsLinkProps = {
  className?: string
  leadingSeparator?: boolean
}

/** Reopens the analytics consent banner. Hidden when GA is not configured. */
export function CookieSettingsLink(props: CookieSettingsLinkProps) {
  const { status } = useStatus()
  if (!hasAnalyticsConfigured(status)) return null

  return (
    <>
      {props.leadingSeparator ? (
        <span aria-hidden='true' className='text-muted-foreground/30'>
          ·
        </span>
      ) : null}
      <button
        type='button'
        data-cookie-settings='true'
        className={cn(
          'text-muted-foreground hover:text-foreground transition-colors duration-200',
          props.className
        )}
      >
        Cookie settings
      </button>
    </>
  )
}
