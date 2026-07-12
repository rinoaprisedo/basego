import client from './client'

export const getUsers = (params) => client.get('/users', { params }).then((r) => r.data)
export const getUser = (uuid) => client.get(`/users/${uuid}`).then((r) => r.data)
export const createUser = (payload) => client.post('/users', payload).then((r) => r.data)
export const updateUser = (uuid, payload) => client.put(`/users/${uuid}`, payload).then((r) => r.data)
export const deleteUser = (uuid) => client.delete(`/users/${uuid}`).then((r) => r.data)
export const updateUserStatus = (uuid, status) => client.put(`/users/${uuid}/status`, { status }).then((r) => r.data)
export const uploadAvatar = (uuid, formData) =>
  client.post(`/users/${uuid}/avatar`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data)
export const getUserSessions = (uuid) => client.get(`/users/${uuid}/sessions`).then((r) => r.data)
export const deleteUserSession = (uuid, sessionUuid) =>
  client.delete(`/users/${uuid}/sessions/${sessionUuid}`).then((r) => r.data)
