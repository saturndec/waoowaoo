#!/usr/bin/env bash
set -euo pipefail

PROXY_ADDR="http://192.168.136.1:8016"
NO_PROXY="localhost,127.0.0.1,192.168.136.1,localaddress,.localdomain.com"

sudo mkdir -p /etc/systemd/system/docker.service.d
sudo tee /etc/systemd/system/docker.service.d/http-proxy.conf >/dev/null <<EOF
[Service]
Environment="HTTP_PROXY=${PROXY_ADDR}"
Environment="HTTPS_PROXY=${PROXY_ADDR}"
Environment="FTP_PROXY=${PROXY_ADDR}"
Environment="NO_PROXY=${NO_PROXY}"
EOF

sudo systemctl daemon-reload
sudo systemctl restart docker
systemctl show --property=Environment docker
docker pull mysql:8.0
