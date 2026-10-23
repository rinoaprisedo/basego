import client from './client'

export const getTicketMeta = () => client.get('/dev-tickets/meta').then((r) => r.data)
export const getTickets = (params) => client.get('/dev-tickets', { params }).then((r) => r.data)
export const getTicket = (number) => client.get(`/dev-tickets/${number}`).then((r) => r.data)
export const createTicket = (data) => client.post('/dev-tickets', data).then((r) => r.data)
export const importTickets = (rows) => client.post('/dev-tickets/import', { rows }).then((r) => r.data)
export const updateTicket = (number, data) => client.put(`/dev-tickets/${number}`, data).then((r) => r.data)
export const setTicketStatus = (number, data) => client.patch(`/dev-tickets/${number}/status`, data).then((r) => r.data)
export const addTicketComment = (number, body) => client.post(`/dev-tickets/${number}/comments`, { body }).then((r) => r.data)
export const deleteTicket = (number) => client.delete(`/dev-tickets/${number}`).then((r) => r.data)
export const uploadTicketAttachment = (file) => {
  const form = new FormData()
  form.append('file', file)
  return client.post('/dev-tickets/attachments', form, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data)
}
export const getApiTokens = () => client.get('/dev-tickets/tokens').then((r) => r.data)
export const createApiToken = (name) => client.post('/dev-tickets/tokens', { name }).then((r) => r.data)
export const deleteApiToken = (uuid) => client.delete(`/dev-tickets/tokens/${uuid}`).then((r) => r.data)
