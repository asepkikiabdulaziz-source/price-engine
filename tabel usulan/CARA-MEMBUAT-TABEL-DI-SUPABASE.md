# Cara Membuat Tabel di Supabase

## 🎯 Tujuan

Membuat semua tabel yang diperlukan untuk import CSV data.

---

## ✅ Langkah-Langkah

### Step 1: Buka Supabase SQL Editor

1. Login ke [Supabase Dashboard](https://app.supabase.com)
2. Pilih project Anda
3. Klik **SQL Editor** di sidebar kiri

---

### Step 2: Enable UUID Extension

**Jalankan query ini dulu:**

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

**Atau via Dashboard:**
- Klik **Database** → **Extensions**
- Cari `uuid-ossp`
- Klik **Enable** (jika belum enabled)

---

### Step 3: Create All Tables

**Opsi A: Menggunakan File CREATE-TABLES-SAFE.sql (Recommended)**

1. Buka file `tabel usulan/CREATE-TABLES-SAFE.sql`
2. Copy seluruh isi file
3. Paste di Supabase SQL Editor
4. Klik **Run** (atau tekan `Ctrl+Enter`)

**Opsi B: Menggunakan File SCHEMA-CSV-FINAL.sql**

1. Buka file `tabel usulan/SCHEMA-CSV-FINAL.sql`
2. Copy seluruh isi file
3. Paste di Supabase SQL Editor
4. Klik **Run** (atau tekan `Ctrl+Enter`)

---

### Step 4: Verifikasi Tabel Sudah Dibuat

**Jalankan query ini untuk cek:**

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;
```

**Harus ada 21 tabel:**
- bundle_promo
- bundle_promo_group_items
- bundle_promo_groups
- depos
- free_product_promo
- group_promo
- group_promo_tiers
- invoice_discounts
- master_products
- prices
- principal_discount_tiers
- principals
- product_group_availability
- product_group_members
- product_groups
- promo_availability
- regions
- store_loyalty_availability
- store_loyalty_area_rules
- store_loyalty_classes
- zones
- bucket_members

---

## ⚠️ Troubleshooting

### Error: "extension uuid-ossp does not exist"

**Solusi:**
```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

Atau enable via Dashboard: **Database** → **Extensions** → `uuid-ossp` → **Enable**

---

### Error: "relation already exists"

**Ini normal!** Artinya tabel sudah ada. Bisa:
- Skip (biarkan saja)
- Atau gunakan file `CREATE-TABLES-SAFE.sql` yang pakai `IF NOT EXISTS`

---

### Error: "column id referenced in foreign key constraint does not exist"

**Penyebab:** Urutan CREATE TABLE salah atau tabel yang direferensikan belum dibuat.

**Solusi:**
- Gunakan file `CREATE-TABLES-SAFE.sql` (sudah pakai `IF NOT EXISTS` dan urutan benar)
- Atau pastikan jalankan seluruh SQL schema, jangan sebagian

---

### Error: "Could not find the table 'public.xxx' in the schema cache"

**Penyebab:** Tabel belum dibuat.

**Solusi:**
1. Pastikan SQL schema sudah dijalankan
2. Refresh Supabase dashboard
3. Verifikasi dengan query `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`

---

## 📋 Checklist

- [ ] UUID extension sudah diaktifkan
- [ ] SQL schema sudah dijalankan (seluruh file)
- [ ] Semua 21 tabel sudah dibuat (verifikasi dengan query)
- [ ] Tidak ada error di SQL Editor
- [ ] Coba import CSV lagi

---

## 🔄 Jika Perlu Recreate Tabel

**HATI-HATI: Ini akan menghapus semua data!**

Jika perlu drop dan recreate semua tabel:

```sql
-- Drop tables (reverse order dari dependencies)
DROP TABLE IF EXISTS bundle_promo_group_items CASCADE;
DROP TABLE IF EXISTS bundle_promo_groups CASCADE;
DROP TABLE IF EXISTS bundle_promo CASCADE;
DROP TABLE IF EXISTS free_product_promo CASCADE;
DROP TABLE IF EXISTS invoice_discounts CASCADE;
DROP TABLE IF EXISTS promo_availability CASCADE;
DROP TABLE IF EXISTS group_promo_tiers CASCADE;
DROP TABLE IF EXISTS group_promo CASCADE;
DROP TABLE IF EXISTS principal_discount_tiers CASCADE;
DROP TABLE IF EXISTS store_loyalty_availability CASCADE;
DROP TABLE IF EXISTS store_loyalty_area_rules CASCADE;
DROP TABLE IF EXISTS store_loyalty_classes CASCADE;
DROP TABLE IF EXISTS product_group_availability CASCADE;
DROP TABLE IF EXISTS bucket_members CASCADE;
DROP TABLE IF EXISTS product_group_members CASCADE;
DROP TABLE IF EXISTS product_groups CASCADE;
DROP TABLE IF EXISTS prices CASCADE;
DROP TABLE IF EXISTS master_products CASCADE;
DROP TABLE IF EXISTS principals CASCADE;
DROP TABLE IF EXISTS depos CASCADE;
DROP TABLE IF EXISTS regions CASCADE;
DROP TABLE IF EXISTS zones CASCADE;

-- Kemudian jalankan CREATE TABLE dari CREATE-TABLES-SAFE.sql
```

---

## ✅ File yang Tersedia

1. **`CREATE-TABLES-SAFE.sql`** (Recommended)
   - Menggunakan `IF NOT EXISTS`
   - Aman untuk dijalankan berkali-kali
   - Tidak akan error jika tabel sudah ada

2. **`SCHEMA-CSV-FINAL.sql`**
   - SQL schema lengkap dengan comment
   - Perlu dijalankan sekali saja (akan error jika tabel sudah ada)

---

## 💡 Rekomendasi

**Gunakan `CREATE-TABLES-SAFE.sql`** untuk memastikan semua tabel dibuat tanpa error, bahkan jika beberapa tabel sudah ada sebelumnya.

