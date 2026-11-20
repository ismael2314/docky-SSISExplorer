// All backend access goes through here. The Node API (server/) and the future
// .NET API expose the same endpoints, so nothing else in the frontend changes.

async function request(url, init) {
  const res = await fetch(url, init)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `${res.status} ${res.statusText}`)
  }
  return res.status === 204 ? null : res.json()
}

const json = (method, body) => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

const pkg = (id) => `/api/packages/${encodeURIComponent(id)}`

// dashboard
export const getDashboard = () => request('/api/dashboard')

// packages
export const getPackages = () => request('/api/packages')
export const getPackage = (id) => request(pkg(id))
export const getHierarchy = (id) => request(`${pkg(id)}/hierarchy`)
export const getFlow = (id) => request(`${pkg(id)}/flow`)
export const getDataFlow = (id, taskId) => request(`${pkg(id)}/dataflow?task=${encodeURIComponent(taskId)}`)

// files in the packages folder
export const listFiles = () => request('/api/files')
export const listConnections = () => request('/api/connections')
export const deleteFile = (name) => request(`/api/files/${encodeURIComponent(name)}`, { method: 'DELETE' })
export const uploadFile = (file, overwrite = false) =>
  request(`/api/files/${encodeURIComponent(file.name)}${overwrite ? '?overwrite=1' : ''}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: file,
  })

// settings (the SQL password is never part of these)
export const getSettings = () => request('/api/settings')
export const saveSettings = (sql) => request('/api/settings', json('PUT', { sql }))

// SQL Server Agent jobs (read from msdb). Like the catalog calls, the password is sent per request and never stored.
export const getJobs = (connection, password) => request('/api/jobs', json('POST', { connection, password }))

// SQL Server catalog (SSISDB). The password is sent with each request and never stored.
export const catalogTest = (connection, password) => request('/api/catalog/test', json('POST', { connection, password }))
export const catalogProjects = (connection, password) => request('/api/catalog/projects', json('POST', { connection, password }))
export const catalogImport = (connection, password, projects) =>
  request('/api/catalog/import', json('POST', { connection, password, projects }))

// Tell the rest of the app (sidebar) that packages were added or removed.
export const notifyFilesChanged = () => window.dispatchEvent(new Event('docky:files-changed'))
