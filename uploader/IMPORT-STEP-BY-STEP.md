# 📥 Import CSV - Step by Step

Script import sekarang bisa dijalankan **satu per satu** untuk memudahkan debugging dan melihat progress.

## 📋 Cara Menggunakan

### 1. Lihat Daftar Steps

```bash
node import-csv.js
```

Akan menampilkan daftar semua step yang tersedia.

---

### 2. Import Satu Step

```bash
node import-csv.js <step_number>
```

**Contoh:**
```bash
# Import zones (step 1)
node import-csv.js 1

# Import principals (step 2)
node import-csv.js 2

# Import products (step 3)
node import-csv.js 3
```

---

### 3. Import Semua Steps

```bash
node import-csv.js all
```

---

## 📊 Daftar Steps (Urutan Import)

| Step | Name | CSV File | Dependencies |
|------|------|----------|--------------|
| 1 | zones | master_zona.csv | - |
| 2 | principals | master_pincipal.csv | - |
| 3 | products | master_product.csv | principals |
| 4 | prices | master_harga.csv | products, zones |
| 5 | product_groups | master_group.csv | - |
| 6 | product_group_members | master_group_member.csv | products, product_groups |
| 7 | bucket_members | master_bucket_member.csv | products |
| 8 | product_group_availability | master_group_availability.csv | product_groups |
| 9 | store_loyalty_classes | master_loyalty_class.csv | - |
| 10 | principal_discounts | discon_principal_header.csv | - |
| 11 | principal_discount_tiers | discon_principal_rule.csv | principal_discounts |
| 12 | group_promo | discon_strata_rule.csv | - |
| 13 | bundle_promo | discon_paket_rule.csv | bucket_members |
| 14 | invoice_discounts | discon_invoice.csv | - |
| 15 | free_product_promo | promo_gratis_produk.csv | products |
| 16 | promo_availability | promo_availability.csv | all promo tables |

---

## ✅ Recommended Import Order

Import step demi step sesuai urutan:

```bash
# Step 1: Master data geografis
node import-csv.js 1    # zones

# Step 2: Master data produk
node import-csv.js 2    # principals
node import-csv.js 3    # products
node import-csv.js 4    # prices

# Step 3: Master data grup
node import-csv.js 5    # product_groups
node import-csv.js 6    # product_group_members
node import-csv.js 7    # bucket_members
node import-csv.js 8    # product_group_availability

# Step 4: Master data lainnya
node import-csv.js 9    # store_loyalty_classes

# Step 5: Promo & diskon
node import-csv.js 10   # principal_discounts
node import-csv.js 11   # principal_discount_tiers
node import-csv.js 12   # group_promo
node import-csv.js 13   # bundle_promo
node import-csv.js 14   # invoice_discounts
node import-csv.js 15   # free_product_promo
node import-csv.js 16   # promo_availability
```

---

## 💡 Tips

1. **Import sesuai urutan** - Pastikan dependencies sudah di-import terlebih dahulu
2. **Check error messages** - Jika ada error, baca pesan error dengan teliti
3. **Verify di Supabase** - Setelah setiap step, check di Supabase Dashboard apakah data sudah masuk
4. **Skip jika sudah ada** - Script menggunakan upsert, jadi bisa di-run ulang tanpa duplikasi (untuk beberapa tabel)

---

## ❓ Troubleshooting

### Error: "Failed to lookup..."
- Pastikan step dependency sudah di-import (contoh: products harus di-import sebelum prices)

### Error: "relation does not exist"
- Pastikan schema SQL sudah di-run di Supabase

### Error: "duplicate key"
- Beberapa tabel menggunakan upsert, tapi jika masih error, bisa truncate tabel dulu

---

**Selamat mengimport!** 🎉

