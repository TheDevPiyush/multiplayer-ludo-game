#!/usr/bin/env bash
# Prepares the droplet. GitHub Actions runs it as root on every deploy; each step
# skips itself once done, so a fresh Ubuntu droplet needs no manual setup.
set -euo pipefail

# A new droplet runs cloud-init and apt upgrades at first boot; wait for them.
if command -v cloud-init >/dev/null; then cloud-init status --wait >/dev/null 2>&1 || true; fi
while fuser /var/lib/dpkg/lock-frontend /var/lib/apt/lists/lock >/dev/null 2>&1; do
    echo "waiting for apt…"
    sleep 3
done

# Docker Engine + the compose plugin, from Docker's own repository.
if ! command -v docker >/dev/null; then
    echo "installing docker"
    curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker >/dev/null

# Firewall: SSH and web only (443/udp is HTTP/3). SSH is allowed before enabling.
if command -v ufw >/dev/null && ! ufw status | grep -q "Status: active"; then
    echo "enabling firewall"
    ufw allow OpenSSH >/dev/null
    ufw allow 80/tcp >/dev/null
    ufw allow 443/tcp >/dev/null
    ufw allow 443/udp >/dev/null
    ufw --force enable >/dev/null
fi

# Small droplets have little RAM; swap keeps memory spikes from OOM-killing the API.
if ! swapon --show | grep -q .; then
    echo "adding 2G swap"
    fallocate -l 2G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile >/dev/null
    swapon /swapfile
    grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
