import { NextResponse } from 'next/server'
import { TURNKEY_ENABLED, TURNKEY_IMPORT_USER_ID, TURNKEY_IMPORT_API_PUBLIC_KEY, TURNKEY_IMPORT_API_PRIVATE_KEY } from '@/lib/turnkey/config'

/**
 * GET /api/turnkey/import/smoke-test
 * 
 * Dev-only endpoint to verify import configuration
 * Does NOT perform actual imports, only validates configuration
 */
export async function GET() {
  const checks = {
    turnkeyEnabled: TURNKEY_ENABLED,
    hasImportUserId: !!TURNKEY_IMPORT_USER_ID,
    hasImportApiPublicKey: !!TURNKEY_IMPORT_API_PUBLIC_KEY,
    hasImportApiPrivateKey: !!TURNKEY_IMPORT_API_PRIVATE_KEY,
    importUserIdValue: TURNKEY_IMPORT_USER_ID ? `${TURNKEY_IMPORT_USER_ID.substring(0, 8)}...` : null,
    importApiPublicKeyPrefix: TURNKEY_IMPORT_API_PUBLIC_KEY ? TURNKEY_IMPORT_API_PUBLIC_KEY.substring(0, 20) + '...' : null,
  }

  const allGood = checks.turnkeyEnabled && 
                  checks.hasImportUserId && 
                  checks.hasImportApiPublicKey && 
                  checks.hasImportApiPrivateKey

  return NextResponse.json({
    ok: allGood,
    message: allGood ? 'All Turnkey import configuration present' : 'Missing Turnkey import configuration',
    checks,
    nextStep: allGood 
      ? 'Try calling POST /api/turnkey/import/init to verify the Turnkey user exists'
      : 'Set missing environment variables: TURNKEY_IMPORT_USER_ID, TURNKEY_IMPORT_API_PUBLIC_KEY, TURNKEY_IMPORT_API_PRIVATE_KEY',
  })
}

