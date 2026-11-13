import { useTranslation } from 'react-i18next'

import { formatTimestampToDate } from '@/lib/format'

import { useActiveLegalVersions } from '../hooks/use-active-legal-versions'

/**
 * Payment-page notice naming the legal document versions in force. Nobody has to
 * tick anything here: the notice makes the version visible while the customer
 * pays, which is what "continued use after notice" needs, and it matches the
 * version the order records.
 */
export function CheckoutLegalNotice() {
  const { t } = useTranslation()
  const versions = useActiveLegalVersions()

  if (!versions.agreement && !versions.privacy) {
    return null
  }

  const parts: string[] = []
  if (versions.agreement) {
    parts.push(
      t('Terms of Service version {{version}}', {
        version: versions.agreement.version,
      })
    )
  }
  if (versions.privacy) {
    parts.push(
      t('Privacy Policy version {{version}}', {
        version: versions.privacy.version,
      })
    )
  }
  const effectiveAt =
    versions.agreement?.effectiveAt ?? versions.privacy?.effectiveAt

  return (
    <p className='text-muted-foreground text-xs leading-relaxed'>
      {t('By paying, you agree to the')} {parts.join(t(' and '))}
      {effectiveAt
        ? t(', effective {{date}}', {
            date: formatTimestampToDate(effectiveAt),
          })
        : ''}
      {'. '}
      {t(
        'This version is recorded with your order. Continued use after an update means you accept the updated version.'
      )}
    </p>
  )
}
