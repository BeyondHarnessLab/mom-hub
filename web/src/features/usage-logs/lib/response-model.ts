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
import type { UsageLog } from '../data/schema'
import type { LogOtherData } from '../types'

export type ResponseModelObservation = NonNullable<
  LogOtherData['response_model']
>

/**
 * Decide whether an upstream response model deserves a mismatch warning.
 *
 * Mirrors relay/common/response_model.go: ignoring case, the returned name is
 * compatible when it starts with the requested or upstream model (dated
 * versions, variants) or ends with it (provider paths such as
 * "deepseek/deepseek-v4.1-flash"). Nothing is stored; every row is judged
 * with the current rule.
 */
export function isResponseModelMismatch(
  observation: ResponseModelObservation | undefined
): boolean {
  if (!observation) return false
  const returned = (observation.returned_model ?? '').toLowerCase()
  if (returned.trim() === '') return false
  for (const candidate of [
    observation.requested_model,
    observation.upstream_model,
  ]) {
    const expected = (candidate ?? '').toLowerCase()
    if (expected === '') continue
    if (returned.startsWith(expected) || returned.endsWith(expected)) {
      return false
    }
  }
  return true
}

/** One billed model call behind a response, as shown in the model details. */
export interface ModelCallRow {
  role: string
  model: string
  promptTokens: number
  completionTokens: number
  cacheTokens: number
  // Absent on logs written before the response's own share was recorded.
  quota?: number
  keptEntryPrice: boolean
}

/**
 * List every model call behind a fusion response: the aggregator that answered,
 * with the log's own usage, followed by the calls the upstream reported in
 * usage.model_calls. Logs written before the calls were public only carry
 * them in admin_info. Whether a call kept the entry price is admin-only.
 * Returns an empty list when the log has no reported calls.
 */
export function getModelCalls(
  log: Pick<UsageLog, 'prompt_tokens' | 'completion_tokens'>,
  other: LogOtherData | null
): ModelCallRow[] {
  const billing = other?.admin_info?.response_model_billing
  const calls =
    other?.model_calls ??
    billing?.calls?.map((call) => ({ ...call, model: call.response_model }))
  if (!calls?.length) return []
  return [
    {
      role: 'aggregator',
      model:
        other?.settle_model ||
        billing?.response_model ||
        other?.response_model?.returned_model ||
        '',
      promptTokens: log.prompt_tokens || 0,
      completionTokens: log.completion_tokens || 0,
      cacheTokens: other?.cache_tokens || 0,
      quota: other?.response_quota,
      keptEntryPrice: !!billing?.fallback,
    },
    ...calls.map((call, index) => ({
      role: call.role || '',
      model: call.model || '',
      promptTokens: call.prompt_tokens || 0,
      completionTokens: call.completion_tokens || 0,
      cacheTokens: call.cache_tokens || 0,
      quota: call.quota,
      keptEntryPrice: !!billing?.calls?.[index]?.fallback,
    })),
  ]
}
