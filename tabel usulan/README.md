# Tabel Usulan - Price Engine

## 📋 File Penting

### SQL Schema
- **`SCHEMA-CSV-FINAL.sql`** - ✅ **FILE UTAMA** - SQL schema untuk semua tabel (jalankan di Supabase SQL Editor)

### CSV Files (17 files)
Semua file CSV untuk import data:
- `master_zona.csv` - Zones
- `master_pincipal.csv` - Principals
- `master_product.csv` - Products
- `master_harga.csv` - Prices
- `master_group.csv` - Product Groups
- `master_group_member.csv` - Product Group Members
- `master_bucket_member.csv` - Bucket Members
- `master_group_availability.csv` - Product Group Availability
- `master_loyalty_class.csv` - Store Loyalty Classes
- `master_loyalty_availability.csv` - Store Loyalty Availability
- `master_loyalty_area_rules.csv` - Store Loyalty Area Rules
- `discon_principal_rule.csv` - Principal Discount Tiers
- `discon_strata_rule.csv` - Group Promo
- `discon_paket_rule.csv` - Bundle Promo
- `discon_invoice.csv` - Invoice Discounts
- `promo_gratis_produk.csv` - Free Product Promo
- `promo_availability.csv` - Promo Availability

### Dokumentasi
- **`STANDARD-PROMO-TYPE.md`** - Standard baku untuk promo_type
- **`CARA-MEMBUAT-TABEL-DI-SUPABASE.md`** - Panduan membuat tabel di Supabase
- **`CARA-UJI-APLIKASI.md`** - Panduan lengkap uji aplikasi
- **`BUNDLE-PROMO-REQUIREMENTS.md`** - Requirements dan mapping bundle promo

---

## 🚀 Quick Start

### 1. Buat Tabel di Supabase
1. Buka Supabase Dashboard → SQL Editor
2. Copy seluruh isi `SCHEMA-CSV-FINAL.sql`
3. Paste dan Run di SQL Editor

### 2. Import CSV
```bash
cd scripts
node import-csv.js all  # Import semua
# atau
node import-csv.js 1    # Import step by step
# atau
IMPORT.bat              # Menu interaktif
```

---

## 📚 Dokumentasi Lengkap

Lihat folder root:
- `UJI-APLIKASI.md` - Quick start guide untuk uji aplikasi
