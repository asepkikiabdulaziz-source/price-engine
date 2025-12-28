# 📊 Ringkasan Mapping CSV ke Tabel Database

## Quick Reference

| Step | CSV File | Target Table(s) | Key Transformations |
|------|----------|-----------------|---------------------|
| 1 | `master_zona.csv` | `zones` | Direct mapping |
| 2 | `master_pincipal.csv` | `principals` | Direct mapping |
| 3 | `master_product.csv` | `products` | `id_principal` → lookup UUID<br/>`spek_teknis` → parse JSON |
| 4 | `master_harga.csv` | `prices` | `product_id` → lookup UUID ⚠️ (sebenarnya code)<br/>`zone_id` → lookup UUID |
| 5 | `master_group.csv` | `product_groups` | Direct mapping |
| 6 | `master_group_member.csv` | `product_group_members` | `product_code` → lookup UUID<br/>`group_code` → lookup UUID |
| 7 | `master_bucket_member.csv` | `bucket_members` | `product_code` → lookup UUID |
| 8 | `master_group_availability.csv` | `product_group_availability` | Array columns → parse array |
| 9 | `master_loyalty_class.csv` | `store_loyalty_classes` | Direct mapping |
| 10 | `discon_principal_header.csv` | `principal_discounts` | `principal` → parse array |
| 11 | `discon_principal_rule.csv` | `principal_discount_tiers` | `principal` → parse array |
| 12 | `discon_strata_rule.csv` | `group_promo`<br/>`group_promo_tiers` | 2 tables dari 1 CSV<br/>`varian` → boolean |
| 13 | `discon_paket_rule.csv` | `bundle_promo`<br/>`bundle_promo_groups`<br/>`bundle_promo_group_items` | 3 tables dari 1 CSV<br/>`buket_*` → lookup bucket_members → product_ids[] |
| 14 | `discon_invoice.csv` | `invoice_discounts` | Direct mapping |
| 15 | `promo_gratis_produk.csv` | `free_product_promo` | `product_code` → lookup UUID<br/>`principal_ids` → parse array |
| 16 | `promo_availability.csv` | `promo_availability` | Array columns → parse array |

---

## 📋 Detail Mapping per Tabel

### 1. zones
**File:** `master_zona.csv`
```
zona_id → code (TEXT)
zona_name → name (TEXT)
```

### 2. principals
**File:** `master_pincipal.csv`
```
id_principal → code (TEXT)
nama_principal → name (TEXT)
```

### 3. products
**File:** `master_product.csv`
```
kode_model → code (TEXT)
nama_produk → name (TEXT)
id_principal → principal_id (UUID) ⚡ LOOKUP
id_kategori → category (TEXT, nullable)
uom_kecil → unit_1 (TEXT, nullable)
uom_sedang → unit_2 (TEXT, nullable)
uom_besar → unit_3 (TEXT, nullable)
rasio_sedang → ratio_unit_2_per_unit_1 (DECIMAL, nullable)
rasio_besar → ratio_unit_3_per_unit_2 (DECIMAL, nullable)
ketersediaan_default → availability_default (TEXT, nullable)
spek_teknis → spec_technical (JSONB) ⚡ PARSE JSON
```

### 4. prices
**File:** `master_harga.csv`
```
product_id → product_id (UUID) ⚡ LOOKUP (code → id)
zone_id → zone_id (UUID) ⚡ LOOKUP (code → id)
base_price → base_price (DECIMAL)
```

### 5. product_groups
**File:** `master_group.csv`
```
code → code (TEXT)
name → name (TEXT)
priority → priority (INTEGER, default: 0)
```

### 6. product_group_members
**File:** `master_group_member.csv`
```
product_code → product_id (UUID) ⚡ LOOKUP
group_code → product_group_id (UUID) ⚡ LOOKUP
priority → priority (INTEGER, default: 0)
```

### 7. bucket_members
**File:** `master_bucket_member.csv`
```
product_code → product_id (UUID) ⚡ LOOKUP
bucket_id → bucket_id (TEXT)
```

### 8. product_group_availability
**File:** `master_group_availability.csv`
```
product_group_code → product_group_code (TEXT)
rule_type → rule_type (TEXT)
level → level (TEXT)
zone_codes → zone_codes (TEXT[]) ⚡ PARSE ARRAY
region_codes → region_codes (TEXT[]) ⚡ PARSE ARRAY
depo_codes → depo_codes (TEXT[]) ⚡ PARSE ARRAY
```

### 9. store_loyalty_classes
**File:** `master_loyalty_class.csv`
```
class_code → code (TEXT)
class_name → name (TEXT)
target_monthly → target_monthly (DECIMAL)
cashback_percentage → cashback_percentage (DECIMAL)
```

### 10. principal_discounts
**File:** `discon_principal_header.csv`
```
promo_id → promo_id (TEXT)
description → description (TEXT)
principal → principal_codes (TEXT[]) ⚡ PARSE ARRAY
```

### 11. principal_discount_tiers
**File:** `discon_principal_rule.csv`
```
promo_id → promo_id (TEXT)
description → description (TEXT, nullable)
principal → principal_codes (TEXT[]) ⚡ PARSE ARRAY
trigger → min_purchase_amount (DECIMAL)
disc → discount_percentage (DECIMAL)
priority → priority (INTEGER, default: 0)
```

### 12. group_promo + group_promo_tiers
**File:** `discon_strata_rule.csv`

**Table: group_promo** (unique by promo_id)
```
promo_id → promo_id (TEXT)
description → description (TEXT)
group → product_group_code (TEXT)
tier_mode → tier_mode (TEXT, default: 'mix')
tier_unit → tier_unit (TEXT, default: 'unit_3')
varian → consider_variant (BOOLEAN) ⚡ CONVERT
```

**Table: group_promo_tiers** (multiple rows per promo_id)
```
promo_id → promo_id (TEXT)
description → description (TEXT, nullable)
qty_min → min_qty (DECIMAL)
potongan → discount_per_unit (DECIMAL)
varian → variant_count (INTEGER, nullable)
priority → priority (INTEGER, default: 0)
```

### 13. bundle_promo + bundle_promo_groups + bundle_promo_group_items
**File:** `discon_paket_rule.csv`

**Table: bundle_promo**
```
promo_id → promo_id (TEXT)
description → description (TEXT)
potongan → discount_per_package (DECIMAL)
kelipatan → max_packages (INTEGER, nullable)
```

**Table: bundle_promo_groups**
```
promo_id → promo_id (TEXT)
buket_1/2/3 → group_number (INTEGER) ⚡ 1, 2, atau 3
qty_buket_1/2/3 → total_quantity (INTEGER)
sat_buket_1/2/3 → unit (TEXT, default: 'unit_1')
```

**Table: bundle_promo_group_items**
```
buket_1/2/3 (bucket_id) → product_ids (UUID[]) ⚡ LOOKUP bucket_members
```

### 14. invoice_discounts
**File:** `discon_invoice.csv`
```
promo_id → promo_id (TEXT)
description → description (TEXT)
min_belanja → min_purchase_amount (DECIMAL)
payment_method → payment_method (TEXT)
disc → discount_percentage (DECIMAL)
```

### 15. free_product_promo
**File:** `promo_gratis_produk.csv`
```
promo_id → promo_id (TEXT)
description → description (TEXT)
trigger_type → trigger_type (TEXT)
min_purchase_amount → min_purchase_amount (DECIMAL, nullable if trigger_type='qty')
min_quantity → min_quantity (INTEGER, nullable if trigger_type='nominal')
purchase_scope → purchase_scope (TEXT)
principal_ids → principal_codes (TEXT[], nullable) ⚡ PARSE ARRAY
required_product_code → required_product_id (UUID) ⚡ LOOKUP
free_product_code → free_product_id (UUID) ⚡ LOOKUP
free_quantity → free_quantity (INTEGER)
```

### 16. promo_availability
**File:** `promo_availability.csv`
```
promo_id → promo_id (TEXT)
description → description (TEXT, nullable)
promo_type → promo_type (TEXT)
store_type → store_type (TEXT)
rule_type → rule_type (TEXT)
level → level (TEXT)
zone_codes → zone_codes (TEXT[]) ⚡ PARSE ARRAY
region_codes → region_codes (TEXT[]) ⚡ PARSE ARRAY
depo_codes → depo_codes (TEXT[]) ⚡ PARSE ARRAY
```

---

## ⚡ Simbol Transformasi

- ⚡ **LOOKUP**: Code → UUID (lookup ke tabel master)
- ⚡ **PARSE ARRAY**: String array → PostgreSQL TEXT[]
- ⚡ **PARSE JSON**: JSON string → JSONB
- ⚡ **CONVERT**: Convert tipe data (boolean, number, dll)

---

## 📝 Catatan Penting

1. **Code vs ID**: Banyak CSV menggunakan **code** (TEXT), tapi database menggunakan **UUID**. Script akan lookup code → UUID.

2. **Array Format**: Array di CSV format: `{value1,value2}` atau `value1,value2`

3. **JSON Format**: JSON di CSV harus valid JSON string: `'{"key":"value"}'`

4. **Nullable Fields**: Fields yang nullable akan menjadi `null` jika kosong di CSV.

5. **Default Values**: Beberapa fields punya default value (contoh: `priority = 0`).

6. **Multiple Tables**: Beberapa CSV menghasilkan multiple tables:
   - `discon_strata_rule.csv` → `group_promo` + `group_promo_tiers`
   - `discon_paket_rule.csv` → `bundle_promo` + `bundle_promo_groups` + `bundle_promo_group_items`

Untuk detail lengkap, lihat: `MAPPING-CSV-TO-TABLE.md`

