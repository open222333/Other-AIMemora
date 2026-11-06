# ── build ──
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# 建置參數（寫進前端 bundle，不可放機密）
ARG VITE_APP_NAME=Dashboard
ARG VITE_API_BASE_URL=/api/v1
ARG VITE_API_MOCK=false
ENV VITE_APP_NAME=$VITE_APP_NAME VITE_API_BASE_URL=$VITE_API_BASE_URL VITE_API_MOCK=$VITE_API_MOCK
RUN npm run build

# ── serve ──
FROM nginx:1.27-alpine
# templates/*.template 會在啟動時以環境變數替換後放到 conf.d/
COPY docker/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
ENV API_UPSTREAM=http://api:8000
EXPOSE 80
