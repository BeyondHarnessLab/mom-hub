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
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { JsonCodeEditor } from '@/components/json-code-editor'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

import { useUpdateOption } from '../hooks/use-update-option'
import { formatJsonForTextarea, normalizeJsonString } from './utils'

const OPTION_KEY = 'billing_setting.response_model_billing'

const EXAMPLE = JSON.stringify(
  {
    'nvrouter/auto': {
      fee_rate: 0.05,
      models: {
        'deepseek/deepseek-v4.1-flash-1017': 'auto-nv/deepseek-v4.1-flash-1017',
        'anthropic/claude-opus-5-5': 'auto-nv/claude-opus-5-5',
      },
    },
  },
  null,
  2
)

// The server checks prices and fee bounds on save; this only blocks text that
// cannot be sent as an option value.
function isRuleObject(text: string): boolean {
  if (!text.trim()) return true
  try {
    const parsed = JSON.parse(text) as unknown
    return !!parsed && typeof parsed === 'object' && !Array.isArray(parsed)
  } catch {
    return false
  }
}

type ResponseModelBillingSettingsProps = {
  defaultValue: string
}

export function ResponseModelBillingSettings(
  props: ResponseModelBillingSettingsProps
) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  const [jsonText, setJsonText] = useState('')

  useEffect(() => {
    setJsonText(formatJsonForTextarea(props.defaultValue))
  }, [props.defaultValue])

  const valid = useMemo(() => isRuleObject(jsonText), [jsonText])

  const handleSave = async () => {
    await updateOption.mutateAsync({
      key: OPTION_KEY,
      value: normalizeJsonString(jsonText) || '{}',
    })
  }

  return (
    <div className='space-y-4'>
      <Alert>
        <AlertDescription className='space-y-1 text-sm'>
          <div>
            {t(
              'Settle an entry model at the price of the model the upstream declares in its response. Each response model maps to a billing name that already has an expression price.'
            )}
          </div>
          <div>
            {t(
              'fee_rate is added to every request for the entry model: 0.05 charges 5% more. Responses that declare an unlisted model, or none, keep the entry model price, so set it to the most expensive model it can route to.'
            )}
          </div>
        </AlertDescription>
      </Alert>

      <div className='space-y-2'>
        <JsonCodeEditor
          value={jsonText}
          onChange={setJsonText}
          ariaLabel={t('Response model billing')}
          aria-invalid={!valid}
          placeholder={`${t('Example:')}\n${EXAMPLE}`}
          heightClassName='h-72 min-h-72 max-h-72'
        />
        {!valid && (
          <p className='text-destructive text-sm'>
            {t('JSON must be an object')}
          </p>
        )}
      </div>

      <div className='flex flex-wrap justify-between gap-2'>
        <Button
          type='button'
          variant='outline'
          size='sm'
          onClick={() => setJsonText(EXAMPLE)}
        >
          {t('Fill example')}
        </Button>
        <Button
          onClick={handleSave}
          disabled={updateOption.isPending || !valid}
        >
          {t('Save response model billing')}
        </Button>
      </div>
    </div>
  )
}
