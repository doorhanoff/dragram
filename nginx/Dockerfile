FROM nginx:alpine

RUN apk add --no-cache openssl && \
    mkdir -p /etc/nginx/certs && \
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
      -keyout /etc/nginx/certs/key.pem \
      -out    /etc/nginx/certs/cert.pem \
      -subj   "/C=RU/ST=Moscow/L=Moscow/O=Dragram/CN=localhost"

COPY nginx.conf /etc/nginx/nginx.conf.template

# При старте подставляем S3_BUCKET в конфиг и запускаем nginx
CMD ["/bin/sh", "-c", \
    "sed s/BUCKET_NAME_PLACEHOLDER/$S3_BUCKET/g /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf && nginx -g 'daemon off;'"]
