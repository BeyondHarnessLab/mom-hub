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
import type { ComponentProps, ReactNode } from 'react'

import { Card } from '@/components/ui/card'
import { Field, FieldGroup, FieldLegend, FieldSet } from '@/components/ui/field'
import { cn } from '@/lib/utils'

type SettingsGroupProps = {
  title: string
  children: ReactNode
}

/** A titled list of settings: a small heading above a card of rows. */
export function SettingsGroup(props: SettingsGroupProps) {
  return (
    <FieldSet className='gap-2'>
      <FieldLegend
        variant='label'
        className='text-muted-foreground mb-0 px-1 text-xs font-medium tracking-wide uppercase data-[variant=label]:text-xs'
      >
        {props.title}
      </FieldLegend>
      <Card data-card-hover='false' className='gap-0 py-0'>
        <FieldGroup className='divide-border gap-0 divide-y'>
          {props.children}
        </FieldGroup>
      </Card>
    </FieldSet>
  )
}

/**
 * One row of a settings group: label and description, with the control
 * beside them, vertically centred.
 */
export function SettingsRow({
  className,
  ...props
}: ComponentProps<typeof Field>) {
  return (
    <Field
      className={cn(
        'px-5 py-4 has-[>[data-slot=field-content]]:items-center @md/field-group:has-[>[data-slot=field-content]]:items-center',
        className
      )}
      {...props}
    />
  )
}
