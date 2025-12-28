# Bundle Promo - CSV dan SQL Tabel Requirements

## 📋 Ringkasan

Bundle Promo (Promo Paket) membutuhkan:
- **1 CSV file** untuk data promo bundle
- **3 SQL tables** untuk menyimpan data
- **1 dependency table** (bucket_members) yang harus sudah diisi
- **1 table** untuk availability rules (promo_availability)

---

## 📁 CSV Files

### 1. `discon_paket_rule.csv` ✅

**Lokasi:** `tabel usulan/discon_paket_rule.csv`

**Format BARU (Preferred - Unlimited Buckets):**
```csv
promo_id,description,bucket_id,qty_bucket,unit_bucket,kelipatan,potongan
PAKET-A,1 KARTON WAFER 1K + 1 KARTON SIIP 1K,WFR-E01K,1,unit_1,100,3000
PAKET-A,1 KARTON WAFER 1K + 1 KARTON SIIP 1K,SIP-E01K,1,unit_1,100,3000
```

**Format LAMA (Backward Compatible - Max 3 Buckets):**
```csv
promo_id,description,buket_1,qty_buket_1,sat_buket_1,buket_2,qty_buket_2,sat_buket_2,buket_3,qty_buket_3,sat_buket_3,kelipatan,potongan
```

**Kolom:**
- `promo_id` → ID promo (unique)
- `description` → Deskripsi promo
- `bucket_id` / `buket_1/2/3` → Bucket ID (untuk lookup product_ids)
- `qty_bucket` / `qty_buket_1/2/3` → Quantity yang harus dicapai
- `unit_bucket` / `sat_buket_1/2/3` → Unit (unit_1, unit_2, unit_3)
- `kelipatan` → Max packages (optional)
- `potongan` → Discount per package

---

### 2. `master_bucket_member.csv` (Dependency) ✅

**Lokasi:** `tabel usulan/master_bucket_member.csv`

**Digunakan oleh:** `bucket_members` table (Step 7)

**Keterangan:** CSV ini HARUS sudah diimport terlebih dahulu (Step 7) sebelum import bundle promo (Step 13), karena bundle promo melakukan lookup `product_ids` dari `bucket_id`.

**Format:**
```csv
product_id,bucket_id
300097,WFR-E01K
300098,WFR-E01K
```

---

### 3. `promo_availability.csv` (Optional - untuk area rules) ✅

**Lokasi:** `tabel usulan/promo_availability.csv`

**Keterangan:** Untuk mengatur aturan area (zona, region, depo) dan periode promo (start_date, end_date).

**Contoh:**
```csv
promo_id,description,type,store_type,rule_type,level,zone_code,region_code,depo_code,start_date,end_date
PAKET-A,Bundle Promo A,bundling,all,allow,all,all,all,all,2024-01-01,2024-12-31
```

---

## 🗄️ SQL Tables

### 1. `bundle_promo` (Header)

**Source CSV:** `discon_paket_rule.csv`

**Kolom:**
- `id` (UUID, PK) - Auto-generated
- `promo_id` (TEXT, UNIQUE) - Dari CSV
- `description` (TEXT) - Dari CSV
- `discount_per_package` (DECIMAL) - Dari CSV `potongan`
- `max_packages` (INTEGER, nullable) - Dari CSV `kelipatan`
- `created_at` (TIMESTAMPTZ) - Auto-generated

**Mapping:**
```
CSV Column     →  DB Column
────────────────────────────
promo_id       →  promo_id
description    →  description
potongan       →  discount_per_package
kelipatan      →  max_packages
```

---

### 2. `bundle_promo_groups` (Groups)

**Source CSV:** `discon_paket_rule.csv`

**Keterangan:** Setiap bucket dalam promo menjadi 1 row. `group_number` auto-increment (1, 2, 3, ...).

**Kolom:**
- `id` (UUID, PK) - Auto-generated
- `promo_id` (TEXT) - Reference ke `bundle_promo.promo_id`
- `group_number` (INTEGER) - Auto-increment berdasarkan urutan bucket
- `total_quantity` (INTEGER) - Dari CSV `qty_bucket`
- `unit` (TEXT) - Dari CSV `unit_bucket` (unit_1, unit_2, unit_3)
- `created_at` (TIMESTAMPTZ) - Auto-generated

**Unique Constraint:** `(promo_id, group_number)`

**Mapping:**
```
CSV Column           →  DB Column
─────────────────────────────────
promo_id             →  promo_id
qty_bucket           →  total_quantity
unit_bucket          →  unit
(row order)          →  group_number (1, 2, 3, ...)
```

---

### 3. `bundle_promo_group_items` (Items)

**Source CSV:** `discon_paket_rule.csv` + **LOOKUP** dari `bucket_members`

**Keterangan:** Untuk setiap group, lookup `product_ids` dari `bucket_members` berdasarkan `bucket_id`.

**Kolom:**
- `id` (UUID, PK) - Auto-generated
- `bundle_promo_group_id` (UUID, FK) - Reference ke `bundle_promo_groups.id`
- `product_ids` (TEXT[]) - Array product codes dari lookup `bucket_members`
- `created_at` (TIMESTAMPTZ) - Auto-generated

**Mapping:**
```
CSV Column           →  DB Column              →  Transform
──────────────────────────────────────────────────────────────────
bucket_id            →  product_ids            →  LOOKUP bucket_members
                                                  (bucket_id → [product_ids])
```

**Logic:**
1. Ambil `bucket_id` dari CSV
2. Lookup `bucket_members` table: `SELECT product_id WHERE bucket_id = ?`
3. Simpan semua `product_id` sebagai array `TEXT[]` di `product_ids`

---

### 4. `bucket_members` (Dependency Table) ✅

**Source CSV:** `master_bucket_member.csv` (Step 7)

**Keterangan:** **HARUS sudah diimport** sebelum bundle promo (Step 13).

**Kolom:**
- `id` (UUID, PK)
- `product_id` (TEXT) - Reference ke `master_products.code`
- `bucket_id` (TEXT) - Bucket identifier
- `created_at` (TIMESTAMPTZ)

**Unique Constraint:** `(product_id, bucket_id)`

---

### 5. `promo_availability` (Availability Rules) ✅

**Source CSV:** `promo_availability.csv` (Step 11)

**Keterangan:** Untuk mengatur aturan area dan periode promo.

**Kolom:**
- `id` (UUID, PK)
- `promo_id` (TEXT) - Reference ke `bundle_promo.promo_id`
- `promo_type` (TEXT) - **Harus:** `'bundling'`
- `store_type` (TEXT) - retail, grosir, all
- `rule_type` (TEXT) - allow, deny, all
- `level` (TEXT) - zona, region, depo, all
- `zone_codes` (TEXT[]) - Array zone codes
- `region_codes` (TEXT[]) - Array region codes
- `depo_codes` (TEXT[]) - Array depo codes
- `start_date` (DATE, nullable) - Tanggal mulai promo
- `end_date` (DATE, nullable) - Tanggal akhir promo

---

## 📊 Import Order (Dependencies)

**Urutan import yang BENAR:**

1. ✅ **Step 7:** `master_bucket_member.csv` → `bucket_members` (HARUS DULUAN!)
2. ✅ **Step 11:** `promo_availability.csv` → `promo_availability` (optional, tapi disarankan)
3. ✅ **Step 13:** `discon_paket_rule.csv` → `bundle_promo`, `bundle_promo_groups`, `bundle_promo_group_items`

---

## 🔄 Data Flow

```
discon_paket_rule.csv
  │
  ├─→ bundle_promo (header: promo_id, description, potongan, kelipatan)
  │
  ├─→ bundle_promo_groups (groups: promo_id, group_number, qty, unit)
  │     │
  │     └─→ bundle_promo_group_items (items: group_id, product_ids[])
  │            │
  │            └─→ LOOKUP: bucket_members (bucket_id → product_ids)
  │
  └─→ promo_availability (rules: promo_id, type='bundling', area rules, dates)
```

---

## ✅ Checklist

Sebelum import bundle promo, pastikan:

- [ ] ✅ File `discon_paket_rule.csv` ada dan valid
- [ ] ✅ File `master_bucket_member.csv` sudah diimport (Step 7)
- [ ] ✅ Table `bucket_members` sudah berisi data
- [ ] ✅ Table `bundle_promo` sudah dibuat di SQL schema
- [ ] ✅ Table `bundle_promo_groups` sudah dibuat di SQL schema
- [ ] ✅ Table `bundle_promo_group_items` sudah dibuat di SQL schema
- [ ] ✅ File `promo_availability.csv` sudah diisi untuk bundle promo (Step 11, optional)

---

## 🎯 Contoh Data Flow

**Input CSV (`discon_paket_rule.csv`):**
```csv
promo_id,description,bucket_id,qty_bucket,unit_bucket,kelipatan,potongan
PAKET-A,Wafer + Siip,WFR-E01K,1,unit_1,100,3000
PAKET-A,Wafer + Siip,SIP-E01K,1,unit_1,100,3000
```

**Data di `bucket_members` (sudah diimport dari Step 7):**
```
bucket_id   | product_id
────────────┼───────────
WFR-E01K    | 300097
WFR-E01K    | 300098
SIP-E01K    | 400001
SIP-E01K    | 400002
```

**Output di SQL:**

**Table `bundle_promo`:**
```
promo_id | description       | discount_per_package | max_packages
─────────┼───────────────────┼──────────────────────┼─────────────
PAKET-A  | Wafer + Siip      | 3000                 | 100
```

**Table `bundle_promo_groups`:**
```
id  | promo_id | group_number | total_quantity | unit
────┼──────────┼──────────────┼────────────────┼────────
xxx | PAKET-A  | 1            | 1              | unit_1
yyy | PAKET-A  | 2            | 1              | unit_1
```

**Table `bundle_promo_group_items`:**
```
id  | bundle_promo_group_id | product_ids
────┼───────────────────────┼───────────────────────
aaa | xxx                  | {300097, 300098}
bbb | yyy                  | {400001, 400002}
```

---

## 📝 Notes

1. **Bucket ID:** `bucket_id` di bundle promo BISA berbeda dengan `product_group_id`, meskipun namanya sama. Mereka adalah entity yang berbeda.

2. **Format Baru vs Lama:**
   - **Format Baru:** Multiple rows per `promo_id`, unlimited buckets
   - **Format Lama:** 1 row per `promo_id`, max 3 buckets (backward compatible)

3. **Auto-detection:** Script otomatis detect format berdasarkan ada tidaknya kolom `bucket_id`.

4. **Group Number:** Auto-increment berdasarkan urutan bucket dalam CSV (1, 2, 3, ...).

