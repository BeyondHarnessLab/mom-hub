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
import { useTranslation } from 'react-i18next'

import { StatusBadge } from '@/components/status-badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { getUserAvatarFallback, getUserAvatarStyle } from '@/lib/avatar'
import { getRoleLabel } from '@/lib/roles'

import { getDisplayName } from '../lib'
import type { UserProfile } from '../types'

interface ProfileHeaderProps {
  profile: UserProfile | null
  loading: boolean
}

/** Who the user is, centred above their settings. */
export function ProfileHeader(props: ProfileHeaderProps) {
  const { t } = useTranslation()
  const profile = props.profile

  if (props.loading) {
    return (
      <div className='flex flex-col items-center gap-3'>
        <Skeleton className='size-24 rounded-2xl' />
        <Skeleton className='h-8 w-48' />
        <Skeleton className='h-4 w-40' />
        <Skeleton className='h-6 w-36' />
      </div>
    )
  }

  if (!profile) return null

  const displayName = getDisplayName(profile)
  const avatarName = profile.username || displayName
  const details = [`@${profile.username}`, profile.email, profile.group].filter(
    Boolean
  )

  return (
    <header className='flex flex-col items-center gap-3 text-center'>
      <Avatar className='ring-card size-24 rounded-2xl text-2xl ring-4'>
        <AvatarFallback
          className='rounded-2xl font-semibold text-white'
          style={getUserAvatarStyle(avatarName)}
        >
          {getUserAvatarFallback(avatarName)}
        </AvatarFallback>
      </Avatar>
      <div className='flex max-w-full min-w-0 flex-col gap-1'>
        <h1 className='truncate text-2xl font-semibold tracking-tight'>
          {displayName}
        </h1>
        <p className='text-muted-foreground truncate text-sm'>
          {details.join(' · ')}
        </p>
      </div>
      <div className='flex flex-wrap items-center justify-center gap-2'>
        <StatusBadge
          label={getRoleLabel(profile.role)}
          variant='neutral'
          copyable={false}
        />
        <StatusBadge
          label={`${t('User ID')} ${profile.id}`}
          variant='info'
          copyText={String(profile.id)}
        />
      </div>
    </header>
  )
}
