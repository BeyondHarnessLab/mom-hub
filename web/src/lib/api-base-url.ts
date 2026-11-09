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
import type { StatusData } from '@/lib/status-query'

/**
 * Base URL that users call the relay API with; callers append `/v1/...`.
 *
 * Uses the API Address setting (`api_address`), then Server Address
 * (`server_address`), then `fallback`, which defaults to the current origin.
 * Trailing slashes are removed. Only these API URL displays read API Address:
 * OAuth callbacks, payment returns and other links keep using Server Address.
 */
export function getApiBaseUrl(
  status: StatusData | null | undefined,
  fallback: string = typeof window === 'undefined' ? '' : window.location.origin
): string {
  for (const value of [status?.api_address, status?.server_address]) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim().replace(/\/+$/, '')
    }
  }
  return fallback
}
