# دليل إعداد VPN لأخصائيي الأشعة — نظام VIARA RCMS

> **ملاحظة أمنية:** هذا الدليل سري ومخصص لأخصائيي الأشعة المعتمدين فقط. لا تشارك ملفات الإعداد مع أي طرف ثالث.

---

## 1. لماذا VPN ضروري لأخصائيي الأشعة؟

يحتوي نظام VIARA RCMS على نظام أرشفة الصور الطبية (PACS/Orthanc) الذي يخزن صور DICOM الطبية الحساسة للمرضى. لحماية هذه البيانات:

- **PACS غير متاح عبر الإنترنت العام** — جميع الطلبات من خارج الشبكة المحلية تُرفض تلقائياً برمز 403.
- **الوصول مقيّد بشبكة WireGuard VPN** فقط — تضمن تشفير كل حركة بيانات DICOM من طرف إلى طرف.
- WireGuard هو بروتوكول VPN حديث وسريع ومصمم للأداء العالي، مما يجعله مناسباً لنقل ملفات DICOM الضخمة.

---

## 2. متطلبات الخادم

### المنافذ المطلوبة
| المنفذ | البروتوكول | الغرض |
|--------|------------|--------|
| 51820  | UDP        | WireGuard VPN |
| 443    | TCP        | HTTPS (Caddy) |
| 80     | TCP        | HTTP redirect |

### Kernel Modules المطلوبة
يتطلب WireGuard الـ modules التالية على الخادم المضيف:
```bash
# تحقق من توفر الـ module
lsmod | grep wireguard

# تحميل يدوياً إذا لزم
modprobe wireguard
```

> على Linux kernel 5.6+ يكون WireGuard مدمجاً تلقائياً.

---

## 3. إعداد الخادم (للمسؤول التقني)

### تشغيل WireGuard عبر Docker Compose

```bash
# في مجلد viara-production-package
cd /opt/viara-production-package

# تعديل .env بالقيم الصحيحة
# VPN_SERVER_URL=<IP العام للخادم أو domain>
# VPN_PORT=51820
# VPN_PEERS=<عدد الأخصائيين>

# تشغيل خدمة WireGuard
docker compose up -d wireguard

# التحقق من التشغيل
docker compose logs wireguard
docker exec viara-vpn wg show
```

### التحقق من حالة الخدمة
```bash
# عرض معلومات WireGuard
docker exec viara-vpn wg show

# عرض logs
docker compose logs -f wireguard
```

---

## 4. استخراج ملفات إعداد الأجهزة

بعد تشغيل WireGuard، تُنشأ ملفات إعداد الأجهزة (peers) تلقائياً:

```bash
# عرض ملفات الـ peers
docker exec viara-vpn ls /config/peer*/

# نسخ ملف إعداد أول أخصائي
docker exec viara-vpn cat /config/peer1/peer1.conf

# أو QR code للهاتف
docker exec viara-vpn cat /config/peer1/peer1.png | base64
# يمكن عرضه عبر: qrencode -t ansiutf8 < /config/peer1/peer1.conf
```

> **مهم للمسؤول:** أرسل ملف `peer*.conf` لكل أخصائي عبر قناة آمنة (بريد مشفر أو منصة آمنة). **لا ترسله عبر واتساب أو بريد عادي.**

---

## 5. إعداد جهاز الأخصائي — Windows

### الخطوة 1: تحميل WireGuard Client
1. افتح المتصفح وانتقل إلى: **https://www.wireguard.com/install/**
2. اختر **Windows** وحمّل المثبّت
3. شغّل المثبّت بصلاحيات Administrator

### الخطوة 2: استيراد ملف الإعداد
1. افتح تطبيق **WireGuard** من قائمة Start
2. انقر على **Import tunnel(s) from file**
3. اختر ملف `peer*.conf` الذي أرسله لك المسؤول
4. سيظهر اسم النفق (مثل `peer1`) في القائمة

### الخطوة 3: الاتصال والتحقق
1. انقر على اسم النفق ثم انقر **Activate**
2. يجب أن يتحول المؤشر إلى **Active** باللون الأخضر
3. انتقل للقسم 7 للتحقق من الاتصال

### استكشاف أخطاء Windows
- إذا فشل الاتصال: تأكد أن Windows Firewall لا يحجب UDP 51820
- تأكد أنك تشغّل WireGuard بصلاحيات Administrator

---

## 6. إعداد جهاز الأخصائي — macOS و Linux

### macOS
```bash
# تثبيت عبر Homebrew
brew install wireguard-tools

# أو من App Store: WireGuard
# انتقل لـ App Store وابحث عن "WireGuard"
```
1. افتح تطبيق **WireGuard** من Applications
2. انقر **Import tunnel(s) from file** واختر ملف `.conf`
3. انقر **Allow** عند طلب VPN permissions
4. فعّل النفق والتحقق من الاتصال (القسم 7)

### Linux
```bash
# Ubuntu/Debian
sudo apt update && sudo apt install wireguard

# Fedora/RHEL
sudo dnf install wireguard-tools

# نسخ ملف الإعداد
sudo cp peer1.conf /etc/wireguard/wg0.conf

# تفعيل النفق
sudo wg-quick up wg0

# تشغيل تلقائي مع النظام
sudo systemctl enable wg-quick@wg0
```

---

## 7. التحقق من الاتصال قبل فتح PACS

**قبل فتح أي نظام PACS، تحقق دائماً من الاتصال:**

### Windows
```powershell
# تحقق من IP الـ VPN
ipconfig | findstr 10.8

# يجب أن ترى شيئاً مثل:
# IPv4 Address: 10.8.0.2
```

### macOS / Linux
```bash
# تحقق من interface WireGuard
wg show

# تحقق من الـ IP
ip addr show wg0
# أو
ifconfig wg0

# يجب أن ترى IP من النطاق 10.8.0.0/24
```

### اختبار الوصول لـ PACS
```bash
# اختبر الوصول للخادم عبر VPN
ping 10.8.0.1

# إذا نجح: افتح متصفحك وانتقل لـ
# https://pacs.yourdomain.com
```

> **إذا رأيت رسالة "Access restricted to VPN users only" (403)**: أنت غير متصل بـ VPN. فعّل WireGuard أولاً.

---

## 8. استكشاف الأخطاء الشائعة

| المشكلة | السبب المحتمل | الحل |
|---------|---------------|------|
| "Access restricted to VPN users only" | VPN غير مفعّل | فعّل WireGuard وتحقق أن الـ IP من 10.8.0.x |
| النفق يظهر Active لكن لا يوجد اتصال | Firewall يحجب UDP 51820 | تواصل مع مسؤول الشبكة لفتح المنفذ |
| بطء شديد في تحميل صور DICOM | جودة الإنترنت | جرب تغيير الشبكة أو استخدام تردد 5GHz WiFi |
| ملف .conf لا يُستورد | صيغة خاطئة | تأكد أن الملف لا يزال بامتداد .conf |
| "Handshake did not complete" | IP الخادم تغيّر | تواصل مع المسؤول للحصول على ملف conf جديد |
| انتهاء صلاحية الإعداد | ملف conf قديم | اطلب ملف conf محدّث من المسؤول |

---

## 9. توصيات أمان إضافية لجهاز الأخصائي

### حماية الجهاز
- ✅ **تشفير القرص الصلب:** فعّل BitLocker (Windows) أو FileVault (macOS)
- ✅ **كلمة مرور قوية:** استخدم كلمة مرور معقدة لحسابك على الجهاز
- ✅ **تحديثات النظام:** حافظ على تحديث نظام التشغيل وتطبيق WireGuard
- ✅ **مضاد فيروسات:** تأكد من تشغيل برنامج حماية موثوق

### حماية ملفات الإعداد
- ❌ **لا تشارك ملف .conf** مع أي شخص آخر
- ❌ **لا ترسله عبر قنوات غير آمنة** (واتساب، بريد عادي)
- ✅ **احذف ملف .conf** من المجلد بعد الاستيراد في WireGuard
- ✅ **أبلغ المسؤول فوراً** إذا فقدت الجهاز أو اشتبهت بتسرب الملف

### عند الانتهاء من العمل
- ✅ **أوقف النفق** (Deactivate) بعد الانتهاء من الجلسة
- ✅ **لا تترك النفق مفعّلاً** دون حاجة

---

## 10. التواصل مع المسؤول التقني

إذا واجهت أي مشكلة غير مذكورة أعلاه:
1. اجمع: نظام التشغيل، إصدار WireGuard، رسالة الخطأ الكاملة
2. تواصل مع المسؤول التقني للمرفق
3. **لا تحاول مشاركة ملف .conf لحل المشكلة** — اطلب ملفاً جديداً بدلاً من ذلك

---

*آخر تحديث: أُعدّ هذا الدليل كجزء من حزمة نشر VIARA RCMS. يُراجع عند كل تحديث رئيسي للنظام.*
