import client from './client'

export const getUsers = (params) => client.get('/users', { params }).then((r) => r.data)
export const getUser = (uuid) => client.get(`/users/${uuid}`).then((r) => r.data)
export const createUser = (payload) => client.post('/users', payload).then((r) => r.data)
export const updateUser = (uuid, payload) => client.put(`/users/${uuid}`, payload).then((r) => r.data)
export const deleteUser = (uuid) => client.delete(`/users/${uuid}`).then((r) => r.data)
export const updateUserStatus = (uuid, status) => client.put(`/users/${uuid}/status`, { status }).then((r) => r.data)
export const uploadAvatar = (uuid, formData) =>
  client.post(`/users/${uuid}/avatar`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data)

function downloadFile(blob, filename) {
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.URL.revokeObjectURL(url)
}

export const exportUsersCsv = (params) =>
  client.get('/users/export/csv', { params, responseType: 'blob' }).then((r) => downloadFile(r.data, 'users.csv'))
export const exportUsersExcel = (params) =>
  client.get('/users/export/excel', { params, responseType: 'blob' }).then((r) => downloadFile(r.data, 'users.xlsx'))

// Bulk import: validate (background job, polled) → commit only when every row is valid.
export const downloadUserImportTemplate = () =>
  client.get('/users/import/template', { responseType: 'blob' }).then((r) => downloadFile(r.data, 'users_import_template.xlsx'))
export const validateUserImport = (mode, file, fields, onUploadProgress) => {
  const form = new FormData()
  form.append('file', file)
  fields.forEach((f) => form.append('fields', f))
  return client
    .post(`/users/import/${mode}/validate`, form, { headers: { 'Content-Type': 'multipart/form-data' }, onUploadProgress })
    .then((r) => r.data.data)
}
export const getUserImportJob = (token) => client.get(`/users/import/jobs/${token}`).then((r) => r.data.data)
export const commitUserImport = (mode, token) => client.post(`/users/import/${mode}/commit/${token}`).then((r) => r.data.data)
