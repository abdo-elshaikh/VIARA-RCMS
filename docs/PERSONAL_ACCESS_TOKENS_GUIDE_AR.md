# دليل ومراجعة مفاتيح الوصول الشخصية (Personal Access Tokens - PATs)
**نظام VIARA لإدارة مراكز الأشعة والعيادات (RCMS)**  
**تاريخ المراجعة والإصدار:** 2026-10-07  
**الحالة:** معتمد رسمياً للإنتاج 🟢

---

## 1. نظرة عامة والهدف المعماري (Architectural Overview)

تُعد **مفاتيح الوصول الشخصية (Personal Access Tokens - PATs)** في منظومة VIARA الآلية المعتمدة للمصادقة الآلية وتكامل الأنظمة من خادم إلى خادم (Machine-to-Machine / M2M) والتطبيقات الموثوقة الخارجية (مثل أنظمة PACS/RIS، أنظمة السجلات الطبية الإلكترونية EMR/HIS، أدوات التحليل، والنصوص البرمجية المؤتمتة)، دون الحاجة للاعتماد على جلسات المتصفح التفاعلية أو تمرير بيانات اعتماد المستخدم (اسم المستخدم وكلمة المرور) في كل استدعاء.

### الخصائص المعمارية الأساسية:
1. **الارتباط بالهوية الفردية:** يرتبط كل مفتاح وصول شخصي بمستخدم محدد في النظام (`user_id`)، ويرث كامل صلاحياته المحددة عبر نظام التحكم بالوصول القائم على الأدوار (RBAC).
2. **عزل النطاقات (Scope Isolation):** ينقسم الوصول إلى مستويين صارمين: مستوى **للقراءة فقط (`read`)**، ومستوى **للقراءة والكتابة (`read_write`)** الخاضع لحوكمة أمنية مشددة.
3. **أمان تشفيري أحادي الاتجاه (One-Way Hashing):** لا يتم حفظ المفتاح الخام مطلقاً في قاعدة البيانات، بل يتم تشفيره بتجزئة `SHA-256` مفهرسة تضمن تحققاً سريعاً وفائق الأمان.
4. **استثناء CSRF الآمن:** تُعفى طلبات الـ PAT التي تحمل ترويسة `Authorization: Bearer VIARA_live_...` من قيود كوكيز CSRF الخاصة بالمتصفحات، لتسهيل تكامل واجهات التطبيقات الخارجية.

---

## 2. التحليل الأمني والفني التفصيلي (Technical & Security Audit)

### 2.1 بنية وتوليد المفتاح (Key Generation)
- **دالة التوليد:** يعتمد النظام على مولد أرقام عشوائي مشفر وقوي (`crypto.randomBytes(32)`):
  $$\text{Entropy} = 32 \text{ bytes} \times 8 = 256 \text{ bits of cryptographically secure entropy}$$
- **التنسيق القياسي:** يبدأ المفتاح بالبادئة التشغيلية `VIARA_live_` متبوعة بـ 64 رمزاً ست عشرياً:
  ```text
  VIARA_live_a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0
  ```
- **البادئة المرئية (Masked Prefix):** يتم استقطاع أول 15 رمزاً مع علامة إخفاء (`VIARA_live_ab1...`) وتخزينها في حقل `prefix` لأغراض تمييز المفاتيح في واجهة المستخدم دون كشف الرمز السري.

### 2.2 التخزين والمصادقة في قاعدة البيانات (Database Hashing & Lookup)
- **جدول التخزين:** جدول `api_tokens` في قاعدة بيانات PostgreSQL:
  ```sql
  CREATE TABLE api_tokens (
      token_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      name VARCHAR(100) NOT NULL,
      token_hash VARCHAR(255) NOT NULL UNIQUE,
      prefix VARCHAR(20) NOT NULL,
      access_level VARCHAR(20) NOT NULL DEFAULT 'read' CHECK (access_level IN ('read', 'read_write')),
      last_used_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );
  ```
- **فهرسة والبحث اللحظي $O(1)$:**
  - يتم تشفير المفتاح القادم فورياً عبر: `crypto.createHash('sha256').update(token).digest('hex')`.
  - يتم الاستعلام المباشر عبر `token_hash = $1` مع فحص حالة المستخدم `u.is_active = TRUE`.
  - زمن الاستجابة في قاعدة البيانات أقل من 1 مللي ثانية بفضل الفهرس الفريد، مقارنة بخوارزميات التجزئة البطيئة.
- **الترقية التلقائية لرموز Bcrypt القديمة:** يدعم النظام فحص الرموز القديمة وترقيتها آنياً في الخلفية إلى تجزئة `SHA-256` عند أول استخدام دون أي انقطاع في الخدمة.

### 2.3 مستويات الوصول والحوكمة (Access Levels & Governance)
| المستوى | الرمز | الطرق المسموحة | شروط الإنشاء | الاستخدام النموذجي |
| :--- | :---: | :---: | :--- | :--- |
| **للقراءة فقط** | `read` | `GET`, `HEAD`, `OPTIONS` | متاح لأي مستخدم نشط في النظام | سحب تقارير الفحوصات، الاستعلام عن قوائم العمل، مراقبة حالة الأجهزة |
| **قراءة وكتابة** | `read_write` | كافة الطرق (`GET`, `POST`, `PUT`, `DELETE`, `PATCH`) | يتطلب صلاحية `MANAGE_DATABASE_CONFIG` أو دور `Developer` | أنظمة حجز المواعيد الخارجية، تكاملات الـ PACS ثنائية الاتجاه، أتمتة الإدارة |

> [!CAUTION]
> عند محاولة مستخدم غير مرخص له إنشاء مفتاح `read_write`، يرفض الخادم الطلب برمز `403 Forbidden`، وتُسجّل المحاولة فوراً كحدث أمني `API_TOKEN_WRITE_SCOPE_DENIED` في جدول `security_logs` مع إخطار المشرفين.

### 2.4 دورة الحياة والأمان الإضافي
1. **العرض لمرة واحدة فقط (Single-Reveal):** يُعرض المفتاح الخام في استجابة HTTP لمرة واحدة فقط عند الإنشاء. لا يمكن استعادته لاحقاً، وفي حال فقدانه يجب إلغاؤه وإنشاء بديل.
2. **الإلغاء الفوري (Instant Revocation):** يؤدي حذف المفتاح عبر الواجهة أو عبر نقطة النهاية `DELETE /api/profile/tokens/:id` إلى حذفه من قاعدة البيانات في الحال، مما يعطل أي طلب قادم في نفس اللحظة برمز `403 Invalid Token`.
3. **الحذف والتعطيل التلقائي:**
   - إذا تم تجميد حساب المستخدم (`is_active = false`)، تتوقف جميع مفاتيحه فوراً عن العمل.
   - إذا تم حذف حساب المستخدم، تُحذف جميع مفاتيحه تلقائياً عبر قيد `ON DELETE CASCADE`.
4. **تتبع النشاط (`last_used_at`):** يتم تحديث الطابع الزمني لآخر استخدام تلقائياً عند كل طلب ناجح، مما يمكن مسؤولي النظام من كشف المفاتيح المتروكة أو المشبوهة.
5. **بوابة الانضباط الوظيفي (`attendanceWorkGate`):** الأدوار التشغيلية (موظفو الاستقبال، التمريض، الفنيين) يلزمهم تسجيل الحضور (Clock-in) لإجراء العمليات التعديلية غير القرائية حتى لو استخدموا مفاتيح الـ API.

---

## 3. دليل الاستخدام الشامل للمستخدم والمطور (Developer & User Guide)

### 3.1 كيفية توليد مفتاح جديد عبر واجهة النظام (GUI)

1. سجّل الدخول إلى منظومة VIARA بحساب يمتلك الصلاحيات المناسبة.
2. انتقل إلى **الإعدادات (Settings)** من القائمة الجانبية.
3. اختر تبويب **عمليات المطورين وقواعد البيانات (Developer Operations & Infrastructure)**.
4. توجّه إلى قسم **مفاتيح واجهة البرمجة (API Tokens)**.
5. انقر على زر **توليد مفتاح جديد (Generate / +)**.
6. املأ البيانات التالية:
   - **اسم المفتاح (Token Name):** اسم وصفي يوضح الغرض من المفتاح والجهة المستخدمة له (مثال: `EMR Sync Integration Server` أو `Monthly Analytics Script`).
   - **مستوى الوصول (Access Level):**
     - اختر **للقراءة فقط (Read Only)** إذا كان السكربت يقتصر على جلب البيانات والاستعلام.
     - اختر **وصول كامل (Read & Write)** إذا كان التطبيق يحتاج لإنشاء أو تعديل المواعيد، الفحوصات، أو السجلات (يتطلب إذن المطور).
7. اضغط على **توليد (Generate)**.
8. **هام جداً:** ستظهر نافذة خضراء تحتوي على المفتاح السري الكامل. انسخ المفتاح فوراً واحتفظ به في مخزن أسرار مشفر (مثل `.env` أو Vault)، فلن تتمكن من رؤيته مرة أخرى!

---

### 3.2 كيفية استخدام المفتاح في طلبات HTTP (Authentication Header)

يتم تمرير المفتاح في ترويسة الطلب القياسية `Authorization` بنوع `Bearer`:

```http
Authorization: Bearer VIARA_live_<YOUR_TOKEN_STRING>
```

---

### 3.3 أمثلة برمجية عملية (Code Samples)

#### أ. استخدام cURL (سطر الأوامر / Bash)

**1. استعلام عن الملف الشخصي (تحقق من صحة المفتاح):**
```bash
curl -X GET "http://localhost:3000/api/profile" \
  -H "Authorization: Bearer VIARA_live_YOUR_TOKEN_HERE" \
  -H "Accept: application/json"
```

**2. استعلام عن قائمة المرضى (يتطلب صلاحيات سريرية للمستخدم):**
```bash
curl -X GET "http://localhost:3000/api/patients?limit=10" \
  -H "Authorization: Bearer VIARA_live_YOUR_TOKEN_HERE" \
  -H "Accept: application/json"
```

**3. إنشاء موعد جديد (يتطلب مفتاح `read_write` وصلاحيات كتابة):**
```bash
curl -X POST "http://localhost:3000/api/appointments" \
  -H "Authorization: Bearer VIARA_live_YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "patient_id": "00000000-0000-0000-0000-000000000001",
    "appointment_date": "2026-10-15T10:00:00Z",
    "modality": "MRI",
    "notes": "Automated booking via integration bot"
  }'
```

---

#### ب. استخدام JavaScript / TypeScript (Node.js & Fetch)

```javascript
// viara-client.js
const VIARA_BASE_URL = process.env.VIARA_API_URL || 'http://localhost:3000';
const VIARA_API_TOKEN = process.env.VIARA_API_TOKEN; // VIARA_live_...

async function fetchPatientWorklist() {
    try {
        const response = await fetch(`${VIARA_BASE_URL}/api/queue?includeDelivered=false&limit=50`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${VIARA_API_TOKEN}`,
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            const errorBody = await response.json().catch(() => ({}));
            throw new Error(`VIARA API Error [${response.status}]: ${errorBody.error || response.statusText}`);
        }

        const data = await response.json();
        console.log(`Successfully fetched ${data.exams?.length || 0} exams from worklist.`);
        return data;
    } catch (err) {
        console.error('Failed to communicate with VIARA API:', err.message);
        throw err;
    }
}

// تنفيذ تجريبي
fetchPatientWorklist().catch(console.error);
```

---

#### ج. استخدام Python (Requests)

```python
import os
import requests

VIARA_BASE_URL = os.getenv("VIARA_API_URL", "http://localhost:3000")
VIARA_TOKEN = os.getenv("VIARA_API_TOKEN")

headers = {
    "Authorization": f"Bearer {VIARA_TOKEN}",
    "Accept": "application/json",
    "Content-Type": "application/json"
}

def verify_token_and_get_profile():
    url = f"{VIARA_BASE_URL}/api/profile"
    response = requests.get(url, headers=headers, timeout=10)
    
    if response.status_code == 200:
        profile = response.json()
        print(f"Authenticated as: {profile.get('full_name')} ({profile.get('role')})")
        return profile
    elif response.status_code == 403:
        print("Forbidden: Token is invalid, inactive, or unauthorized.")
    else:
        print(f"Error {response.status_code}: {response.text}")
    return None

if __name__ == "__main__":
    verify_token_and_get_profile()
```

---

#### د. الإعداد في Postman

1. افتح الطلب في Postman.
2. انتقل إلى تبويب **Authorization**.
3. في حقل **Type**، اختر **Bearer Token**.
4. في حقل **Token**، الصق المفتاح كاملاً: `VIARA_live_...`.
5. في تبويب **Headers**، تأكد من إضافة `Accept: application/json`.
6. أرسل الطلب.

---

## 4. استكشاف الأخطاء وحلها (Troubleshooting & Error Codes)

| كود الاستجابة HTTP | رسالة الخطأ / الكود | السبب المحتمل | إجراء الحل |
| :---: | :--- | :--- | :--- |
| **401 Unauthorized** | `Access Denied: No Token Provided` | ترويسة `Authorization` مفقودة أو لا تبدأ بـ `Bearer ` | تأكد من إرسال الترويسة بالتنسيق: `Bearer VIARA_live_...` |
| **403 Forbidden** | `Invalid Token` | المفتاح ملغى، غير موجود، أو حساب المستخدم غير نشط | أنشئ مفتاحاً جديداً وتأكد من حالة حساب المستخدم في إدارة المستخدمين |
| **403 Forbidden** | `Token is read-only` (`TOKEN_READ_ONLY`) | محاولة إجراء تعديل (`POST/PUT/DELETE`) بمفتاح مخصص للقراءة فقط | استبدل المفتاح بمفتاح ذي صلاحية `read_write` أو اقتصر على استعلامات `GET` |
| **403 Forbidden** | `Password change required` (`PASSWORD_CHANGE_REQUIRED`) | تم تعيين خيار إلزام تغيير كلمة المرور للمستخدم صاحب المفتاح | سجّل الدخول بحساب المستخدم عبر واجهة الويب وغيّر كلمة المرور أولاً |
| **403 Forbidden** | `Clock in before performing work` (`ATTENDANCE_CLOCK_IN_REQUIRED`) | حساب المستخدم يتبع دوراً تشغيلياً ولم يسجل الحضور | سجّل حضور الموظف (Clock-In) أو استخدم حساب تكامل مخصصاً بدور مناسب |
| **403 Forbidden** | `Access Denied: Requires <PERMISSION> permission` | دور المستخدم لا يمتلك الصلاحية المطلوبة للعملية | قم بترقية صلاحيات دور المستخدم في إدارة الأدوار والصلاحيات (RBAC) |
| **503 Unavailable** | `Authentication service unavailable` | تعذر اتصال الخادم بقاعدة البيانات للتحقق من المفتاح | تحقق من اتصال قاعدة بيانات PostgreSQL وجاهزية تجمع الاتصالات (Pool) |

---

## 5. أفضل الممارسات الأمنية الموصى بها (Security Best Practices)

1. **مبدأ الامتياز الأقل (Principle of Least Privilege):**
   - استخدم دائماً مفاتيح **للقراءة فقط (`read`)** لجميع عمليات الاستعلام، التقارير، والمراقبة.
   - لا تستخدم مفاتيح `read_write` إلا للأنظمة التي تحتاج فعلياً لإنشاء أو تعديل البيانات.
2. **عدم تضمين المفاتيح في الشيفرة المصدرية (Never Commit Secrets):**
   - لا تضع المفاتيح أبداً داخل ملفات الكود المصدري أو مستودعات Git.
   - استخدم متغيرات البيئة (`.env`) أو أنظمة إدارة الأسرار (HashiCorp Vault, AWS Secrets Manager).
3. **تسمية المفاتيح بدقة ومسؤولية:**
   - عيّن اسماً يوضح النظام والمضيف والغرض (مثال: `prod-pacs-gateway-server-01`).
4. **المراجعة الدورية والإلغاء الاستباقي:**
   - راجع قسم مفاتيح واجهة البرمجة دورياً وتفقد عمود **"آخر استخدام" (Last Used)**.
   - ألغِ فوراً أي مفاتيح لم تُستخدم منذ أكثر من 60 أو 90 يوماً أو انتهى الغرض منها.
5. **إنشاء حسابات تكامل مستقلة (Dedicated Service Accounts):**
   - تجنب استخدام المفاتيح الشخصية للأطباء أو المديرين في السكربتات الدائمة للأنظمة الخارجية.
   - يُفضل إنشاء حساب نظام مخصص (Service Account) بدور محدد بدقة، وتوليد المفاتيح منه لسهولة التدقيق وعزل المسؤولية.
6. **خطة الاستجابة عند الشك بالتسريب (Key Rotation & Incident Response):**
   - في حال الشك بتسرب أي مفتاح:
     1. انتقل فوراً إلى إعدادات المطورين وانقر على **إلغاء المفتاح (Revoke)**.
     2. أنشئ مفتاحاً بديلاً وحدّث إعدادات النظام الخارجي.
     3. راجع سجلات التدقيق (`/api/profile/audit` وسجلات `security_logs`) للتأكد من عدم وجود عمليات مريبة تمت خلال فترة التسريب.
