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
import { lazy, Suspense, useCallback, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { FadeIn } from '@/components/page-transition'
import { StatusBadge } from '@/components/status-badge'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ROLE } from '@/lib/roles'
import { getRollingDateRange, type TimeGranularity } from '@/lib/time'
import { useAuthStore } from '@/stores/auth-store'

import {
  DASHBOARD_CARD_CLASS_NAME,
  DEFAULT_TIME_GRANULARITY,
  EMPTY_DASHBOARD_FILTERS,
  TIME_RANGE_PRESETS,
} from '../../constants'
import {
  buildDefaultDashboardFilters,
  getDefaultDays,
  getSavedChartPreferences,
  getSavedGranularity,
  saveChartPreferences,
} from '../../lib'
import type {
  DashboardChartPreferences,
  DashboardFilters,
  QuotaDataItem,
  UserChartsFilters,
} from '../../types'
import { LogStatCards } from '../models/log-stat-cards'
import { ModelsChartPreferences } from '../models/models-chart-preferences'
import { BalancePanel } from './balance-panel'

const ANALYTICS_TABS = [
  { id: 'models', titleKey: 'Model Call Analytics', adminOnly: false },
  { id: 'users', titleKey: 'User Analytics', adminOnly: true },
] as const

type AnalyticsTabId = (typeof ANALYTICS_TABS)[number]['id']

// A picked range brings the bucket size that suits it, so "7 Days" draws daily
// bars instead of keeping hourly ones.
function granularityForRangeDays(days: number): TimeGranularity {
  if (days <= 1) return 'hour'
  if (days >= 29) return 'week'
  return 'day'
}

const LazyConsumptionDistributionChart = lazy(() =>
  import('../models/consumption-distribution-chart').then((m) => ({
    default: m.ConsumptionDistributionChart,
  }))
)

const LazyUserCharts = lazy(() =>
  import('../users/user-charts').then((m) => ({
    default: m.UserCharts,
  }))
)

function ChartsFallback() {
  return (
    <div className={DASHBOARD_CARD_CLASS_NAME}>
      <div className='flex items-center border-b px-4 py-3 sm:px-5'>
        <Skeleton className='h-5 w-32' />
      </div>
      <div className='h-96 p-2'>
        <Skeleton className='h-full w-full' />
      </div>
    </div>
  )
}

/**
 * Usage on the overview: one card with the filtered usage stats beside the
 * balance, then the quota distribution chart and, for admins, per-user
 * analytics.
 */
export function DashboardAnalytics() {
  const { t } = useTranslation()
  const titleId = useId()
  const userRole = useAuthStore((state) => state.auth.user?.role)
  const isAdmin = Boolean(userRole && userRole >= ROLE.ADMIN)
  const [activeTab, setActiveTab] = useState<AnalyticsTabId>('models')

  const [modelData, setModelData] = useState<QuotaDataItem[]>([])
  const [dataLoading, setDataLoading] = useState(false)
  const [chartPreferences, setChartPreferences] =
    useState<DashboardChartPreferences>(() => getSavedChartPreferences())
  const [rangeDays, setRangeDays] = useState(
    () => getSavedChartPreferences().defaultTimeRangeDays
  )
  const [modelFilters, setModelFilters] = useState<DashboardFilters>(() =>
    buildDefaultDashboardFilters(getSavedChartPreferences())
  )
  const [userChartsFilters, setUserChartsFilters] = useState<UserChartsFilters>(
    () => {
      const granularity = getSavedGranularity()
      return {
        timeGranularity: granularity,
        selectedRange: getDefaultDays(granularity),
        topUserLimit: 10,
      }
    }
  )

  const handleRangeChange = (days: number) => {
    const { start, end } = getRollingDateRange(days)
    setRangeDays(days)
    setModelFilters({
      ...EMPTY_DASHBOARD_FILTERS,
      start_timestamp: start,
      end_timestamp: end,
      time_granularity: granularityForRangeDays(days),
    })
  }

  const handleDataUpdate = useCallback(
    (data: QuotaDataItem[], loading: boolean) => {
      setModelData(data)
      setDataLoading(loading)
    },
    []
  )

  const handleChartPreferencesChange = useCallback(
    (preferences: DashboardChartPreferences) => {
      setChartPreferences(preferences)
      setRangeDays(preferences.defaultTimeRangeDays)
      setModelFilters(buildDefaultDashboardFilters(preferences))
      saveChartPreferences(preferences)
    },
    []
  )

  const visibleTabs = ANALYTICS_TABS.filter((tab) => !tab.adminOnly || isAdmin)
  return (
    <div className='flex flex-col gap-3 sm:gap-4'>
      <FadeIn>
        <section
          aria-labelledby={titleId}
          className={DASHBOARD_CARD_CLASS_NAME}
        >
          <div className='grid xl:grid-cols-[minmax(0,1fr)_19rem]'>
            <div className='flex min-w-0 flex-col gap-2.5 p-3 sm:gap-3 sm:p-5'>
              <div className='flex flex-wrap items-start justify-between gap-3'>
                <div className='flex flex-col gap-1'>
                  <div className='flex flex-wrap items-center gap-2'>
                    <h3
                      id={titleId}
                      className='text-base font-medium tracking-[-0.025em] sm:text-lg'
                    >
                      {t('Usage at a glance')}
                    </h3>
                    {/* Admins read site-wide stats; the balance beside them stays their own. */}
                    {isAdmin && (
                      <StatusBadge
                        label={t('All users')}
                        variant='info'
                        copyable={false}
                      />
                    )}
                  </div>
                  <p className='text-muted-foreground text-xs sm:text-sm'>
                    {t('Monitor balance, usage, and request volume')}
                  </p>
                </div>
                <div className='flex shrink-0 flex-wrap items-center gap-1.5 sm:gap-2'>
                  <Select
                    items={TIME_RANGE_PRESETS.map((preset) => ({
                      value: String(preset.days),
                      label: t(preset.label),
                    }))}
                    value={String(rangeDays)}
                    onValueChange={(value) => handleRangeChange(Number(value))}
                  >
                    <SelectTrigger size='sm' aria-label={t('Time range')}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent alignItemWithTrigger={false}>
                      <SelectGroup>
                        {TIME_RANGE_PRESETS.map((preset) => (
                          <SelectItem
                            key={preset.days}
                            value={String(preset.days)}
                          >
                            {t(preset.label)}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <ModelsChartPreferences
                    preferences={chartPreferences}
                    onPreferencesChange={handleChartPreferencesChange}
                  />
                </div>
              </div>
              <LogStatCards
                filters={modelFilters}
                onDataUpdate={handleDataUpdate}
              />
            </div>
            <BalancePanel />
          </div>
        </section>
      </FadeIn>
      {visibleTabs.length > 1 && (
        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as AnalyticsTabId)}
        >
          <TabsList className='max-w-full flex-wrap justify-start group-data-horizontal/tabs:h-auto'>
            {visibleTabs.map((tab) => (
              <TabsTrigger key={tab.id} value={tab.id}>
                {t(tab.titleKey)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}
      {activeTab === 'models' && (
        <FadeIn delay={0.05}>
          <Suspense fallback={<ChartsFallback />}>
            <LazyConsumptionDistributionChart
              data={modelData}
              loading={dataLoading}
              timeGranularity={
                modelFilters.time_granularity || DEFAULT_TIME_GRANULARITY
              }
            />
          </Suspense>
        </FadeIn>
      )}
      {activeTab === 'users' && isAdmin && (
        <FadeIn>
          <Suspense fallback={<ChartsFallback />}>
            <LazyUserCharts
              filters={userChartsFilters}
              onFiltersChange={setUserChartsFilters}
            />
          </Suspense>
        </FadeIn>
      )}
    </div>
  )
}
