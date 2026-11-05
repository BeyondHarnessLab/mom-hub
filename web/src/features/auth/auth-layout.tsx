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
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { ProjectAttribution } from '@/components/layout/components/footer'
import { Skeleton } from '@/components/ui/skeleton'
import { useSystemConfig } from '@/hooks/use-system-config'
import { cn } from '@/lib/utils'

type AuthLayoutProps = {
  children: React.ReactNode
}

export function AuthLayout({ children }: AuthLayoutProps) {
  const { t } = useTranslation()
  const { systemName, logo, loading } = useSystemConfig()

  return (
    <div className='bg-background relative flex min-h-svh flex-col overflow-hidden'>
      <div
        aria-hidden
        className='bg-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]'
      />
      <header className='relative z-10 flex h-16 items-center px-4 sm:px-8'>
        <Link
          to='/'
          className='flex items-center gap-2.5 transition-opacity hover:opacity-80'
        >
          <div className='relative size-[30px]'>
            {loading ? (
              <Skeleton className='absolute inset-0 rounded-[7px]' />
            ) : (
              <img
                src={logo}
                alt={t('Logo')}
                className='size-[30px] rounded-[7px] object-contain'
              />
            )}
          </div>
          {loading ? (
            <Skeleton className='h-5 w-24' />
          ) : (
            <span className='text-[17px] font-semibold tracking-[-0.02em]'>
              {systemName}
            </span>
          )}
        </Link>
      </header>
      <main className='relative z-10 flex flex-1 items-center justify-center px-4 pt-4 pb-8'>
        <div
          className={cn(
            'bg-card w-full max-w-[440px] rounded-[18px] border p-6 sm:p-9',
            'shadow-[0_1px_2px_rgb(20_23_28/0.04),0_12px_32px_-16px_rgb(20_23_28/0.18)]',
            'dark:shadow-none',
            '[&_input[data-slot=form-control]]:h-10 [&_form_button[type=submit]]:h-10 [&_form_button[type=submit]]:font-semibold'
          )}
        >
          <div className='flex flex-col justify-center space-y-2'>
            {children}
          </div>
        </div>
      </main>
      {/* Upstream attribution required by NOTICE (AGPLv3 section 7(b)). */}
      <footer className='relative z-10 px-4 pb-6 text-center text-xs leading-relaxed'>
        <ProjectAttribution currentYear={new Date().getFullYear()} inline />
      </footer>
    </div>
  )
}
