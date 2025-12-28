# 🚀 Cara Run Import CSV

## Prerequisites

1. **Node.js** harus sudah terinstall (v18+ recommended)
   - Download: https://nodejs.org/
   - Verify: `node --version` dan `npm --version`

2. **Supabase Database** sudah di-setup
   - Schema SQL sudah di-run
   - Credentials sudah di-set di `env.js`

---

## 📋 Langkah-Langkah

### 1. Install Dependencies

Buka terminal/PowerShell di folder `scripts`:

```bash
cd scripts
npm install
```

Ini akan install:
- `@supabase/supabase-js` - Supabase client
- `csv-parse` - CSV parser

### 2. Run Import Script

```bash
npm run import
```

Atau:

```bash
node import-csv.js
```

---

## ✅ Expected Output

Script akan menampilkan progress untuk setiap tabel:

```
🚀 Starting CSV import to Supabase...

📦 Importing zones...
✅ Imported 6 zones
📦 Importing principals...
✅ Imported 6 principals
📦 Importing products...
✅ Imported 155 products
... (dan seterusnya)

✅ All imports completed successfully!
```

---

## ❓ Troubleshooting

### Error: "npm is not recognized"

**Problem:** Node.js/npm belum terinstall atau tidak ada di PATH

**Solution:**
1. Install Node.js dari https://nodejs.org/
2. Restart terminal/PowerShell
3. Verify: `node --version` dan `npm --version`

### Error: "Cannot find module '@supabase/supabase-js'"

**Problem:** Dependencies belum di-install

**Solution:**
```bash
cd scripts
npm install
```

### Error: "Failed to lookup..."

**Problem:** Master data belum di-import atau code reference tidak ditemukan

**Solution:**
- Pastikan import berjalan sesuai urutan (script sudah handle ini)
- Check apakah CSV files lengkap dan benar

### Error: "relation does not exist"

**Problem:** Schema SQL belum di-run di Supabase

**Solution:**
1. Buka Supabase Dashboard → SQL Editor
2. Run file `tabel usulan/SCHEMA-CSV-FINAL.sql`
3. Verify semua 19 tabel sudah dibuat

### Error: "permission denied" atau "unauthorized"

**Problem:** Credentials salah atau RLS policy blocking

**Solution:**
- Check credentials di `env.js` atau di script
- Pastikan anon key benar
- Check RLS policies di Supabase (untuk development, bisa disable dulu)

---

## 📊 Import Order

Script akan import secara otomatis dalam urutan yang benar:

1. zones
2. principals
3. products
4. prices
5. product_groups
6. product_group_members
7. bucket_members
8. product_group_availability
9. store_loyalty_classes
10. principal_discounts
11. principal_discount_tiers
12. group_promo + group_promo_tiers
13. bundle_promo + bundle_promo_groups + bundle_promo_group_items
14. invoice_discounts
15. free_product_promo
16. promo_availability

---

## ✅ Verify Import

Setelah import selesai, verify di Supabase Dashboard:

1. **Table Editor** → Check setiap tabel sudah ada data
2. **SQL Editor** → Run query:
   ```sql
   SELECT COUNT(*) FROM zones;
   SELECT COUNT(*) FROM products;
   SELECT COUNT(*) FROM prices;
   -- etc.
   ```

---

**Selamat! Data sudah ter-import!** 🎉

