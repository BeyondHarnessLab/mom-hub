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
import { useQuery } from '@tanstack/react-query'
import { Route } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import {
  StaticDataTable,
  staticDataTableClassNames as tableStyles,
} from '@/components/data-table'
import { StatusBadge } from '@/components/status-badge'
import { TitledCard } from '@/components/ui/titled-card'
import { CachedPriceCell } from '@/features/pricing/components/cached-price-cell'
import { ModelPriceCell } from '@/features/pricing/components/model-price-cell'
import type { PricingModel } from '@/features/pricing/types'
import { getLobeIcon } from '@/lib/lobe-icon'
import { resolveModelProvider } from '@/lib/model-provider'
import { requireServerSuccess } from '@/lib/server-error-message'
import { cn } from '@/lib/utils'

import { getRoutedModelPricing } from '../api'

// The table sits flush in the card, so its outer columns carry the card's
// padding.
const FIRST_COLUMN = 'ps-3 sm:ps-5'
const LAST_COLUMN = 'pe-3 sm:pe-5'

type RoutedModelRow = {
  model: PricingModel
  routers: string[]
}

/**
 * The models router models such as nvrouter/auto can route a request to, each
 * at its own price. Hidden when no router is set up for the user.
 */
export function RoutedModelPricesCard() {
  const { t } = useTranslation()
  const query = useQuery({
    queryKey: ['wallet', 'routed-model-pricing'],
    queryFn: async () => {
      const data = requireServerSuccess(await getRoutedModelPricing()).data
      // A failed or unexpected answer hides the card, never the wallet.
      return Array.isArray(data) ? data : []
    },
    staleTime: 5 * 60 * 1000,
  })

  // The pricing page's price cells read a pricing entry, so each routed model
  // becomes an expression-priced one.
  const rows = useMemo<RoutedModelRow[]>(
    () =>
      (query.data ?? []).map((price, index) => ({
        model: {
          id: index,
          model_name: price.model_name,
          quota_type: 0,
          model_ratio: 0,
          completion_ratio: 0,
          enable_groups: [],
          billing_mode: 'tiered_expr',
          billing_expr: price.billing_expr,
        },
        routers: price.routers,
      })),
    [query.data]
  )

  if (rows.length === 0) return null

  return (
    <TitledCard
      title={t('Routed model prices')}
      description={t(
        'Models that a router model may route your request to, listed at each model’s own price'
      )}
      icon={<Route className='h-4 w-4' />}
      iconTone='info'
      disableHoverEffect
      contentClassName='p-0 sm:p-0'
    >
      <StaticDataTable
        className={tableStyles.embeddedContainer}
        tableClassName={tableStyles.compactTable}
        headerRowClassName={tableStyles.compactHeaderRow}
        data={rows}
        getRowKey={(row) => `${row.model.model_name}:${row.routers.join(',')}`}
        columns={[
          {
            id: 'model',
            header: t('Model'),
            className: cn(tableStyles.compactHeaderCell, FIRST_COLUMN),
            cellClassName: cn(tableStyles.compactCell, FIRST_COLUMN),
            cell: (row) => {
              const provider = resolveModelProvider(row.model.model_name)
              return (
                <div className='flex min-w-0 items-center gap-2'>
                  {provider?.icon && getLobeIcon(provider.icon, 14)}
                  <span className='truncate font-mono text-sm font-medium'>
                    {row.model.model_name}
                  </span>
                </div>
              )
            },
          },
          {
            id: 'routers',
            header: t('Routed by'),
            className: tableStyles.compactHeaderCell,
            cellClassName: tableStyles.compactCell,
            cell: (row) => (
              <div className='flex flex-wrap gap-1'>
                {row.routers.map((router) => (
                  <StatusBadge
                    key={router}
                    label={router}
                    autoColor={router}
                    size='sm'
                    copyable={false}
                  />
                ))}
              </div>
            ),
          },
          {
            id: 'price',
            header: t('Price'),
            className: tableStyles.compactHeaderCell,
            cellClassName: cn(tableStyles.compactCell, 'min-w-56'),
            cell: (row) => (
              <ModelPriceCell model={row.model} showExpression={false} />
            ),
          },
          {
            id: 'cached',
            header: t('Cached'),
            className: cn(tableStyles.compactHeaderCell, LAST_COLUMN),
            cellClassName: cn(tableStyles.compactCell, LAST_COLUMN),
            cell: (row) => <CachedPriceCell model={row.model} options={{}} />,
          },
        ]}
      />
    </TitledCard>
  )
}
