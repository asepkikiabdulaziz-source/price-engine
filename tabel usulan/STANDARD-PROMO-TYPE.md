# Standard Baku: promo_type

## 📋 Standard Baku untuk promo_type

Kolom `type` di `promo_availability.csv` harus menggunakan nilai **standard baku** berikut:

### ✅ Nilai yang Valid:

1. **`principal`** - Untuk Promo Principal/Diskon Principal
2. **`strata`** - Untuk Promo Group/Strata (bukan 'group')
3. **`bundling`** - Untuk Promo Bundle/Paket (bukan 'bundle')
4. **`invoice`** - Untuk Diskon Invoice
5. **`free_product`** - Untuk Promo Gratis Produk

---

## ⚠️ Penting

- **TIDAK ADA MAPPING** - CSV harus langsung menggunakan nilai standard baku
- Nilai harus lowercase (huruf kecil)
- Nilai yang tidak valid akan menyebabkan error constraint violation

---

## 🔄 Perbaikan CSV

Jika CSV saat ini menggunakan:
- `'group'` → ubah menjadi `'strata'`
- `'bundle'` → ubah menjadi `'bundling'`

---

## ✅ Contoh CSV yang Benar

```csv
promo_id,description,type,store_type,rule_type,level,...
disc-reg-01,Diskon Principal,principal,all,allow,all,...
prm-004,Promo Strata,strata,all,allow,all,...
PAKET-A,Bundle Promo,bundling,all,allow,all,...
inv-001,Diskon Invoice,invoice,all,allow,all,...
free-001,Promo Gratis,free_product,all,allow,all,...
```

---

## 📝 Reference

SQL Constraint di `promo_availability` table:
```sql
promo_type TEXT NOT NULL CHECK (promo_type IN ('principal', 'strata', 'bundling', 'invoice', 'free_product'))
```

