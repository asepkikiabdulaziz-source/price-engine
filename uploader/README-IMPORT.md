# CSV Import Script

Script untuk import data CSV ke Supabase database.

## 📋 Prerequisites

1. **Node.js** installed (v18+ recommended)
2. **Supabase project** sudah setup
3. **Database schema** sudah di-run (`SCHEMA-CSV-FINAL.sql`)
4. **Credentials** sudah di-set di `env.js` (atau set sebagai environment variables)

## 🚀 Setup

### 1. Install Dependencies

```bash
cd scripts
npm install
```

### 2. Configure Credentials

**Option A: Update script directly** (for quick test)
- Edit `scripts/import-csv.js`
- Update `SUPABASE_URL` dan `SUPABASE_ANON_KEY` di bagian CONFIGURATION

**Option B: Use environment variables** (recommended)
```bash
export SUPABASE_URL="https://xxxxx.supabase.co"
export SUPABASE_ANON_KEY="eyJhbGc..."
```

**Option C: Load from env.js** (untuk consistency dengan app)
- Script sudah include credentials dari env.js (pastikan file sudah diisi)

## ▶️ Run Import

```bash
cd scripts
npm run import
```

Atau:

```bash
node import-csv.js
```

## 📊 Import Order

Script akan import data sesuai urutan dependency:

1. ✅ zones
2. ✅ principals
3. ✅ products
4. ✅ prices
5. ✅ product_groups
6. ✅ product_group_members
7. ✅ bucket_members
8. ✅ product_group_availability
9. ✅ store_loyalty_classes
10. ✅ principal_discounts
11. ✅ principal_discount_tiers
12. ✅ group_promo + group_promo_tiers
13. ✅ bundle_promo + bundle_promo_groups + bundle_promo_group_items
14. ✅ invoice_discounts
15. ✅ free_product_promo
16. ✅ promo_availability

## ⚠️ Important Notes

### Data Transformation

1. **Code to ID Lookup**: CSV menggunakan codes, script akan lookup ke database untuk mendapatkan UUID IDs
2. **Array Fields**: Format CSV `"{value1,value2}"` akan di-parse menjadi PostgreSQL array
3. **JSONB Fields**: Field `spec_technical` dari CSV (JSON string) akan di-parse menjadi JSONB
4. **Bucket to Product IDs**: Bundle promo menggunakan bucket_id, script akan lookup `bucket_members` untuk mendapatkan `product_ids UUID[]`

### Upsert vs Insert

- **Upsert** digunakan untuk tabel dengan unique constraint (codes, promo_id, dll)
- **Insert** digunakan untuk tabel tanpa unique constraint atau dengan composite keys

### Error Handling

- Script akan stop jika ada error
- Check console output untuk detail error
- Pastikan semua master data sudah di-import sebelum import promo data

## 🔍 Verify Import

Setelah import selesai, verifikasi di Supabase Dashboard:

1. **Table Editor** → Check setiap tabel sudah ada data
2. **SQL Editor** → Run query untuk verify:
   ```sql
   SELECT COUNT(*) FROM zones;
   SELECT COUNT(*) FROM products;
   SELECT COUNT(*) FROM prices;
   -- etc.
   ```

## ❓ Troubleshooting

### Error: "Failed to lookup..."
- **Problem**: Code reference tidak ditemukan di database
- **Solution**: Pastikan master data sudah di-import terlebih dahulu (zones, principals, products, dll)

### Error: "duplicate key value violates unique constraint"
- **Problem**: Data sudah ada di database
- **Solution**: Script menggunakan upsert, tapi jika masih error, bisa truncate tabel dulu atau skip error

### Error: "relation does not exist"
- **Problem**: Tabel belum dibuat di database
- **Solution**: Pastikan sudah run `SCHEMA-CSV-FINAL.sql` di Supabase

### Error: "Cannot find module '@supabase/supabase-js'"
- **Problem**: Dependencies belum di-install
- **Solution**: Run `npm install` di folder `scripts`

### Error: "ENOENT: no such file or directory"
- **Problem**: CSV file tidak ditemukan
- **Solution**: Pastikan folder `tabel usulan` ada dan semua CSV file ada

## 📝 Manual Import Alternative

Jika script tidak bekerja, Anda bisa import manual via Supabase Dashboard:

1. **Table Editor** → Pilih tabel
2. **Insert** → **Import CSV**
3. Upload file CSV
4. Map columns (perlu transform codes → IDs manual)
5. Import

**Note**: Manual import lebih kompleks karena perlu transform codes → IDs dan array fields.

