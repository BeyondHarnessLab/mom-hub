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
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

// The Modeless material layer is a set of custom properties that only the
// default preset defines (theme.css). Components read them through var()
// fallbacks, so a named preset that resets them keeps the upstream look.
// jsdom does not run the CSS cascade, so these tests read the stylesheets.
const stylesDir = resolve(import.meta.dirname, '..')
const themeCss = readFileSync(resolve(stylesDir, 'theme.css'), 'utf8')
const presetsCss = readFileSync(resolve(stylesDir, 'theme-presets.css'), 'utf8')

function declaredProperties(css: string, selector: string): Set<string> {
  const start = css.indexOf(`${selector} {`)
  expect(start, `${selector} block`).toBeGreaterThanOrEqual(0)
  const body = css.slice(start, css.indexOf('\n}', start))
  return new Set(
    [...body.matchAll(/^\s*(--[\w-]+):/gm)].map((match) => match[1])
  )
}

const materialProperties = [...declaredProperties(themeCss, ':root')].filter(
  (name) => /^--(key|control|sheet|code-glass)(-|$)/.test(name)
)

describe('Modeless material layer', () => {
  it('declares material properties on the default theme', () => {
    expect(materialProperties).toContain('--key-shadow')
    expect(materialProperties).toContain('--sheet-shadow')
  })

  it('resets every material property for named presets', () => {
    const reset = declaredProperties(
      presetsCss,
      "[data-theme-preset]:not([data-theme-preset='default'])"
    )

    expect(materialProperties.filter((name) => !reset.has(name))).toEqual([])
  })
})
