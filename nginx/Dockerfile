FROM nginx:alpine

RUN apk add --no-cache openssl && \
    mkdir -p /etc/nginx/certs && \
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
      -keyout /etc/nginx/certs/key.pem \
      -out    /etc/nginx/certs/cert.pem \
      -subj   "/C=RU/ST=Moscow/L=Moscow/O=Dragram/CN=localhost"

COPY nginx.conf /etc/nginx/nginx.conf
# Тот же набор заголовков, что и в проде: если CSP что-то ломает, это должно
# выясниться на разработке, а не после выката.
COPY templates/security-headers.conf /etc/nginx/security-headers.conf

# Имя бакета конфигу больше не нужно: медиа проксируется в приложение,
# а не в хранилище напрямую.
CMD ["nginx", "-g", "daemon off;"]
