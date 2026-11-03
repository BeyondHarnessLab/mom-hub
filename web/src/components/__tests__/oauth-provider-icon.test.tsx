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

import { OAuthProviderIcon } from '../oauth-provider-icon'

describe('OAuthProviderIcon', () => {
  it.each(['github', ' GitLab ', 'si:discord'])(
    'renders the bundled brand icon when the value is the brand key %j',
    (icon) => {
      const { container } = render(<OAuthProviderIcon icon={icon} />)

      expect(container.querySelector('svg')).toHaveAttribute('width', '16')
    }
  )

  it.each(['google', 'ri:keycloak'])(
    'loads the brand icon when the value is the brand key %j',
    async (icon) => {
      const { container } = render(<OAuthProviderIcon icon={icon} />)

      await waitFor(() =>
        expect(container.querySelector('svg')).toHaveAttribute('width', '16')
      )
    }
  )

  it('renders the image when the value is an http(s) URL', () => {
    const { container } = render(
      <OAuthProviderIcon icon='https://sso.example.com/logo.png' size={20} />
    )

    const img = container.querySelector('img')
    expect(img).toHaveAttribute('src', 'https://sso.example.com/logo.png')
    expect(img).toHaveAttribute('width', '20')
  })

  it('renders the emoji when the value is an emoji', () => {
    render(<OAuthProviderIcon icon='🐱' />)

    expect(screen.getByText('🐱')).toBeInTheDocument()
  })

  it('loads the LobeHub icon when the value is a LobeHub icon name', async () => {
    const { container } = render(<OAuthProviderIcon icon='OpenAI' />)

    await waitFor(() => expect(container.querySelector('svg')).not.toBeNull())
  })

  it('renders the first letter when the value is an unknown name', () => {
    const { container } = render(<OAuthProviderIcon icon='my-sso' />)

    expect(container).toHaveTextContent('M')
    expect(container.querySelector('svg, img')).toBeNull()
  })

  it('renders the fallback when the value is empty', () => {
    render(<OAuthProviderIcon icon='  ' fallback={<span>no icon</span>} />)

    expect(screen.getByText('no icon')).toBeInTheDocument()
  })
})
