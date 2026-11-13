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
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { CustomOAuthProviderInfo } from '../../types'
import { OAuthProviders } from '../oauth-providers'

function customProvider(icon: string): CustomOAuthProviderInfo {
  return {
    id: 1,
    name: 'Google',
    slug: 'google',
    icon,
    client_id: 'client-id',
    authorization_endpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    scopes: 'openid email profile',
  }
}

describe('OAuthProviders custom provider buttons', () => {
  it('shows the configured icon when a custom provider sets a brand key', async () => {
    render(
      <OAuthProviders
        status={{ custom_oauth_providers: [customProvider('google')] }}
      />
    )

    const button = screen.getByRole('button', { name: 'Continue with Google' })
    await waitFor(() => expect(button.querySelector('svg')).not.toBeNull())
    // The icon is decorative, so the button keeps the provider label as its name.
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBe(
      button
    )
  })

  it('labels the provider list "Continue with", without a leading "Or"', () => {
    render(
      <OAuthProviders
        status={{ custom_oauth_providers: [customProvider('')] }}
      />
    )

    expect(screen.getByText('Continue with')).toBeVisible()
    expect(screen.queryByText(/^Or continue with$/i)).not.toBeInTheDocument()
  })

  it('shows only the label when a custom provider has no icon', () => {
    render(
      <OAuthProviders
        status={{ custom_oauth_providers: [customProvider('')] }}
      />
    )

    const button = screen.getByRole('button', { name: 'Continue with Google' })
    expect(button.querySelector('svg, img')).toBeNull()
  })
})

describe('OAuthProviders OIDC button', () => {
  it('shows the Google icon when the OIDC display name is Google', () => {
    render(
      <OAuthProviders
        status={{ oidc_enabled: true, oidc_display_name: 'Google' }}
      />
    )

    const button = screen.getByRole('button', { name: 'Continue with Google' })
    // LobeHub may fall back to the letter "G" when its SVG pack is unavailable.
    const icon = button.querySelector('[aria-hidden="true"]')
    expect(icon).not.toBeNull()
    expect(icon?.querySelector('svg, img') || icon?.textContent?.trim()).toBeTruthy()
  })

  it('shows only the label when OIDC uses a generic display name', () => {
    render(
      <OAuthProviders
        status={{ oidc_enabled: true, oidc_display_name: 'OIDC' }}
      />
    )

    const button = screen.getByRole('button', { name: 'Continue with OIDC' })
    expect(button.querySelector('svg, img')).toBeNull()
  })
})
