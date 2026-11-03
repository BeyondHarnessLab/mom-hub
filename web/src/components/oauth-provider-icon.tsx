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
import type { ReactNode } from 'react'

import {
  IconDiscord,
  IconFacebook,
  IconGithub,
  IconGitlab,
  IconNotion,
  IconSlack,
  IconTelegram,
  IconWeChat,
} from '@/assets/brand-icons'
import { ReactIconByName } from '@/components/react-icon-by-name'
import { getLobeIcon } from '@/lib/lobe-icon'

// Brand keys stored by the classic frontend and the provider presets. Bundled
// and LobeHub icons come first; the Simple Icons pack is several MB and only
// loads for keys that have no smaller source.
const OAUTH_BRAND_ICONS: Record<string, (size: number) => ReactNode> = {
  github: (size) => <IconGithub width={size} height={size} />,
  gitlab: (size) => <IconGitlab width={size} height={size} />,
  discord: (size) => <IconDiscord width={size} height={size} />,
  facebook: (size) => <IconFacebook width={size} height={size} />,
  slack: (size) => <IconSlack width={size} height={size} />,
  telegram: (size) => <IconTelegram width={size} height={size} />,
  wechat: (size) => <IconWeChat width={size} height={size} />,
  notion: (size) => <IconNotion width={size} height={size} />,
  google: (size) => getLobeIcon('Google.Color', size),
  gitea: (size) => <ReactIconByName name='SiGitea' size={size} />,
  linkedin: (size) => <ReactIconByName name='FaLinkedin' size={size} />,
  x: (size) => <ReactIconByName name='SiX' size={size} />,
  twitter: (size) => <ReactIconByName name='SiX' size={size} />,
  keycloak: (size) => <ReactIconByName name='SiKeycloak' size={size} />,
  nextcloud: (size) => <ReactIconByName name='SiNextcloud' size={size} />,
  authentik: (size) => <ReactIconByName name='SiAuthentik' size={size} />,
  openid: (size) => <ReactIconByName name='SiOpenid' size={size} />,
  okta: (size) => <ReactIconByName name='SiOkta' size={size} />,
  auth0: (size) => <ReactIconByName name='SiAuth0' size={size} />,
  atlassian: (size) => <ReactIconByName name='SiAtlassian' size={size} />,
  bitbucket: (size) => <ReactIconByName name='SiBitbucket' size={size} />,
  twitch: (size) => <ReactIconByName name='SiTwitch' size={size} />,
  reddit: (size) => <ReactIconByName name='SiReddit' size={size} />,
  dropbox: (size) => <ReactIconByName name='SiDropbox' size={size} />,
}

type OAuthProviderIconProps = {
  icon?: string | null
  size?: number
  fallback?: ReactNode
}

/**
 * Renders the icon configured on a custom OAuth provider: a brand key
 * (`google`, `si:gitlab`), an http(s) image URL, an emoji, or a LobeHub icon
 * name (`Google.Color`). Unknown names render their first letter; an empty
 * value renders `fallback`.
 */
export function OAuthProviderIcon(props: OAuthProviderIconProps) {
  const size = props.size ?? 16
  const icon = props.icon?.trim() ?? ''
  if (!icon) return props.fallback ?? null

  const brandKey = icon.toLowerCase().replace(/^(?:react-icons|ri|si):/, '')
  const renderBrandIcon = OAUTH_BRAND_ICONS[brandKey]
  let content: ReactNode
  if (/^https?:\/\//i.test(icon)) {
    content = (
      <img
        src={icon}
        alt=''
        width={size}
        height={size}
        className='rounded-sm object-contain'
        onError={(e) => {
          e.currentTarget.style.display = 'none'
        }}
      />
    )
  } else if (renderBrandIcon) {
    content = renderBrandIcon(size)
  } else if (/^\p{Extended_Pictographic}/u.test(icon)) {
    content = (
      <span
        className='inline-flex items-center justify-center leading-none'
        style={{ width: size, height: size, fontSize: size * 0.8 }}
      >
        {icon}
      </span>
    )
  } else {
    content = getLobeIcon(icon, size)
  }

  // Decorative: the provider name is always rendered next to the icon.
  return (
    <span aria-hidden='true' className='inline-flex shrink-0'>
      {content}
    </span>
  )
}
