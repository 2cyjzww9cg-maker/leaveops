# Production Deploy (Link khong het han, truy cap on dinh)

## Muc tieu
- Link co dinh, khong doi sau moi lan chay.
- Nhieu nguoi truy cap/chinh sua dong bo cung luc.
- Du lieu duoc luu ben vung.

## Lua chon khuyen nghi (de thi + de demo)
1. VPS (Hetzner/DigitalOcean/Linode) + Nginx + Cloudflare DNS.
2. Chay app bang `python3 server.py` voi service manager (`systemd`), auto restart.
3. Dat `DELETE_PASS` trong env (khong hardcode).
4. Bat HTTPS (Cloudflare proxy hoac Let's Encrypt).

## Chay local server
```bash
cd /path/to/files-mentioned-by-the-user-a
cp .env.example .env
# sua DELETE_PASS
export $(cat .env | xargs)
python3 server.py
```

## Cau hinh systemd (Linux VPS)
```ini
[Unit]
Description=LeaveOps API
After=network.target

[Service]
User=www-data
WorkingDirectory=/opt/leaveops
Environment=PORT=4173
Environment=DELETE_PASS=PO ME DEV
Environment=MAX_BODY_BYTES=2097152
Environment=MAX_EMPLOYEES=10000
Environment=STATE_RATE_LIMIT_PER_MIN=240
Environment=DELETE_RATE_LIMIT_PER_MIN=30
ExecStart=/usr/bin/python3 /opt/leaveops/server.py
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

## Nginx reverse proxy
```nginx
server {
    listen 80;
    server_name leaveops.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:4173;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Ghi chu quan trong
- Neu dung free tunnel (localhost.run/ngrok free), URL se doi va co the ngat.
- Neu dung Render free, service co the sleep va local filesystem khong ben vung.
- De "khong gioi han thoi gian/link co dinh", can host tren VPS hoac goi cloud tra phi co uptime SLA.
