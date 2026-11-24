import axios from 'axios'
import { clearStoredCredentials, readAccessToken } from './operatorSession'
import type {
  CostResponse,
  DashboardRead,
  FindingDetailRead,
  FindingFilters,
  FindingRead,
  FindingUpdateRequest,
  InventoryFilters,
  ResourceRead,
  ScanCreateRequest,
  ScanDetailRead,
  ScanRead,
} from '../types/api'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '/api/v1',
  timeout: 10_000,
})

api.interceptors.request.use((config) => {
  const token = readAccessToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
  const requestHeaders = error.config?.headers
  const authorization =
    requestHeaders && 'get' in requestHeaders
      ? requestHeaders.get('Authorization')
      : requestHeaders?.Authorization ?? requestHeaders?.authorization
  const attachedToken = Boolean(authorization)
  if (
    axios.isAxiosError(error)
    && error.response?.status === 401
    && attachedToken
  ) {
    clearStoredCredentials()
      if (window.location.pathname !== '/login') window.location.assign('/login')
    }
    return Promise.reject(error)
  },
)

export interface AuthUser {
  id: string
  email: string
  full_name: string
  auth_provider: 'local' | 'google' | 'aws'
  is_active: boolean
  created_at: string
}

export interface AuthResponse {
  access_token: string
  token_type: string
  user: AuthUser
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const response = await api.post<AuthResponse>('/auth/login', { email, password })
  return response.data
}

export async function register(email: string, fullName: string, password: string): Promise<AuthResponse> {
  const response = await api.post<AuthResponse>('/auth/register', {
    email,
    full_name: fullName,
    password,
  })
  return response.data
}

export async function getCurrentUser(): Promise<AuthUser> {
  const response = await api.get<AuthUser>('/auth/me')
  return response.data
}

export interface OAuthProviders {
  google: boolean
  aws: boolean
}

export async function getOAuthProviders(): Promise<OAuthProviders> {
  const response = await api.get<OAuthProviders>('/auth/providers')
  return response.data
}

export interface AwsCredentialsRead {
  has_aws_credentials: boolean
  aws_access_key_id_preview: string | null
  aws_default_region: string
  aws_role_arn: string | null
}

export async function getAwsCredentials(): Promise<AwsCredentialsRead> {
  const response = await api.get<AwsCredentialsRead>('/settings/aws-credentials')
  return response.data
}

export async function saveAwsCredentials(request: {
  aws_access_key_id: string
  aws_secret_access_key: string
  aws_default_region: string
  aws_role_arn?: string
}): Promise<AwsCredentialsRead> {
  const response = await api.put<AwsCredentialsRead>('/settings/aws-credentials', request)
  return response.data
}

export async function getHealth() {
  const response = await api.get<{ status: string }>('/health')
  return response.data
}

export async function triggerScan(request: ScanCreateRequest): Promise<ScanRead> {
  const response = await api.post<ScanRead>('/scans', request, { timeout: 300_000 })
  return response.data
}

export async function getDashboard(): Promise<DashboardRead> {
  const response = await api.get<DashboardRead>('/dashboard')
  return response.data
}

export async function getScans(): Promise<ScanRead[]> {
  const response = await api.get<ScanRead[]>('/scans')
  return response.data
}

export async function getScanDetail(scanId: string): Promise<ScanDetailRead> {
  const response = await api.get<ScanDetailRead>(`/scans/${encodeURIComponent(scanId)}`)
  return response.data
}

export async function getFindings(filters: FindingFilters = {}): Promise<FindingRead[]> {
  const response = await api.get<FindingRead[]>('/findings', { params: filters })
  return response.data
}

export async function getFindingDetail(findingId: string): Promise<FindingDetailRead> {
  const response = await api.get<FindingDetailRead>(
    `/findings/${encodeURIComponent(findingId)}`,
  )
  return response.data
}

export async function updateFinding(
  findingId: string,
  request: FindingUpdateRequest,
): Promise<FindingDetailRead> {
  const response = await api.patch<FindingDetailRead>(
    `/findings/${encodeURIComponent(findingId)}`,
    request,
  )
  return response.data
}

export async function getInventory(
  filters: InventoryFilters = {},
): Promise<ResourceRead[]> {
  const response = await api.get<ResourceRead[]>('/inventory', { params: filters })
  return response.data
}

export async function getCosts(scanId?: string): Promise<CostResponse> {
  const response = await api.get<CostResponse>('/costs', {
    params: scanId ? { scan_id: scanId } : undefined,
  })
  return response.data
}

export function getApiErrorMessage(error: unknown): string {
  if (axios.isAxiosError<{ detail?: string | { msg?: string }[] }>(error)) {
    const detail = error.response?.data?.detail
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail)) {
      return detail.map((item) => item.msg ?? 'Invalid request.').join(' ')
    }
    if (error.code === 'ECONNABORTED') {
      return 'The request timed out. Check the API and try again.'
    }
    if (!error.response) return 'The API could not be reached. Check the connection and retry.'
  }
  return error instanceof Error ? error.message : 'An unexpected error occurred.'
}
