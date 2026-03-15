FROM nginx:trixie
ENV DEBIAN_FRONTEND=noninteractive

# Install systemd, python and pip (nginx is provided by the base image)
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       systemd \
       systemd-sysv \
       python3 \
       python3-pip \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Copy application files
COPY ws /opt/ws
COPY www /srv/www
COPY docker/websocket.service /etc/systemd/system/websocket.service
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

# Install Python dependencies
RUN pip3 install --no-cache-dir -r /opt/ws/requirements.txt

# Prepare systemd + enable services (best-effort during build)
RUN mkdir -p /run/systemd \
    && systemctl daemon-reload \
    && systemctl enable websocket.service \
    && systemctl enable nginx

# Ports: nginx static site and websocket server
EXPOSE 8080 8081

# Launch systemd as PID 1
CMD ["/sbin/init"]
