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
import { createFileRoute, redirect } from '@tanstack/react-router'

import { RootSignIn } from '@/features/auth/sign-in/root-sign-in'
import { resolveAuthentication } from '@/lib/auth-session'
import { useAuthStore } from '@/stores/auth-store'

// Root's password sign-in (see RootSignIn). Nothing links here, but the path
// is not a secret: the server check that admits only root is the control.
export const Route = createFileRoute('/(auth)/admin')({
  component: RootSignIn,
  beforeLoad: async () => {
    await resolveAuthentication()
    if (useAuthStore.getState().auth.user) {
      throw redirect({ to: '/dashboard', replace: true })
    }
  },
})
