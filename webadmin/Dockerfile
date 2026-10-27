FROM node:24-alpine3.24 AS builder
WORKDIR /app
COPY package.json package-lock.json ./
# `npm ci` installs exactly what package-lock.json pins (and fails if it
# drifts), unlike `npm install`.
RUN npm ci
COPY . .
RUN npm run build

# Unprivileged nginx: runs as a non-root user and listens on 8080.
FROM nginxinc/nginx-unprivileged:1.30-alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
