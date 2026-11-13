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
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type ApiKeyCreatedDialogProps = {
  open: boolean
  name: string
  // The full key with its sk- prefix; it exists only in this dialog's props.
  apiKey: string
  onClose: () => void
}

// The server stores only a hash, so this dialog is the one place the full key
// can be copied.
export function ApiKeyCreatedDialog(props: ApiKeyCreatedDialogProps) {
  const { t } = useTranslation()
  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
      disablePointerDismissal
      title={t('Save your API key')}
      description={t(
        'This is the only time the full key is shown. Store it somewhere safe. If you lose it, delete this key and create a new one.'
      )}
      contentClassName='sm:max-w-lg'
      contentHeight='auto'
      footer={<Button onClick={props.onClose}>{t("I've saved it")}</Button>}
    >
      <div className='space-y-5 py-2'>
        <div className='space-y-2'>
          <Label htmlFor='created-api-key'>{props.name}</Label>
          <div className='flex gap-2'>
            <Input
              id='created-api-key'
              value={props.apiKey}
              readOnly
              autoComplete='off'
              onFocus={(event) => event.target.select()}
              className='font-mono text-xs'
            />
            <CopyButton
              value={props.apiKey}
              variant='outline'
              tooltip={t('Copy API key')}
              aria-label={t('Copy API key')}
            />
          </div>
        </div>
      </div>
    </Dialog>
  )
}
