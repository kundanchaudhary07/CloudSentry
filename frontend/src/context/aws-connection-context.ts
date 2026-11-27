import { createContext, useContext } from 'react'
import type { AwsConnectionStatusValue } from '../services/api'

export interface AwsConnectionContextValue {
  awsConnected: boolean
  awsConnectionStatus: AwsConnectionStatusValue | null
  connectionRevision: number
  openAwsConnectionPrompt: () => void
}

export const AwsConnectionContext = createContext<AwsConnectionContextValue | null>(null)

export function useAwsConnection() {
  const context = useContext(AwsConnectionContext)
  if (!context) {
    throw new Error('useAwsConnection must be used within AppShell.')
  }
  return context
}
