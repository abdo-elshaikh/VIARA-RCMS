import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { getDb } from "../../../../db";
import { inquiries } from "../../../../db/schema";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "مصدر الطلب غير صحيح." }, { status: 403 });
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "يلزم تسجيل الدخول." }, { status: 401 });
  const { id } = await params;
  try {
    const removed = await getDb().delete(inquiries).where(and(eq(inquiries.id, id), eq(inquiries.userId, user.userId))).returning({ id: inquiries.id });
    if (!removed.length) return NextResponse.json({ error: "الطلب غير موجود." }, { status: 404 });
    return NextResponse.json({ deleted: true });
  } catch { return NextResponse.json({ error: "تعذر حذف الطلب." }, { status: 503 }); }
}
