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
import type { SystemStatus } from '../types'

/**
 * Whether the server takes new accounts made with a username and password,
 * which is what the sign-up form is for. Third-party sign-in still creates
 * accounts from the sign-in page when this is off. An unknown status counts as
 * open, so nothing disappears before it loads.
 */
export function isPasswordSignUpOpen(status: SystemStatus | null): boolean {
  return (
    status?.register_enabled !== false &&
    status?.password_register_enabled !== false
  )
}

/**
 * Whether sign-in pages point to the sign-up form. Self-use mode hides the
 * link without closing registration.
 */
export function showsSignUpLink(status: SystemStatus | null): boolean {
  return !status?.self_use_mode_enabled && isPasswordSignUpOpen(status)
}
