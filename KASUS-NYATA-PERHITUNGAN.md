# Kasus Nyata: Perhitungan Harga Nett

## Data dari Cart (Gambar)

### Item 1: NABATI RCE 15g GT
- **Subtotal Nett**: Rp 99.090,77
- **Promo**: 
  - Strata: Rp 1.391,37
  - Bundle: Rp 1.517,86

### Item 2: NABATI GGM
- **Subtotal Nett**: Rp 49.545,39
- **Promo**: 
  - Strata: Rp 695,68
  - Bundle: Rp 758,93

### Item 3: NABATI RCO
- **Subtotal Nett**: Rp 49.545,39
- **Promo**: 
  - Strata: Rp 695,68
  - Bundle: Rp 758,93

## Analisis Perhitungan

### Step 1: Base Price & Subtotal
```
Base Price = harga dasar per karton dari master_products.prices[zona]
Subtotal Base = qtyBoxTotal × pricePerBox
```

### Step 2: Principal Discount
```
Principal Discount = Subtotal Base × (discountRate / 100)
Subtotal After Principal = Subtotal Base - Principal Discount
```

**Nilai ini disimpan di:** `item.subtotalAfterDiscount`

### Step 3: Group Promo (Strata) - Proporsional
```
Total Group Promo Discount (global) = [dihitung dari calculateGroupPromoDiscount]

// Proporsi per item
itemProportion = item.subtotalAfterDiscount / totalSubtotalAfterPrincipal
itemGroupPromoDiscount = totalGroupPromoDiscount × itemProportion
```

**Contoh untuk NABATI RCE:**
- Total Group Promo: Rp 2.782,74 (untuk semua item dalam group)
- Total Subtotal After Principal: Rp 198.180,77
- Item Subtotal After Principal: Rp 99.090,77
- `itemProportion = 99.090,77 / 198.180,77 = 0,5`
- `itemGroupPromoDiscount = 2.782,74 × 0,5 = 1.391,37` ✅

### Step 4: Bundle Promo - Proporsional dalam Bundle
```
Total Bundle Promo Discount (global) = [dihitung dari calculateBundlePromoDiscount]

// Proporsi per item DALAM BUNDLE YANG SAMA
totalSubtotalBundleItems = Σ(subtotalAfterDiscount item dalam bundle yang sama)
bundleItemProportion = item.subtotalAfterDiscount / totalSubtotalBundleItems
itemBundlePromoDiscount = totalBundlePromoDiscount × bundleItemProportion
```

**Contoh untuk NABATI RCE:**
- Total Bundle Promo: Rp 3.035,72 (untuk semua item dalam bundle)
- Total Subtotal Bundle Items: Rp 198.180,77
- Item Subtotal After Principal: Rp 99.090,77
- `bundleItemProportion = 99.090,77 / 198.180,77 = 0,5`
- `itemBundlePromoDiscount = 3.035,72 × 0,5 = 1.517,86` ✅

### Step 5: Subtotal Setelah Principal, Group, dan Bundle
```
subtotalAfterAllDiscounts = subtotalAfterDiscount 
                           - itemGroupPromoDiscount 
                           - itemBundlePromoDiscount
```

**Contoh untuk NABATI RCE:**
- Subtotal After Principal: Rp 99.090,77
- Group Promo Discount: Rp 1.391,37
- Bundle Promo Discount: Rp 1.517,86
- `subtotalAfterAllDiscounts = 99.090,77 - 1.391,37 - 1.517,86 = 96.181,54`

### Step 6: Invoice Discount (jika ada)
```
totalAfterOtherDiscountsGlobal = basePrice 
                                 - principalDiscount 
                                 - groupPromoDiscount 
                                 - bundlePromoDiscount
totalInvoiceDiscount = totalAfterOtherDiscountsGlobal × (discountPercentage / 100)

invoiceDiscountProportion = subtotalAfterAllDiscounts / totalAfterOtherDiscountsGlobal
itemInvoiceDiscount = totalInvoiceDiscount × invoiceDiscountProportion
```

**Untuk kasus ini:** Tidak ada invoice discount (0%)

### Step 7: Final Nett
```
finalNett = subtotalAfterAllDiscounts - itemInvoiceDiscount
```

**Contoh untuk NABATI RCE:**
- Subtotal After All Discounts: Rp 96.181,54
- Invoice Discount: Rp 0
- `finalNett = 96.181,54 - 0 = 96.181,54`

## ⚠️ Masalah yang Ditemukan

**Di cart ditampilkan:**
- Subtotal Nett: **Rp 99.090,77** (untuk NABATI RCE)

**Tapi seharusnya:**
- Final Nett: **Rp 96.181,54** (setelah dikurangi Group Promo dan Bundle Promo)

**Kesimpulan:**
Nilai yang ditampilkan di cart adalah `subtotalAfterDiscount` (setelah principal discount), bukan `finalNett` (setelah semua discount).

## Verifikasi Kode

Di `renderCartItem` (baris 2109):
```javascript
subtotalNettHtml = `<div class="cart-item-subtotal">Subtotal Nett: <strong>${formatCurrency(finalNett)}</strong></div>`;
```

Kode sudah benar menggunakan `finalNett`, tapi sepertinya `calculateItemDetails` belum dipanggil atau hasilnya belum tersimpan dengan benar.

## Perbaikan yang Diperlukan

1. Pastikan `calculateItemDetails(result)` dipanggil SEBELUM `renderKeranjang()`
2. Pastikan `window.lastCalculationResult` sudah di-update dengan hasil dari `calculateItemDetails`
3. Verifikasi bahwa `finalNett` dihitung dengan benar di `calculateItemDetails`

