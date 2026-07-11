#!/bin/bash
# Первичная настройка нового VPS (Ubuntu 22/24). Запуск на НОВОМ сервере:
#   scp scripts/bootstrap-new-vps.sh root@NEW_IP:/root/ && ssh root@NEW_IP bash /root/bootstrap-new-vps.sh
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive

apt-get update -qq
apt-get install -y -qq curl ca-certificates gnupg nginx certbot python3-certbot-nginx postgresql postgresql-contrib

if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -qq nodejs
fi

npm install -g pm2

sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='seashell'" | grep -q 1 || \
  sudo -u postgres createuser -s seashell 2>/dev/null || true

sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='seashell'" | grep -q 1 || \
  sudo -u postgres createdb -O seashell seashell 2>/dev/null || true

mkdir -p /root/seashell-server-new /var/www/seashell-tg

cat >/etc/nginx/sites-available/seashell-api <<'EOF'
server {
  listen 80;
  server_name api.sishel.ru;
  location / {
    proxy_pass http://127.0.0.1:3001;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
EOF

cat >/etc/nginx/sites-available/seashell-tg-web <<'EOF'
server {
  listen 80;
  server_name front.sishel.ru;
  root /var/www/seashell-tg;
  index index.html;

  location = /index.html {
    add_header Cache-Control "no-cache, must-revalidate";
    try_files $uri =404;
  }
  location / {
    try_files $uri $uri/ /index.html;
  }
  location ~* \.(js|css|png|svg|webp|woff2?)$ {
    expires 7d;
    add_header Cache-Control "public, immutable";
    try_files $uri =404;
  }
}
EOF

ln -sf /etc/nginx/sites-available/seashell-api /etc/nginx/sites-enabled/
ln -sf /etc/nginx/sites-available/seashell-tg-web /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo ""
echo "✓ Bootstrap OK: node $(node -v), nginx, postgres, pm2"
echo "  После смены DNS:"
echo "    certbot --nginx -d api.sishel.ru -d front.sishel.ru --non-interactive --agree-tos -m YOUR_EMAIL"
