const LEGACY_BACKEND_URL = 'https://pacasm.up.railway.app'
const PRODUCTION_BACKEND_URL = 'https://backend-production-b204.up.railway.app'

const configuredBackendUrl = process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, '')

export const API_BASE_URL =
  configuredBackendUrl && configuredBackendUrl !== LEGACY_BACKEND_URL
    ? configuredBackendUrl
    : process.env.NODE_ENV === 'production'
      ? PRODUCTION_BACKEND_URL
      : 'http://localhost:4000'
