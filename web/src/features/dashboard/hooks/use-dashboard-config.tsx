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
import { Coins, Layers, Gauge, Zap, type LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { IconBadgeTone } from '@/components/ui/icon-badge'
import { safeDivide } from '@/features/dashboard/lib'

interface StatCardConfig {
  key: string
  title: string
  icon: LucideIcon
  iconTone: IconBadgeTone
  getValue: (stat: Record<string, number>, days?: number) => number
}

export function useModelStatCardsConfig(): StatCardConfig[] {
  const { t } = useTranslation()

  return [
    {
      key: 'quota',
      title: t('Total Quota'),
      icon: Coins,
      iconTone: 'success',
      getValue: (stat) => stat?.quota ?? 0,
    },
    {
      key: 'tokens',
      title: t('Total Tokens'),
      icon: Layers,
      iconTone: 'chart-4',
      getValue: (stat) => stat?.tpm ?? 0,
    },
    {
      key: 'avgRpm',
      title: t('Average RPM'),
      icon: Gauge,
      iconTone: 'chart-2',
      getValue: (stat, timeRangeMinutes = 1) =>
        safeDivide(stat?.rpm ?? 0, timeRangeMinutes),
    },
    {
      key: 'avgTpm',
      title: t('Average TPM'),
      icon: Zap,
      iconTone: 'warning',
      getValue: (stat, timeRangeMinutes = 1) =>
        safeDivide(stat?.tpm ?? 0, timeRangeMinutes),
    },
  ]
}
