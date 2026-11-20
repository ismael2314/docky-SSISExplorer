// The SQL Server login the user typed this session. Kept in memory only: it is never written to
// disk or localStorage, so a page refresh forgets the password.
import { useSyncExternalStore } from 'react'

let session = null // { connection, password }
const listeners = new Set()

export const getSession = () => session
export function setSession(next) {
  session = next
  listeners.forEach((l) => l())
}
export const clearSession = () => setSession(null)
export const useSqlSession = () =>
  useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb) }, () => session)
