FROM golang:1.27-alpine3.24 AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download && go mod verify
# Pinned (not @latest) so image builds are reproducible and a hijacked
# upstream release can't slip into the build. Keep in sync with swaggo/swag
# in go.mod.
RUN go install github.com/swaggo/swag/cmd/swag@v1.16.6
COPY . .
RUN swag init -g main.go -o docs
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /baseadmin main.go

FROM alpine:3.24
RUN apk add --no-cache ca-certificates \
    && addgroup -S app && adduser -S -G app -H -h /app app
WORKDIR /app
COPY --from=builder /baseadmin ./baseadmin
COPY --from=builder --chown=app:app /app/storage ./storage
# Never run the API as root: a bug in upload/file handling then can't write
# outside the storage dir.
USER app
EXPOSE 8800
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD wget -qO- "http://127.0.0.1:${APP_PORT:-8800}/api/v1/version" >/dev/null || exit 1
CMD ["./baseadmin"]
