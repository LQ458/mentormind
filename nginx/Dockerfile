FROM nginx:alpine

RUN mkdir -p /var/cache/nginx/media_proxy

COPY nginx.conf /etc/nginx/nginx.conf
COPY default.conf /etc/nginx/conf.d/default.conf
