// =============================================================================
// Vercel Domain Management API
// Wraps Vercel REST API v10 for adding/removing custom domains to the project
// =============================================================================

const VERCEL_API_BASE = 'https://api.vercel.com'

function getHeaders() {
  const token = process.env.VERCEL_API_TOKEN
  if (!token) throw new Error('VERCEL_API_TOKEN is not configured')
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
}

function getTeamParam() {
  const teamId = process.env.VERCEL_TEAM_ID
  return teamId ? `?teamId=${teamId}` : ''
}

function getProjectId() {
  const projectId = process.env.VERCEL_PROJECT_ID
  if (!projectId) throw new Error('VERCEL_PROJECT_ID is not configured')
  return projectId
}

export async function addDomainToProject(domain: string) {
  const projectId = getProjectId()
  const teamParam = getTeamParam()

  const res = await fetch(
    `${VERCEL_API_BASE}/v10/projects/${projectId}/domains${teamParam}`,
    {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ name: domain }),
    }
  )

  const data = await res.json()
  if (!res.ok) {
    return { data: null, error: new Error(data.error?.message || 'Failed to add domain to Vercel') }
  }

  return { data, error: null }
}

export async function verifyDomainOnProject(domain: string) {
  const projectId = getProjectId()
  const teamParam = getTeamParam()

  const res = await fetch(
    `${VERCEL_API_BASE}/v10/projects/${projectId}/domains/${domain}/verify${teamParam}`,
    {
      method: 'POST',
      headers: getHeaders(),
    }
  )

  const data = await res.json()
  if (!res.ok) {
    return { data: null, error: new Error(data.error?.message || 'Failed to verify domain on Vercel') }
  }

  return { data, error: null }
}

export async function removeDomainFromProject(domain: string) {
  const projectId = getProjectId()
  const teamParam = getTeamParam()

  const res = await fetch(
    `${VERCEL_API_BASE}/v10/projects/${projectId}/domains/${domain}${teamParam}`,
    {
      method: 'DELETE',
      headers: getHeaders(),
    }
  )

  if (!res.ok) {
    const data = await res.json()
    return { data: null, error: new Error(data.error?.message || 'Failed to remove domain from Vercel') }
  }

  return { data: { removed: true }, error: null }
}

export async function getDomainConfig(domain: string) {
  const teamParam = getTeamParam()

  const res = await fetch(
    `${VERCEL_API_BASE}/v6/domains/${domain}/config${teamParam}`,
    {
      method: 'GET',
      headers: getHeaders(),
    }
  )

  const data = await res.json()
  if (!res.ok) {
    return { data: null, error: new Error(data.error?.message || 'Failed to get domain config') }
  }

  return { data, error: null }
}
