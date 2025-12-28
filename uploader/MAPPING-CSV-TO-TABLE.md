# 📊 Mapping CSV ke Tabel Database

Dokumentasi lengkap untuk setiap fungsi import: **File CSV Sumber → Tabel Database Target → Mapping Kolom**

---

## 📁 Lokasi File CSV

Semua file CSV berada di folder: `tabel usulan/`

---

## 1️⃣ **importZones()**

### 📄 File Sumber
- **CSV:** `master_zona.csv`

### 🗄️ Tabel Target
- **Table:** `zones`

### 📋 Mapping Kolom

| CSV Column | Database Column | Tipe Data | Transformasi |
|------------|----------------|-----------|--------------|
| `zona_id` | `code` | TEXT | Langsung mapping |
| `zona_name` | `name` | TEXT | Langsung mapping |

### 📝 Contoh Data
```csv
zona_id,zona_name
Z001,Zone Jakarta
Z002,Zone Surabaya
```

```sql
INSERT INTO zones (code, name) VALUES 
  ('Z001', 'Zone Jakarta'),
  ('Z002', 'Zone Surabaya');
```

---

## 2️⃣ **importPrincipals()**

### 📄 File Sumber
- **CSV:** `master_pincipal.csv`

### 🗄️ Tabel Target
- **Table:** `principals`

### 📋 Mapping Kolom

| CSV Column | Database Column | Tipe Data | Transformasi |
|------------|----------------|-----------|--------------|
| `id_principal` | `code` | TEXT | Langsung mapping |
| `nama_principal` | `name` | TEXT | Langsung mapping |

---

## 3️⃣ **importProducts()**

### 📄 File Sumber
- **CSV:** `master_product.csv`

### 🗄️ Tabel Target
- **Table:** `products`

### 📋 Mapping Kolom

| CSV Column | Database Column | Tipe Data | Transformasi |
|------------|----------------|-----------|--------------|
| `kode_model` | `code` | TEXT | Langsung mapping |
| `nama_produk` | `name` | TEXT | Langsung mapping |
| `id_principal` | `principal_id` | UUID | **Lookup** ke `principals.code` → `principals.id` |
| `id_kategori` | `category` | TEXT | Langsung mapping (nullable) |
| `uom_kecil` | `unit_1` | TEXT | Langsung mapping (nullable) |
| `uom_sedang` | `unit_2` | TEXT | Langsung mapping (nullable) |
| `uom_besar` | `unit_3` | TEXT | Langsung mapping (nullable) |
| `rasio_sedang` | `ratio_unit_2_per_unit_1` | DECIMAL | `toNumber()` |
| `rasio_besar` | `ratio_unit_3_per_unit_2` | DECIMAL | `toNumber()` |
| `ketersediaan_default` | `availability_default` | TEXT | Langsung mapping (nullable) |
| `spek_teknis` | `spec_technical` | JSONB | `parseJSON()` - Parse JSON string |

### ⚠️ Catatan
- `id_principal` di CSV adalah **code**, perlu di-lookup ke `principals.id` (UUID)
- `spek_teknis` harus dalam format JSON string di CSV

---

## 4️⃣ **importPrices()**

### 📄 File Sumber
- **CSV:** `master_harga.csv`

### 🗄️ Tabel Target
- **Table:** `prices`

### 📋 Mapping Kolom

| CSV Column | Database Column | Tipe Data | Transformasi |
|------------|----------------|-----------|--------------|
| `product_id` | `product_id` | UUID | **Lookup** ke `products.code` → `products.id` ⚠️ |
| `zone_id` | `zone_id` | UUID | **Lookup** ke `zones.code` → `zones.id` |
| `base_price` | `base_price` | DECIMAL | `toNumber()` |

### ⚠️ Catatan Penting
- `product_id` di CSV sebenarnya adalah **product code** (kode_model), bukan UUID!
- Script akan lookup: `products.code` = CSV `product_id` → ambil `products.id` (UUID)
- Unique constraint: `(product_id, zone_id)`

---

## 5️⃣ **importProductGroups()**

### 📄 File Sumber
- **CSV:** `master_group.csv`

### 🗄️ Tabel Target
- **Table:** `product_groups`

### 📋 Mapping Kolom

| CSV Column | Database Column | Tipe Data | Transformasi |
|------------|----------------|-----------|--------------|
| `code` | `code` | TEXT | Langsung mapping |
| `name` | `name` | TEXT | Langsung mapping |
| `priority` | `priority` | INTEGER | `toInt()` (default: 0) |

---

## 6️⃣ **importProductGroupMembers()**

### 📄 File Sumber
- **CSV:** `master_group_member.csv`

### 🗄️ Tabel Target
- **Table:** `product_group_members`

### 📋 Mapping Kolom

| CSV Column | Database Column | Tipe Data | Transformasi |
|------------|----------------|-----------|--------------|
| `product_code` | `product_id` | UUID | **Lookup** ke `products.code` → `products.id` |
| `group_code` | `product_group_id` | UUID | **Lookup** ke `product_groups.code` → `product_groups.id` |
| `priority` | `priority` | INTEGER | `toInt()` (default: 0) |

### ⚠️ Catatan
- Unique constraint: `(product_id, product_group_id)`
- Data yang tidak valid (code tidak ditemukan) akan di-filter

---

## 7️⃣ **importBucketMembers()**

### 📄 File Sumber
- **CSV:** `master_bucket_member.csv`

### 🗄️ Tabel Target
- **Table:** `bucket_members`

### 📋 Mapping Kolom

| CSV Column | Database Column | Tipe Data | Transformasi |
|------------|----------------|-----------|--------------|
| `product_code` | `product_id` | UUID | **Lookup** ke `products.code` → `products.id` |
| `bucket_id` | `bucket_id` | TEXT | Langsung mapping |

### ⚠️ Catatan
- Unique constraint: `(product_id, bucket_id)`
- `bucket_id` adalah text identifier untuk bucket (digunakan di bundle promo)

---

## 8️⃣ **importProductGroupAvailability()**

### 📄 File Sumber
- **CSV:** `master_group_availability.csv`

### 🗄️ Tabel Target
- **Table:** `product_group_availability`

### 📋 Mapping Kolom

| CSV Column | Database Column | Tipe Data | Transformasi |
|------------|----------------|-----------|--------------|
| `product_group_code` | `product_group_code` | TEXT | Langsung mapping |
| `rule_type` | `rule_type` | TEXT | Langsung mapping (allow/deny) |
| `level` | `level` | TEXT | Langsung mapping (zona/region/depo) |
| `zone_codes` | `zone_codes` | TEXT[] | `parseArray()` - Parse array dari CSV |
| `region_codes` | `region_codes` | TEXT[] | `parseArray()` - Parse array dari CSV |
| `depo_codes` | `depo_codes` | TEXT[] | `parseArray()` - Parse array dari CSV |

### ⚠️ Format Array di CSV
Format: `{value1,value2,value3}` atau `value1,value2,value3`

---

## 9️⃣ **importStoreLoyaltyClasses()**

### 📄 File Sumber
- **CSV:** `master_loyalty_class.csv`

### 🗄️ Tabel Target
- **Table:** `store_loyalty_classes`

### 📋 Mapping Kolom

| CSV Column | Database Column | Tipe Data | Transformasi |
|------------|----------------|-----------|--------------|
| `class_code` | `code` | TEXT | Langsung mapping |
| `class_name` | `name` | TEXT | Langsung mapping |
| `target_monthly` | `target_monthly` | DECIMAL | `toNumber()` |
| `cashback_percentage` | `cashback_percentage` | DECIMAL | `toNumber()` |

---

## 🔟 **importPrincipalDiscounts()**

### 📄 File Sumber
- **CSV:** `discon_principal_header.csv`

### 🗄️ Tabel Target
- **Table:** `principal_discounts`

### 📋 Mapping Kolom

| CSV Column | Database Column | Tipe Data | Transformasi |
|------------|----------------|-----------|--------------|
| `promo_id` | `promo_id` | TEXT | Langsung mapping |
| `description` | `description` | TEXT | Langsung mapping (default: '') |
| `principal` | `principal_codes` | TEXT[] | `parseArray()` - Parse array dari CSV |

### ⚠️ Catatan
- `principal` di CSV adalah array, akan di-parse menjadi `principal_codes` (TEXT[])

---

## 1️⃣1️⃣ **importPrincipalDiscountTiers()**

### 📄 File Sumber
- **CSV:** `discon_principal_rule.csv`

### 🗄️ Tabel Target
- **Table:** `principal_discount_tiers`

### 📋 Mapping Kolom

| CSV Column | Database Column | Tipe Data | Transformasi |
|------------|----------------|-----------|--------------|
| `promo_id` | `promo_id` | TEXT | Langsung mapping |
| `description` | `description` | TEXT | Langsung mapping (nullable) |
| `principal` | `principal_codes` | TEXT[] | `parseArray()` - Parse array dari CSV |
| `trigger` | `min_purchase_amount` | DECIMAL | `toNumber()` |
| `disc` | `discount_percentage` | DECIMAL | `toNumber()` |
| `priority` | `priority` | INTEGER | `toInt()` (default: 0) |

---

## 1️⃣2️⃣ **importGroupPromo()**

### 📄 File Sumber
- **CSV:** `discon_strata_rule.csv`

### 🗄️ Tabel Target
- **Table 1:** `group_promo` (header)
- **Table 2:** `group_promo_tiers` (tiers/rules)

### 📋 Mapping - Table: `group_promo`

| CSV Column | Database Column | Tipe Data | Transformasi |
|------------|----------------|-----------|--------------|
| `promo_id` | `promo_id` | TEXT | Langsung mapping (unique) |
| `description` | `description` | TEXT | Langsung mapping (default: '') |
| `group` | `product_group_code` | TEXT | Langsung mapping |
| `tier_mode` | `tier_mode` | TEXT | Langsung mapping (default: 'mix') |
| `tier_unit` | `tier_unit` | TEXT | Langsung mapping (default: 'unit_3') |
| `varian` | `consider_variant` | BOOLEAN | Convert: ada nilai → `true`, kosong → `false` |

### 📋 Mapping - Table: `group_promo_tiers`

| CSV Column | Database Column | Tipe Data | Transformasi |
|------------|----------------|-----------|--------------|
| `promo_id` | `promo_id` | TEXT | Langsung mapping |
| `description` | `description` | TEXT | Langsung mapping (nullable) |
| `qty_min` | `min_qty` | DECIMAL | `toNumber()` |
| `potongan` | `discount_per_unit` | DECIMAL | `toNumber()` |
| `varian` | `variant_count` | INTEGER | `toInt()` (nullable, jika ada) |
| `priority` | `priority` | INTEGER | `toInt()` (default: 0) |

### ⚠️ Catatan
- Satu CSV file menghasilkan **2 tabel**:
  1. `group_promo` - Header (unique by `promo_id`)
  2. `group_promo_tiers` - Multiple rows per `promo_id` (tiers)

---

## 1️⃣3️⃣ **importBundlePromo()**

### 📄 File Sumber
- **CSV:** `discon_paket_rule.csv`

### 🗄️ Tabel Target
- **Table 1:** `bundle_promo` (header)
- **Table 2:** `bundle_promo_groups` (groups)
- **Table 3:** `bundle_promo_group_items` (items per group)

### 📋 Mapping - Table: `bundle_promo`

| CSV Column | Database Column | Tipe Data | Transformasi |
|------------|----------------|-----------|--------------|
| `promo_id` | `promo_id` | TEXT | Langsung mapping (unique) |
| `description` | `description` | TEXT | Langsung mapping (default: '') |
| `potongan` | `discount_per_package` | DECIMAL | `toNumber()` |
| `kelipatan` | `max_packages` | INTEGER | `toInt()` (nullable) |

### 📋 Mapping - Table: `bundle_promo_groups`

Dibuat dari kolom `buket_1`, `buket_2`, `buket_3` di CSV:

| CSV Column | Database Column | Tipe Data | Transformasi |
|------------|----------------|-----------|--------------|
| `promo_id` | `promo_id` | TEXT | Langsung mapping |
| - | `group_number` | INTEGER | 1, 2, atau 3 (dari buket_1/2/3) |
| `qty_buket_1/2/3` | `total_quantity` | INTEGER | `toInt()` |
| `sat_buket_1/2/3` | `unit` | TEXT | Langsung mapping (default: 'unit_1') |

### 📋 Mapping - Table: `bundle_promo_group_items`

| CSV Column | Database Column | Tipe Data | Transformasi |
|------------|----------------|-----------|--------------|
| `buket_1/2/3` | `product_ids` | UUID[] | **Lookup** ke `bucket_members` → ambil semua `product_id` dari `bucket_id` |

### ⚠️ Catatan Penting
- Satu CSV row menghasilkan:
  - 1 row di `bundle_promo`
  - 1-3 rows di `bundle_promo_groups` (tergantung ada buket_1/2/3)
  - 1 row per group di `bundle_promo_group_items` (berisi array `product_ids`)
- `buket_1/2/3` di CSV adalah `bucket_id` (TEXT), perlu lookup ke `bucket_members` untuk mendapatkan `product_ids` (UUID[])
- Unique constraint: `bundle_promo_groups(promo_id, group_number)`

---

## 1️⃣4️⃣ **importInvoiceDiscounts()**

### 📄 File Sumber
- **CSV:** `discon_invoice.csv`

### 🗄️ Tabel Target
- **Table:** `invoice_discounts`

### 📋 Mapping Kolom

| CSV Column | Database Column | Tipe Data | Transformasi |
|------------|----------------|-----------|--------------|
| `promo_id` | `promo_id` | TEXT | Langsung mapping |
| `description` | `description` | TEXT | Langsung mapping (default: '') |
| `min_belanja` | `min_purchase_amount` | DECIMAL | `toNumber()` |
| `payment_method` | `payment_method` | TEXT | Langsung mapping |
| `disc` | `discount_percentage` | DECIMAL | `toNumber()` |

---

## 1️⃣5️⃣ **importFreeProductPromo()**

### 📄 File Sumber
- **CSV:** `promo_gratis_produk.csv`

### 🗄️ Tabel Target
- **Table:** `free_product_promo`

### 📋 Mapping Kolom

| CSV Column | Database Column | Tipe Data | Transformasi |
|------------|----------------|-----------|--------------|
| `promo_id` | `promo_id` | TEXT | Langsung mapping |
| `description` | `description` | TEXT | Langsung mapping (default: '') |
| `trigger_type` | `trigger_type` | TEXT | Langsung mapping ('nominal' atau 'qty') |
| `min_purchase_amount` | `min_purchase_amount` | DECIMAL | `toNumber()` (nullable, hanya jika `trigger_type='nominal'`) |
| `min_quantity` | `min_quantity` | INTEGER | `toInt()` (nullable, hanya jika `trigger_type='qty'`) |
| `purchase_scope` | `purchase_scope` | TEXT | Langsung mapping |
| `principal_ids` | `principal_codes` | TEXT[] | `parseArray()` (nullable) |
| `required_product_code` | `required_product_id` | UUID | **Lookup** ke `products.code` → `products.id` |
| `free_product_code` | `free_product_id` | UUID | **Lookup** ke `products.code` → `products.id` |
| `free_quantity` | `free_quantity` | INTEGER | `toInt()` |

### ⚠️ Catatan
- Data yang tidak valid (product code tidak ditemukan) akan di-filter

---

## 1️⃣6️⃣ **importPromoAvailability()**

### 📄 File Sumber
- **CSV:** `promo_availability.csv`

### 🗄️ Tabel Target
- **Table:** `promo_availability`

### 📋 Mapping Kolom

| CSV Column | Database Column | Tipe Data | Transformasi |
|------------|----------------|-----------|--------------|
| `promo_id` | `promo_id` | TEXT | Langsung mapping |
| `description` | `description` | TEXT | Langsung mapping (nullable) |
| `promo_type` | `promo_type` | TEXT | Langsung mapping |
| `store_type` | `store_type` | TEXT | Langsung mapping |
| `rule_type` | `rule_type` | TEXT | Langsung mapping (allow/deny) |
| `level` | `level` | TEXT | Langsung mapping (zona/region/depo) |
| `zone_codes` | `zone_codes` | TEXT[] | `parseArray()` - Parse array dari CSV |
| `region_codes` | `region_codes` | TEXT[] | `parseArray()` - Parse array dari CSV |
| `depo_codes` | `depo_codes` | TEXT[] | `parseArray()` - Parse array dari CSV |

---

## 🔧 Helper Functions

### `parseArray(csvValue)`
Parse array string dari CSV ke JavaScript array:
- Format: `"{value1,value2}"` atau `"value1,value2"`
- Returns: `[]` jika kosong

### `parseJSON(csvValue)`
Parse JSON string dari CSV ke object:
- Format: `'{"key":"value"}'`
- Returns: `null` jika kosong atau invalid

### `toNumber(value, nullable = true)`
Convert string ke number:
- Returns: `null` jika kosong dan `nullable=true`
- Returns: `0` jika kosong dan `nullable=false`

### `toInt(value, nullable = true)`
Convert string ke integer:
- Returns: `null` jika kosong dan `nullable=true`
- Returns: `0` jika kosong dan `nullable=false`

### `lookupId(table, codeField, codeValue)`
Lookup UUID dari code:
- Query: `SELECT id FROM table WHERE codeField = codeValue`
- Returns: UUID

### `batchLookupIds(table, codeField, codeValues)`
Batch lookup multiple UUIDs:
- Query: `SELECT id, codeField FROM table WHERE codeField IN (codeValues)`
- Returns: `Map<code, id>`

---

## 📌 Urutan Import (Dependencies)

Import harus dilakukan dalam urutan ini karena ada dependencies:

1. **zones** - No dependency
2. **principals** - No dependency
3. **products** - Requires: `principals`
4. **prices** - Requires: `products`, `zones`
5. **product_groups** - No dependency
6. **product_group_members** - Requires: `products`, `product_groups`
7. **bucket_members** - Requires: `products`
8. **product_group_availability** - No dependency (uses codes, not IDs)
9. **store_loyalty_classes** - No dependency
10. **principal_discounts** - No dependency
11. **principal_discount_tiers** - No dependency
12. **group_promo** - No dependency (uses codes, not IDs)
13. **bundle_promo** - Requires: `bucket_members`
14. **invoice_discounts** - No dependency
15. **free_product_promo** - Requires: `products`, `principals`
16. **promo_availability** - No dependency (uses codes, not IDs)

