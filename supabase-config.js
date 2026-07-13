// ============================================================
//  SUPABASE CONFIG
//  ใส่ URL และ Anon Key ของโปรเจกต์ Supabase ของคุณตรงนี้
//  (หาได้จาก Supabase Dashboard → Project Settings → API)
// ============================================================
const SUPABASE_URL = "https://ddmoxqegjeapnghnwgof.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_UebQPAyZbTaXcQLuXq_TNw_0XgFQo0U";

// ชื่อ Storage Bucket ที่ใช้เก็บรูปสินค้า (ต้องสร้างเองใน Supabase Dashboard → Storage
// ตั้งเป็น Public bucket ชื่อ "product-images")
const SUPABASE_IMAGE_BUCKET = "product-images";

// สร้าง Supabase client (ใช้ตัวแปร global "supabase" จาก CDN script ที่โหลดใน index.html)
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
