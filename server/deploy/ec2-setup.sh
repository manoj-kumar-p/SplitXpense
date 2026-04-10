#!/bin/bash
# SplitXpense Server - EC2 Setup Script
# Run on a fresh EC2 instance (Amazon Linux 2023 or Ubuntu 22.04)
# Note: On Windows, run `chmod +x deploy/*.sh` in WSL/Git Bash before deploying.

set -e

echo "=== Installing Docker ==="
if command -v apt-get &> /dev/null; then
  # Ubuntu
  sudo apt-get update
  sudo apt-get install -y docker.io docker-compose-plugin
  sudo systemctl enable docker
  sudo systemctl start docker
  sudo usermod -aG docker $USER
else
  # Amazon Linux
  sudo yum update -y
  sudo yum install -y docker
  sudo systemctl enable docker
  sudo systemctl start docker
  sudo usermod -aG docker $USER
  sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
  sudo chmod +x /usr/local/bin/docker-compose
fi

echo "=== Installing Nginx (reverse proxy) ==="
if command -v apt-get &> /dev/null; then
  sudo apt-get install -y nginx certbot python3-certbot-nginx
else
  sudo yum install -y nginx certbot python3-certbot-nginx
fi

echo "=== Creating app directory ==="
sudo mkdir -p /opt/splitxpense
sudo chown $USER:$USER /opt/splitxpense

echo "=== Creating Nginx config ==="
sudo tee /etc/nginx/conf.d/splitxpense.conf > /dev/null <<'NGINX'
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
NGINX

sudo systemctl restart nginx

echo ""
echo "=== Setup Complete ==="
echo "Next steps:"
echo "1. Copy your project to /opt/splitxpense/"
echo "2. Create .env file with your credentials"
echo "3. Run: cd /opt/splitxpense && docker-compose up -d"
echo "4. For SSL: sudo certbot --nginx -d yourdomain.com"
