# 📋 Target Tables Reference - Quick Lookup

Dokumen ini menunjukkan **dimana di kode** target tabel di-set untuk setiap fungsi import.

---

## 🎯 Cara Mencari Target Tabel di Script

Target tabel di-set menggunakan **`.from('nama_tabel')`** pada Supabase query.

Contoh:
```javascript
const { error } = await supabase.from('zones').upsert(data, { onConflict: 'code' });
//                            ^^^^^^^^
//                            INI adalah target tabel!
```

---

## 📊 Daftar Lengkap: CSV → Target Table → Lokasi di Code

| Step | CSV File | Target Table | Lokasi di Code (line) |
|------|----------|--------------|----------------------|
| 1 | `master_zona.csv` | `zones` | Line 154: `.from('zones')` |
| 2 | `master_pincipal.csv` | `principals` | Line 180: `.from('principals')` |
| 3 | `master_product.csv` | `products` | Line 229: `.from('products')` |
| 4 | `master_harga.csv` | `prices` | Line 271: `.from('prices')` |
| 5 | `master_group.csv` | `product_groups` | Line 302: `.from('product_groups')` |
| 6 | `master_group_member.csv` | `product_group_members` | Line 341: `.from('product_group_members')` |
| 7 | `master_bucket_member.csv` | `bucket_members` | Line 377: `.from('bucket_members')` |
| 8 | `master_group_availability.csv` | `product_group_availability` | Line 414: `.from('product_group_availability')` |
| 9 | `master_loyalty_class.csv` | `store_loyalty_classes` | Line 444: `.from('store_loyalty_classes')` |
| 10 | `discon_principal_header.csv` | `principal_discounts` | Line 472: `.from('principal_discounts')` |
| 11 | `discon_principal_rule.csv` | `principal_discount_tiers` | Line 506: `.from('principal_discount_tiers')` |
| 12 | `discon_strata_rule.csv` | `group_promo` | Line 558: `.from('group_promo')` |
| 12 | `discon_strata_rule.csv` | `group_promo_tiers` | Line 572: `.from('group_promo_tiers')` |
| 13 | `discon_paket_rule.csv` | `bundle_promo` | Line 617: `.from('bundle_promo')` |
| 13 | `discon_paket_rule.csv` | `bundle_promo_groups` | Line 645: `.from('bundle_promo_groups')` |
| 13 | `discon_paket_rule.csv` | `bundle_promo_group_items` | Line 667: `.from('bundle_promo_group_items')` |
| 14 | `discon_invoice.csv` | `invoice_discounts` | Line 707: `.from('invoice_discounts')` |
| 15 | `promo_gratis_produk.csv` | `free_product_promo` | Line 764: `.from('free_product_promo')` |
| 16 | `promo_availability.csv` | `promo_availability` | Line 804: `.from('promo_availability')` |

---

## 🔍 Detail Lokasi di Code

### 1. zones
```javascript
// Line 154
const { error } = await supabase.from('zones').upsert(data, { onConflict: 'code' });
```

### 2. principals
```javascript
// Line 180
const { error } = await supabase.from('principals').upsert(data, { onConflict: 'code' });
```

### 3. products
```javascript
// Line 229
const { error } = await supabase.from('products').upsert(data, { onConflict: 'code' });
```

### 4. prices
```javascript
// Line 271-272
const { error } = await supabase
    .from('prices')
    .upsert(price, { onConflict: 'product_id,zone_id' });
```

### 5. product_groups
```javascript
// Line 302
const { error } = await supabase.from('product_groups').upsert(data, { onConflict: 'code' });
```

### 6. product_group_members
```javascript
// Line 341-342
const { error } = await supabase
    .from('product_group_members')
    .upsert(member, { onConflict: 'product_id,product_group_id' });
```

### 7. bucket_members
```javascript
// Line 377-378
const { error } = await supabase
    .from('bucket_members')
    .upsert(member, { onConflict: 'product_id,bucket_id' });
```

### 8. product_group_availability
```javascript
// Line 414
const { error } = await supabase.from('product_group_availability').insert(data);
```

### 9. store_loyalty_classes
```javascript
// Line 444
const { error } = await supabase.from('store_loyalty_classes').upsert(data, { onConflict: 'code' });
```

### 10. principal_discounts
```javascript
// Line 472
const { error } = await supabase.from('principal_discounts').upsert(data, { onConflict: 'promo_id' });
```

### 11. principal_discount_tiers
```javascript
// Line 506
const { error } = await supabase.from('principal_discount_tiers').insert(data);
```

### 12. group_promo + group_promo_tiers
```javascript
// Line 558 - group_promo
const { error: promoError } = await supabase.from('group_promo').upsert(promoData, { onConflict: 'promo_id' });

// Line 572 - group_promo_tiers
const { error: tierError } = await supabase.from('group_promo_tiers').insert(tierData);
```

### 13. bundle_promo + bundle_promo_groups + bundle_promo_group_items
```javascript
// Line 617 - bundle_promo
const { error: promoError } = await supabase.from('bundle_promo').upsert(bundlePromoData, { onConflict: 'promo_id' });

// Line 645 - bundle_promo_groups
const { data: groupData, error: groupError } = await supabase
    .from('bundle_promo_groups')
    .upsert({...}, { onConflict: 'promo_id,group_number' })

// Line 667 - bundle_promo_group_items
const { error: itemError } = await supabase
    .from('bundle_promo_group_items')
    .insert({...});
```

### 14. invoice_discounts
```javascript
// Line 707
const { error } = await supabase.from('invoice_discounts').upsert(data, { onConflict: 'promo_id' });
```

### 15. free_product_promo
```javascript
// Line 764
const { error } = await supabase.from('free_product_promo').upsert(data, { onConflict: 'promo_id' });
```

### 16. promo_availability
```javascript
// Line 804
const { error } = await supabase.from('promo_availability').insert(data);
```

---

## 💡 Tips Mencari Target Tabel di Script

1. **Buka file:** `scripts/import-csv.js`
2. **Cari fungsi import** (contoh: `async function importZones()`)
3. **Scroll ke bawah** sampai menemukan `.from('nama_tabel')`
4. **Itu adalah target tabel!**

Atau gunakan **Find/Replace** di editor:
- Cari: `.from(`
- Akan muncul semua lokasi dimana tabel di-set

---

## 📌 Catatan

- Beberapa CSV menghasilkan **multiple tables** (contoh: bundle_promo menghasilkan 3 tabel)
- Line numbers mungkin berubah jika file di-edit, tapi pattern `.from('nama_tabel')` tetap sama
- Gunakan `Ctrl+F` untuk mencari nama tabel di editor

