import React from 'react'
import { COLORS, FONTS } from './_styles'

export function EmailLogo() {
  return (
    <table cellPadding="0" cellSpacing="0" border={0} align="center" style={{ margin: '0 auto' }}>
      <tbody>
        <tr>
          <td
            style={{
              backgroundColor: COLORS.yellow,
              padding: '6px 10px',
              fontSize: '16px',
              fontWeight: 900,
              fontFamily: FONTS.header,
              color: COLORS.black,
              letterSpacing: '-0.04em',
              lineHeight: '1',
              textTransform: 'uppercase' as const,
            }}
          >
            POLY
          </td>
          <td
            style={{
              backgroundColor: COLORS.black,
              padding: '6px 10px',
              fontSize: '16px',
              fontWeight: 900,
              fontFamily: FONTS.header,
              color: COLORS.white,
              letterSpacing: '-0.04em',
              lineHeight: '1',
              textTransform: 'uppercase' as const,
            }}
          >
            COPY
          </td>
        </tr>
      </tbody>
    </table>
  )
}
