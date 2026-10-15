## إعداد VPN للأخصائيين (WireGuard)

### قبل النشر
- [ ] تأكد من فتح منفذ **51820/UDP** في الـ firewall (على مستوى الخادم وأي جدار ناري خارجي)
- [ ] تأكد من دعم الخادم لـ kernel module `wireguard` (Linux 5.6+ أو تثبيت يدوي)
- [ ] عيّن القيم الصحيحة في `.env`:
  - `VPN_SERVER_URL` = العنوان العام للخادم (IP أو domain)
  - `VPN_PORT` = 51820 (أو منفذ بديل)
  - `VPN_PEERS` = عدد الأخصائيين
  - `VPN_SUBNET` = 10.8.0.0/24 (أو subnet مختلف)

### تشغيل WireGuard
- [ ] شغّل خدمة WireGuard: `docker compose up -d wireguard`
- [ ] تحقق من التشغيل: `docker exec viara-vpn wg show`
- [ ] تأكد أن الـ healthcheck يعود بنتيجة ناجحة: `docker compose ps wireguard`

### توزيع ملفات إعداد الأخصائيين
- [ ] استخرج ملفات peers: `docker exec viara-vpn ls /config/`
- [ ] أرسل لكل أخصائي ملف `peer*.conf` المخصص له عبر قناة آمنة
- [ ] وثّق أسماء الأجهزة ومعرفات peers في سجل الإدارة

### اختبار الوصول لـ PACS عبر VPN
- [ ] اتصل بـ VPN من جهاز خارج الشبكة المحلية
- [ ] تحقق من الـ IP: يجب أن يكون من النطاق `10.8.0.x`
- [ ] افتح `https://pacs.{DOMAIN}` — يجب أن يعمل بدون 403
- [ ] بدون VPN: افتح `https://pacs.{DOMAIN}` — يجب أن يظهر 403
- [ ] تحقق من logs Caddy: `docker compose logs caddy | grep pacs`

### مراجع
- دليل إعداد الأخصائيين: `docs/VPN_RADIOLOGIST_SETUP.md`
- إعداد Caddy: `Caddyfile` (block: `pacs.{$DOMAIN}`)
- إعداد WireGuard: `docker-compose.yml` (service: `wireguard`)
