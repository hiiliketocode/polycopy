import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'
import { join } from 'path'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutes max duration for Vercel

/**
 * GET /api/cron/backfill-wallet-pnl
 * Vercel Cron job that runs daily to backfill wallet PnL data from Dome API
 * 
 * Schedule: Daily at 2 AM UTC (configured in vercel.json)
 */
export async function GET(request: NextRequest) {
  // Security: Verify this is called by Vercel Cron
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    console.error('❌ Unauthorized cron request for backfill-wallet-pnl')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  console.log('📊 Starting wallet PnL backfill...')

  return new Promise<NextResponse>((resolve) => {
    const scriptPath = join(process.cwd(), 'scripts', 'backfill-wallet-pnl.js')
    const child = spawn('node', [scriptPath], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    child.stdout?.on('data', (data) => {
      const output = data.toString()
      stdout += output
      console.log(output.trim())
    })

    child.stderr?.on('data', (data) => {
      const output = data.toString()
      stderr += output
      console.error(output.trim())
    })

    child.on('close', (code) => {
      if (code === 0) {
        console.log('✅ Wallet PnL backfill completed successfully')
        resolve(
          NextResponse.json({
            success: true,
            message: 'Backfill completed',
            output: stdout.slice(-1000), // Last 1000 chars of output
          })
        )
      } else {
        console.error(`❌ Wallet PnL backfill failed with code ${code}`)
        resolve(
          NextResponse.json(
            {
              success: false,
              error: `Backfill failed with exit code ${code}`,
              stderr: stderr.slice(-1000), // Last 1000 chars of error
            },
            { status: 500 }
          )
        )
      }
    })

    child.on('error', (error) => {
      console.error('❌ Failed to spawn backfill script:', error)
      resolve(
        NextResponse.json(
          {
            success: false,
            error: `Failed to start backfill: ${error.message}`,
          },
          { status: 500 }
        )
      )
    })
  })
}
