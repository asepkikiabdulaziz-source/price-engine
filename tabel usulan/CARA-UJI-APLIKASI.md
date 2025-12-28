# Cara Uji Aplikasi Import CSV

## 📋 Checklist Sebelum Uji

- [ ] ✅ Node.js sudah terinstall
- [ ] ✅ Dependencies sudah diinstall (`npm install`)
- [ ] ✅ Supabase project sudah dibuat
- [ ] ✅ `SUPABASE_URL` dan `SUPABASE_ANON_KEY` sudah benar di script
- [ ] ✅ Semua tabel SQL sudah dibuat di Supabase (jalankan `SCHEMA-CSV-FINAL.sql`)
- [ ] ✅ File CSV sudah ada di folder `tabel usulan`

---

## 🗄️ Step 1: Buat Tabel di Supabase

**PENTING: Harus dilakukan pertama kali!**

1. Buka [Supabase Dashboard](https://app.supabase.com)
2. Pilih project Anda
3. Klik **SQL Editor**
4. Copy seluruh isi file `tabel usulan/SCHEMA-CSV-FINAL.sql`
5. Paste di SQL Editor
6. Klik **Run** (atau tekan `Ctrl+Enter`)
7. Pastikan tidak ada error

**Verifikasi tabel sudah dibuat:**
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;
```

**Harus ada 20 tabel:**
- bundle_promo
- bundle_promo_groups
- bucket_members
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
- store_loyalty_classes
- zones

---

## 📦 Step 2: Install Dependencies

Buka terminal di folder project:

```bash
cd "d:\PROJECT\JKS-ENGINE\price-engine"
npm install @supabase/supabase-js csv-parse
```

---

## ⚙️ Step 3: Verifikasi Konfigurasi

Pastikan `SUPABASE_URL` dan `SUPABASE_ANON_KEY` sudah benar di `scripts/import-csv.js`:

```javascript
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dthgezcoklarfwbzkqym.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGc...';
```

**Atau set via environment variables:**
```bash
# Windows PowerShell
$env:SUPABASE_URL="your-url"
$env:SUPABASE_ANON_KEY="your-key"

# Windows CMD
set SUPABASE_URL=your-url
set SUPABASE_ANON_KEY=your-key
```

---

## 🚀 Step 4: Uji Import (Step by Step)

### Opsi A: Import Langsung (Semua Step)

```bash
node scripts/import-csv.js
```

### Opsi B: Import Step by Step (Recommended)

```bash
# Step 1: Zones
node scripts/import-csv.js 1

# Step 2: Regions
node scripts/import-csv.js 2

# Step 3: Depos
node scripts/import-csv.js 3

# Step 4: Principals
node scripts/import-csv.js 4

# Step 5: Master Products
node scripts/import-csv.js 5

# Step 6: Prices
node scripts/import-csv.js 6

# Step 7: Product Groups
node scripts/import-csv.js 7

# Step 8: Product Group Members
node scripts/import-csv.js 8

# Step 9: Bucket Members
node scripts/import-csv.js 9

# Step 10: Product Group Availability
node scripts/import-csv.js 10

# Step 11: Store Loyalty Classes
node scripts/import-csv.js 11

# Step 12: Store Loyalty Availability
node scripts/import-csv.js 12

# Step 13: Principal Discount Tiers
node scripts/import-csv.js 13

# Step 14: Group Promo
node scripts/import-csv.js 14

# Step 15: Bundle Promo
node scripts/import-csv.js 15

# Step 16: Invoice Discounts
node scripts/import-csv.js 16

# Step 17: Free Product Promo
node scripts/import-csv.js 17

# Step 18: Promo Availability
node scripts/import-csv.js 18
```

---

## ✅ Step 5: Verifikasi Data

### Verifikasi di Supabase Dashboard:

1. Buka **Table Editor**
2. Pilih tabel yang sudah diimport
3. Pastikan data sudah masuk

### Verifikasi dengan Query:

```sql
-- Cek jumlah data per tabel
SELECT 'zones' as table_name, COUNT(*) as count FROM zones
UNION ALL
SELECT 'products', COUNT(*) FROM master_products
UNION ALL
SELECT 'prices', COUNT(*) FROM prices
UNION ALL
SELECT 'bundle_promo', COUNT(*) FROM bundle_promo
UNION ALL
SELECT 'bundle_promo_groups', COUNT(*) FROM bundle_promo_groups
UNION ALL
SELECT 'bucket_members', COUNT(*) FROM bucket_members;
```

---

## 🔍 Step 6: Uji Bundle Promo (Khusus)

Karena bundle promo menggunakan `bucket_id` yang di-lookup dari `bucket_members`, pastikan:

1. **Bucket Members sudah diimport** (Step 9):
```sql
SELECT bucket_id, COUNT(*) as product_count
FROM bucket_members
GROUP BY bucket_id;
```

2. **Bundle Promo Groups menggunakan bucket_id yang benar:**
```sql
SELECT 
    bpg.promo_id,
    bpg.group_number,
    bpg.bucket_id,
    COUNT(bm.product_id) as product_count
FROM bundle_promo_groups bpg
LEFT JOIN bucket_members bm ON bm.bucket_id = bpg.bucket_id
GROUP BY bpg.promo_id, bpg.group_number, bpg.bucket_id;
```

3. **Query untuk mendapatkan product_ids per promo:**
```sql
SELECT 
    bpg.promo_id,
    bpg.group_number,
    bpg.bucket_id,
    array_agg(bm.product_id) as product_ids
FROM bundle_promo_groups bpg
LEFT JOIN bucket_members bm ON bm.bucket_id = bpg.bucket_id
WHERE bpg.promo_id = 'PAKET-A'
GROUP BY bpg.promo_id, bpg.group_number, bpg.bucket_id;
```

---

## ⚠️ Troubleshooting

### Error: "Could not find the table 'public.xxx'"

**Solusi:**
- Pastikan `SCHEMA-CSV-FINAL.sql` sudah dijalankan di Supabase SQL Editor
- Refresh Supabase dashboard

### Error: "npm" atau "node" tidak dikenali

**Solusi:**
- Install Node.js dari [nodejs.org](https://nodejs.org)
- Atau gunakan full path: `"C:\Program Files\nodejs\node.exe" scripts/import-csv.js`

### Error: "invalid input syntax for type uuid"

**Solusi:**
- Pastikan kolom yang diharapkan UUID tidak menerima TEXT
- Cek mapping CSV → SQL sudah benar

### Error: "Failed to batch lookup"

**Solusi:**
- Pastikan step dependency sudah diimport dulu
- Contoh: Bundle Promo (Step 15) memerlukan Bucket Members (Step 9)

### Error: "column xxx does not exist"

**Solusi:**
- Pastikan nama kolom di CSV sesuai dengan yang diharapkan script
- Cek mapping di dokumentasi fungsi import

---

## 📝 Urutan Import yang Benar (Dependencies)

```
1. Zones
2. Regions
3. Depos
4. Principals
5. Master Products (requires: Principals)
6. Prices (requires: Zones, Master Products)
7. Product Groups
8. Product Group Members (requires: Master Products, Product Groups)
9. Bucket Members (requires: Master Products) ⚠️ HARUS DULUAN sebelum Bundle Promo
10. Product Group Availability (requires: Product Groups)
11. Store Loyalty Classes
12. Store Loyalty Availability (requires: Store Loyalty Classes)
13. Principal Discount Tiers (requires: Principals)
14. Group Promo (requires: Product Groups)
15. Bundle Promo (requires: Bucket Members) ⚠️ HARUS SETELAH Bucket Members
16. Invoice Discounts
17. Free Product Promo (requires: Master Products)
18. Promo Availability (requires: semua promo sudah diimport)
```

---

## 🎯 Quick Test (Minimal)

Untuk quick test, import minimal ini saja:

```bash
# 1. Master data geografis
node scripts/import-csv.js 1  # Zones
node scripts/import-csv.js 2  # Regions
node scripts/import-csv.js 3  # Depos

# 2. Master data produk
node scripts/import-csv.js 4  # Principals
node scripts/import-csv.js 5  # Master Products

# 3. Bucket (required untuk Bundle Promo)
node scripts/import-csv.js 9  # Bucket Members

# 4. Bundle Promo
node scripts/import-csv.js 15 # Bundle Promo
```

Kemudian verifikasi:
```sql
SELECT * FROM bundle_promo;
SELECT * FROM bundle_promo_groups;
SELECT * FROM bucket_members;
```

---

## ✅ Success Criteria

Import berhasil jika:

1. ✅ Tidak ada error saat menjalankan script
2. ✅ Data muncul di Supabase Table Editor
3. ✅ Query bundle promo dengan JOIN bucket_members mengembalikan product_ids yang benar
4. ✅ Jumlah data sesuai dengan jumlah row di CSV (minus header)

---

## 📞 Next Steps

Setelah import berhasil:

1. Test query bundle promo dengan JOIN ke bucket_members
2. Test aplikasi price engine dengan data yang sudah diimport
3. Verifikasi logic promo bundle bekerja dengan benar

