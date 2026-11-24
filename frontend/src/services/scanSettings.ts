import type { ScanCreateRequest } from '../types/api'

const STORAGE_KEY = 'cloudsentry.scan-settings.v1'

export interface ScanSettings {
  regions: string[]
  include_cost_explorer: boolean
  cpu_threshold: number
  lookback_days: number
  required_tags: string[]
  required_cost_tags: string[]
}

export const DEFAULT_SCAN_SETTINGS: ScanSettings = {
  regions: [],
  include_cost_explorer: false,
  cpu_threshold: 5,
  lookback_days: 7,
  required_tags: ['Environment', 'Owner'],
  required_cost_tags: ['CostCenter', 'Project'],
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringArray(value: unknown, fallback: string[]): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
    ? value
    : fallback
}

export function readScanSettings(): ScanSettings {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (!stored) return { ...DEFAULT_SCAN_SETTINGS }
    const parsed: unknown = JSON.parse(stored)
    if (!isRecord(parsed)) throw new Error('Saved scan settings are not an object.')

    const threshold =
      typeof parsed.cpu_threshold === 'number' &&
      Number.isFinite(parsed.cpu_threshold) &&
      parsed.cpu_threshold >= 0 &&
      parsed.cpu_threshold <= 100
        ? parsed.cpu_threshold
        : DEFAULT_SCAN_SETTINGS.cpu_threshold
    const lookback =
      typeof parsed.lookback_days === 'number' &&
      Number.isInteger(parsed.lookback_days) &&
      parsed.lookback_days >= 1
        ? parsed.lookback_days
        : DEFAULT_SCAN_SETTINGS.lookback_days

    return {
      regions: stringArray(parsed.regions, DEFAULT_SCAN_SETTINGS.regions),
      include_cost_explorer:
        typeof parsed.include_cost_explorer === 'boolean'
          ? parsed.include_cost_explorer
          : DEFAULT_SCAN_SETTINGS.include_cost_explorer,
      cpu_threshold: threshold,
      lookback_days: lookback,
      required_tags: stringArray(parsed.required_tags, DEFAULT_SCAN_SETTINGS.required_tags),
      required_cost_tags: stringArray(
        parsed.required_cost_tags,
        DEFAULT_SCAN_SETTINGS.required_cost_tags,
      ),
    }
  } catch (error) {
    console.warn('Saved scan settings could not be loaded; defaults are in use.', error)
    return { ...DEFAULT_SCAN_SETTINGS }
  }
}

export function saveScanSettings(settings: ScanSettings): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}

export function toScanRequest(settings: ScanSettings): ScanCreateRequest {
  return {
    ...(settings.regions.length > 0 ? { regions: settings.regions } : {}),
    include_cost_explorer: settings.include_cost_explorer,
    cpu_threshold: settings.cpu_threshold,
    lookback_days: settings.lookback_days,
    required_tags: settings.required_tags,
    required_cost_tags: settings.required_cost_tags,
  }
}
