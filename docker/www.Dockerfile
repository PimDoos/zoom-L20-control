FROM nginx:trixie

COPY www/ /usr/share/nginx/html/

EXPOSE 80