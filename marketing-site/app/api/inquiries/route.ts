import { NextResponse } from "next/server";
import { and, eq, gte, count } from "drizzle-orm";
import { getChatGPTUser } from "../../chatgpt-auth";
import { getDb } from "../../../db";
import { inquiries } from "../../../db/schema";
import { inquirySchema } from "../../../lib/inquiry";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "تعذر التحقق من مصدر الطلب." }, { status: 403 });
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "يرجى تسجيل الدخول لإرسال طلبك.", signIn: "/signin-with-chatgpt?return_to=%2F%23contact" }, { status: 401 });
  if (Number(request.headers.get("content-length") || 0) > 16000) return NextResponse.json({ error: "حجم الطلب أكبر من المسموح." }, { status: 413 });
  let data: unknown;
  try { data = await request.json(); } catch { return NextResponse.json({ error: "يرجى مراجعة البيانات والمحاولة مجددًا." }, { status: 400 }); }
  const parsed = inquirySchema.safeParse(data);
  if (!parsed.success) return NextResponse.json({ error: "يرجى إدخال الاسم وبيانات المركز وبريد ورقم هاتف صحيحين، والموافقة على استخدام بيانات التواصل." }, { status: 400 });
  const { id, name, email, phone, organization, facility, branches, interest, plan, message, locale, offer } = parsed.data;
  try {
    const db = getDb();
    const previous = await db.select({ userId: inquiries.userId }).from(inquiries).where(eq(inquiries.id, id)).get();
    if (previous) {
      if (previous.userId !== user.userId) return NextResponse.json({ error: "يرجى إعادة فتح الصفحة وإنشاء طلب جديد." }, { status: 409 });
      return NextResponse.json({ id, reference: `VR-${id.slice(0, 8).toUpperCase()}` });
    }
    const recent = await db.select({ total: count() }).from(inquiries).where(and(eq(inquiries.userId, user.userId), gte(inquiries.createdAt, Date.now() - 3600000))).get();
    if ((recent?.total || 0) >= 10) return NextResponse.json({ error: "وصلت إلى الحد المسموح للطلبات. يرجى المحاولة لاحقًا." }, { status: 429 });
    await db.insert(inquiries).values({ id, userId: user.userId, name, email, phone, organization, facility, branches, interest, plan, message, locale, offer, createdAt: Date.now() });
    return NextResponse.json({ id, reference: `VR-${id.slice(0, 8).toUpperCase()}` }, { status: 201 });
  } catch { return NextResponse.json({ error: "تعذر حفظ الطلب الآن. بياناتك ما زالت في النموذج؛ يرجى المحاولة مجددًا." }, { status: 503 }); }
}
