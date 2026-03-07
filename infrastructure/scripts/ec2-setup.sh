#!/usr/bin/env bash
# Lumino — One-time EC2 setup (Ubuntu 22.04/24.04)
# Usage: ssh into EC2, then: bash ec2-setup.sh
set -euo pipefail

echo "=== Installing Docker ==="
sudo apt-get update
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Allow current user to run docker without sudo
sudo usermod -aG docker "$USER"

echo "=== Cloning Lumino ==="
cd ~
git clone https://github.com/lumenze/lumino.git
cd lumino

echo "=== Creating .env file ==="
cat > .env << 'EOF'
POSTGRES_USER=lumino
POSTGRES_PASSWORD=CHANGE_ME_TO_A_STRONG_PASSWORD
POSTGRES_DB=lumino
JWT_SECRET=CHANGE_ME_TO_A_RANDOM_SECRET
CORS_ORIGINS=*
LUMINO_PORT=3000
EOF

echo ""
echo "=== Setup complete ==="
echo "1. Edit ~/lumino/.env and set strong passwords"
echo "2. Log out and back in (for docker group)"
echo "3. Run: cd ~/lumino && docker compose -f infrastructure/docker/docker-compose.prod.yml up -d --build"
