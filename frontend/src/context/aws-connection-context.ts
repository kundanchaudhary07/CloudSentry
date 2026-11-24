import { createContext, useContext } from 'react'

export interface AwsConnectionContextValue {
  awsConnected: boolean
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
