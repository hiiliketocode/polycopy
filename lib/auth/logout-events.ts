export type LoggedOutReason =
  | 'signed_out'
  | 'session_missing'
  | 'auth_error'
  | 'unauthorized'

export const LOGGED_OUT_EVENT = 'polycopy:logged-out'

export function triggerLoggedOut(reason: LoggedOutReason = 'signed_out') {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent(LOGGED_OUT_EVENT, {
      detail: { reason },
    })
  )
}
