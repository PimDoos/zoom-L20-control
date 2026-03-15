FROM python:3.14-slim-trixie

WORKDIR /opt/ws

# Copy application code and install dependencies
COPY ws/ /opt/ws/
RUN pip install --no-cache-dir -r /opt/ws/requirements.txt

EXPOSE 8081

CMD ["python3", "/opt/ws/websocket_server.py", "--host", "0.0.0.0", "--port", "8081"]
