import { format } from 'date-fns'

// App-wide date formats: "1 Jan 26 12:12" (with time) and "1 Jan 26" (date only).
export const DATE_TIME_FORMAT = 'd MMM yy HH:mm'
export const DATE_FORMAT = 'd MMM yy'

export const formatDateTime = (value) => (value ? format(new Date(value), DATE_TIME_FORMAT) : '')
export const formatDate = (value) => (value ? format(new Date(value), DATE_FORMAT) : '')