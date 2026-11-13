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
import { ArrowRightLeft, ExternalLink } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { CopyButton } from '@/components/copy-button'
import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useChatPresets } from '@/features/chat/hooks/use-chat-presets'
import { resolveChatUrl, type ChatPreset } from '@/features/chat/lib/chat-links'
import { sendToFluent } from '@/features/chat/lib/send-to-fluent'
import { encodeChannelConnectionInfo } from '@/lib/channel-connection-info'

type ApiKeyCreatedDialogProps = {
  open: boolean
  name: string
  // The full key with its sk- prefix; it exists only in this dialog's props.
  apiKey: string
  onClose: () => void
  onOpenCCSwitch: () => void
}

// The server stores only a hash, so this dialog is the one place the full key
// can be copied or handed to another app.
export function ApiKeyCreatedDialog(props: ApiKeyCreatedDialogProps) {
  const { t } = useTranslation()
  const { chatPresets, serverAddress } = useChatPresets()
  // A preset whose link is just "ccswitch" names the CC Switch import, which
  // has its own button here.
  const appPresets = chatPresets.filter(
    (preset) => preset.url.toLowerCase() !== 'ccswitch'
  )

  const openChatPreset = (preset: ChatPreset) => {
    if (preset.type === 'fluent') {
      if (sendToFluent(props.apiKey, serverAddress)) {
        toast.success(t('Sent the API key to FluentRead.'))
      } else {
        toast.info(
          t(
            'FluentRead extension not detected. Please ensure it is installed and active.'
          )
        )
      }
      return
    }
    const url = resolveChatUrl({
      template: preset.url,
      apiKey: props.apiKey,
      serverAddress,
    })
    if (!url) {
      toast.error(t('Invalid chat link. Please contact your administrator.'))
      return
    }
    window.open(url, '_blank', 'noopener')
  }

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
        <div className='space-y-2'>
          <p className='text-sm font-medium'>{t('Use it in an app')}</p>
          <div className='flex flex-wrap gap-2'>
            <CopyButton
              value={encodeChannelConnectionInfo(props.apiKey, serverAddress)}
              variant='outline'
              size='sm'
              aria-label={t('Copy Connection Info')}
            >
              {t('Copy Connection Info')}
            </CopyButton>
            <Button variant='outline' size='sm' onClick={props.onOpenCCSwitch}>
              <ArrowRightLeft aria-hidden='true' />
              {t('CC Switch')}
            </Button>
            {appPresets.map((preset) => (
              <Button
                key={preset.id}
                variant='outline'
                size='sm'
                onClick={() => openChatPreset(preset)}
              >
                {preset.name}
                {preset.type !== 'web' && <ExternalLink aria-hidden='true' />}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </Dialog>
  )
}
