# 📥 Panduan Import CSV ke Supabase

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd scripts
npm install
```

### 2. Run Import

```bash
npm run import
```

Atau:

```bash
node import-csv.js
```

---

## ✅ Prerequisites

1. ✅ **Supabase project sudah dibuat**
2. ✅ **Schema SQL sudah di-run** (`tabel usulan/SCHEMA-CSV-FINAL.sql`)
3. ✅ **Credentials sudah di-set** (di script atau env.js)

---

## 📊 Import Process

Script akan import data secara otomatis sesuai urutan dependency:

1. **Master Data Geografis**
   - zones

2. **Master Data Produk**
   - principals
   - products
   - prices

3. **Master Data Grup & Bucket**
   - product_groups
   - product_group_members
   - bucket_members
   - product_group_availability

4. **Master Data Loyalty**
   - store_loyalty_classes

5. **Promo & Diskon**
   - principal_discounts
   - principal_discount_tiers
   - group_promo + group_promo_tiers
   - bundle_promo + bundle_promo_groups + bundle_promo_group_items
   - invoice_discounts
   - free_product_promo
   - promo_availability

---

## 🔧 Configuration

### Option 1: Hardcode di Script (Quick Test)

Edit `scripts/import-csv.js`, line 25-26:

```javascript
const SUPABASE_URL = 'https://xxxxx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGc...';
```

### Option 2: Environment Variables

```bash
export SUPABASE_URL="https://xxxxx.supabase.co"
export SUPABASE_ANON_KEY="eyJhbGc..."
npm run import
```

### Option 3: Load dari env.js (Recommended)

Script sudah include credentials default dari env.js. Pastikan `env.js` sudah diisi dengan benar.

---

## 📝 Data Transformation

Script melakukan transformasi data berikut:

### 1. Code → ID Lookup
- CSV menggunakan **codes** (zona_id, id_principal, kode_model, dll)
- Script akan lookup ke database untuk mendapatkan **UUID IDs**
- Contoh: `zona_id = "DP"` → lookup `zones.id` WHERE `zones.code = "DP"`

### 2. Array Fields
- CSV format: `"{value1,value2}"` atau `"value1,value2"`
- DB format: PostgreSQL array `TEXT[]`
- Script akan parse dan convert otomatis

### 3. JSONB Fields
- Field `spec_technical` dari CSV (JSON string) → JSONB di database
- Script akan parse JSON string

### 4. Bucket → Product IDs
- Bundle promo menggunakan `bucket_id` di CSV
- Script akan lookup `bucket_members` untuk mendapatkan `product_ids UUID[]`
- Transform: `bucket_id = "WFR-E01K"` → lookup → `product_ids = [uuid1, uuid2, ...]`

---

## ✅ Verify Import

Setelah import selesai, verifikasi di Supabase Dashboard:

### 1. Table Editor

Check setiap tabel sudah ada data:
- zones (harusnya ada beberapa zona)
- products (harusnya ada beberapa produk)
- prices (harusnya ada beberapa harga)
- dll.

### 2. SQL Editor

Run query untuk verify:

```sql
-- Count records
SELECT COUNT(*) FROM zones;
SELECT COUNT(*) FROM products;
SELECT COUNT(*) FROM prices;
SELECT COUNT(*) FROM product_groups;
SELECT COUNT(*) FROM principal_discounts;
SELECT COUNT(*) FROM bundle_promo;

-- Check sample data
SELECT * FROM zones LIMIT 5;
SELECT * FROM products LIMIT 5;
SELECT * FROM prices LIMIT 5;
```

---

## ❓ Troubleshooting

### Error: "Failed to lookup..."

**Problem:** Code reference tidak ditemukan di database

**Solution:**
- Pastikan master data sudah di-import terlebih dahulu
- Check apakah code di CSV sudah benar
- Verify data sudah ada di tabel terkait

**Example:**
```
Error: Failed to lookup products.code = 300096
```
→ Check apakah product dengan code "300096" sudah ada di tabel `products`

### Error: "duplicate key value violates unique constraint"

**Problem:** Data sudah ada di database

**Solution:**
- Script menggunakan upsert, tapi jika masih error:
  - Truncate tabel dulu (via SQL Editor)
  - Atau skip error dengan modify script

### Error: "relation does not exist"

**Problem:** Tabel belum dibuat di database

**Solution:**
1. Pastikan sudah run `SCHEMA-CSV-FINAL.sql` di Supabase SQL Editor
2. Verify semua tabel sudah dibuat (check Table Editor)

### Error: "Cannot find module '@supabase/supabase-js'"

**Problem:** Dependencies belum di-install

**Solution:**
```bash
cd scripts
npm install
```

### Error: "ENOENT: no such file or directory"

**Problem:** CSV file tidak ditemukan

**Solution:**
- Pastikan folder `tabel usulan` ada di root project
- Pastikan semua CSV files ada di folder tersebut
- Check file path di script (line 29: `CSV_DIR`)

### Import Berhasil tapi Data Tidak Muncul

**Possible Causes:**
1. Wrong database connection (credentials salah)
2. Data di-insert ke project lain
3. Permission issue (tapi anon key biasanya cukup untuk insert)

**Solution:**
- Verify credentials di script
- Check Supabase Dashboard → Table Editor → pilih project yang benar
- Check console output saat import (harusnya ada log berapa banyak record di-import)

---

## 🔄 Re-import Data

Jika perlu re-import:

### Option 1: Truncate Tables Dulu (Fresh Start)

```sql
-- Run di SQL Editor (HATI-HATI! Hapus semua data)
TRUNCATE TABLE promo_availability CASCADE;
TRUNCATE TABLE free_product_promo CASCADE;
TRUNCATE TABLE invoice_discounts CASCADE;
TRUNCATE TABLE bundle_promo_group_items CASCADE;
TRUNCATE TABLE bundle_promo_groups CASCADE;
TRUNCATE TABLE bundle_promo CASCADE;
TRUNCATE TABLE group_promo_tiers CASCADE;
TRUNCATE TABLE group_promo CASCADE;
TRUNCATE TABLE principal_discount_tiers CASCADE;
TRUNCATE TABLE principal_discounts CASCADE;
TRUNCATE TABLE store_loyalty_classes CASCADE;
TRUNCATE TABLE product_group_availability CASCADE;
TRUNCATE TABLE bucket_members CASCADE;
TRUNCATE TABLE product_group_members CASCADE;
TRUNCATE TABLE product_groups CASCADE;
TRUNCATE TABLE prices CASCADE;
TRUNCATE TABLE products CASCADE;
TRUNCATE TABLE principals CASCADE;
TRUNCATE TABLE zones CASCADE;
```

### Option 2: Use Upsert (Recommended)

Script sudah menggunakan upsert untuk beberapa tabel, jadi bisa langsung run lagi (akan update jika data sudah ada).

---

## 📚 Related Files

- `scripts/import-csv.js` - Main import script
- `scripts/package.json` - Dependencies
- `tabel usulan/MAPPING-CSV-TO-DB.md` - Mapping documentation
- `tabel usulan/SCHEMA-CSV-FINAL.sql` - Database schema
- `SETUP-SUPABASE-GUIDE.md` - Setup guide

---

## ✅ Checklist Import

- [ ] Supabase project sudah dibuat
- [ ] Schema SQL sudah di-run
- [ ] Dependencies sudah di-install (`npm install`)
- [ ] Credentials sudah di-set
- [ ] CSV files sudah ada di `tabel usulan/`
- [ ] Import script sudah di-run
- [ ] Data sudah di-verify di Supabase Dashboard

---

**Selamat! Data sudah ter-import!** 🎉

