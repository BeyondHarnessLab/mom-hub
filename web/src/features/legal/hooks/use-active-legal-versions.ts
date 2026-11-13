import { useQuery } from '@tanstack/react-query'

import { getPrivacyPolicy, getUserAgreement } from '../api'

import type { LegalDocumentMeta } from '../types'

export type ActiveLegalVersion = {
  docType: string
  version: string
  effectiveAt: number
  docUrl: string
}

/**
 * Reads the versions in force for the documents the site shows. The payment page
 * prints them next to the pay button, so a dispute can point at the same version
 * the order recorded.
 */
export function useActiveLegalVersions() {
  const agreement = useQuery({
    queryKey: ['legal-version', 'user-agreement'],
    queryFn: getUserAgreement,
    staleTime: 10 * 60 * 1000,
  })
  const privacy = useQuery({
    queryKey: ['legal-version', 'privacy-policy'],
    queryFn: getPrivacyPolicy,
    staleTime: 10 * 60 * 1000,
  })

  const toVersion = (legal?: LegalDocumentMeta): ActiveLegalVersion | null => {
    if (!legal || !legal.version) return null
    return {
      docType: legal.doc_type,
      version: legal.version,
      effectiveAt: legal.effective_at,
      docUrl: legal.doc_url,
    }
  }

  return {
    agreement: toVersion(agreement.data?.legal),
    privacy: toVersion(privacy.data?.legal),
  }
}
