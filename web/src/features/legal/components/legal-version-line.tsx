import { useTranslation } from 'react-i18next'

import { formatTimestampToDate } from '@/lib/format'

import type { LegalDocumentMeta } from '../types'

type LegalVersionLineProps = {
  legal: LegalDocumentMeta
  className?: string
}

/**
 * Names the version of a legal document that is being presented. The legal page
 * shows it under the title, and the payment page shows the same line next to the
 * pay button, so what a customer saw and what the order recorded are visibly the
 * same version.
 */
export function LegalVersionLine(props: LegalVersionLineProps) {
  const { t } = useTranslation()
  return (
    <p className={props.className ?? 'text-muted-foreground text-sm'}>
      {t('Version {{version}}', { version: props.legal.version })}
      {' · '}
      {t('Effective {{date}}', {
        date: formatTimestampToDate(props.legal.effective_at),
      })}
    </p>
  )
}
