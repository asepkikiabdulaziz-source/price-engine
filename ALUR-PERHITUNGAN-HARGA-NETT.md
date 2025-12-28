# Alur Perhitungan Harga Nett

## Ringkasan
Harga nett adalah harga akhir setelah semua diskon diterapkan. Berikut adalah step-by-step bagaimana harga nett terbentuk:

## Step-by-Step Perhitungan

### 1. **Harga Dasar (Base Price)**
```
Base Price = product.prices[userZona]  // Harga dasar per karton (unit_1)
```

### 2. **Subtotal Base (Sebelum Diskon)**
```
qtyBoxTotal = (qtyKrt × ratio) + qtyBox
pricePerBox = basePrice / ratio
subtotal = qtyBoxTotal × pricePerBox
```

**Contoh:**
- Base Price: Rp 100.000/krt
- Ratio: 12 box/krt
- Qty: 1 krt + 0 box
- `qtyBoxTotal = (1 × 12) + 0 = 12 box`
- `pricePerBox = 100.000 / 12 = 8.333,33`
- `subtotal = 12 × 8.333,33 = 100.000`

### 3. **Principal Discount (Diskon Principal)**
```
discountRate = [dari tier berdasarkan total purchase principal]
discountAmount = subtotal × (discountRate / 100)
subtotalAfterDiscount = subtotal - discountAmount
```

**Contoh:**
- Subtotal: Rp 100.000
- Discount Rate: 5%
- `discountAmount = 100.000 × 5% = 5.000`
- `subtotalAfterDiscount = 100.000 - 5.000 = 95.000`

**Nilai ini disimpan di:** `result.items[].subtotalAfterDiscount`

### 4. **Group Promo Discount (Strata) - Proporsional**
```
// Dihitung secara GLOBAL untuk semua item dalam group yang sama
totalGroupPromoDiscount = [dari calculateGroupPromoDiscount]

// Kemudian dibagi proporsional per item
totalSubtotalAfterPrincipal = Σ(subtotalAfterDiscount semua item)
itemProportion = item.subtotalAfterDiscount / totalSubtotalAfterPrincipal
itemGroupPromoDiscount = totalGroupPromoDiscount × itemProportion
```

**Contoh:**
- Total Group Promo Discount: Rp 2.782,74 (untuk semua item dalam group)
- Total Subtotal After Principal: Rp 198.180,77
- Item Subtotal After Principal: Rp 99.090,77
- `itemProportion = 99.090,77 / 198.180,77 = 0,5`
- `itemGroupPromoDiscount = 2.782,74 × 0,5 = 1.391,37`

### 5. **Bundle Promo Discount - Proporsional dalam Bundle**
```
// Dihitung secara GLOBAL untuk semua item dalam bundle yang sama
totalBundlePromoDiscount = [dari calculateBundlePromoDiscount]

// Kemudian dibagi proporsional per item DALAM BUNDLE YANG SAMA
totalSubtotalBundleItems = Σ(subtotalAfterDiscount item dalam bundle yang sama)
bundleItemProportion = item.subtotalAfterDiscount / totalSubtotalBundleItems
itemBundlePromoDiscount = totalBundlePromoDiscount × bundleItemProportion
```

**Contoh:**
- Total Bundle Promo Discount: Rp 3.035,72 (untuk semua item dalam bundle)
- Total Subtotal Bundle Items: Rp 198.180,77
- Item Subtotal After Principal: Rp 99.090,77
- `bundleItemProportion = 99.090,77 / 198.180,77 = 0,5`
- `itemBundlePromoDiscount = 3.035,72 × 0,5 = 1.517,86`

### 6. **Subtotal Setelah Principal, Group, dan Bundle**
```
subtotalAfterAllDiscounts = subtotalAfterDiscount 
                           - itemGroupPromoDiscount 
                           - itemBundlePromoDiscount
```

**Contoh:**
- Subtotal After Discount: Rp 99.090,77
- Group Promo Discount: Rp 1.391,37
- Bundle Promo Discount: Rp 1.517,86
- `subtotalAfterAllDiscounts = 99.090,77 - 1.391,37 - 1.517,86 = 96.181,54`

### 7. **Invoice Discount - Proporsional**
```
// Dihitung secara GLOBAL
totalAfterOtherDiscountsGlobal = basePrice 
                                 - principalDiscount 
                                 - groupPromoDiscount 
                                 - bundlePromoDiscount
totalInvoiceDiscount = totalAfterOtherDiscountsGlobal × (discountPercentage / 100)

// Kemudian dibagi proporsional per item
invoiceDiscountProportion = subtotalAfterAllDiscounts / totalAfterOtherDiscountsGlobal
itemInvoiceDiscount = totalInvoiceDiscount × invoiceDiscountProportion
```

**Contoh:**
- Total After Other Discounts: Rp 192.363,08
- Invoice Discount %: 0% (tidak ada invoice discount untuk kasus ini)
- `itemInvoiceDiscount = 0`

### 8. **Final Nett (Harga Nett Akhir)**
```
finalNett = subtotalAfterAllDiscounts - itemInvoiceDiscount
```

**Contoh:**
- Subtotal After All Discounts: Rp 96.181,54
- Invoice Discount: Rp 0
- `finalNett = 96.181,54 - 0 = 96.181,54`

**Tapi di cart terlihat: Rp 99.090,77** - ini menunjukkan ada perbedaan!

### 9. **Harga Nett Per Krt**
```
qtyKrtTotal = qtyKrt + (qtyBox / ratio)
hargaNettPerKrt = finalNett / qtyKrtTotal
```

**Contoh:**
- Final Nett: Rp 96.181,54
- Qty Krt Total: 1 krt
- `hargaNettPerKrt = 96.181,54 / 1 = 96.181,54`

## ⚠️ Masalah yang Ditemukan

Berdasarkan gambar yang ditampilkan:
- **NABATI RCE**: Subtotal Nett = Rp 99.090,77
- **Promo**: Strata: Rp 1.391,37, Bundle: Rp 1.517,86

**Perhitungan yang seharusnya:**
```
Subtotal After Discount: Rp 99.090,77
- Group Promo: Rp 1.391,37
- Bundle Promo: Rp 1.517,86
= Final Nett: Rp 96.181,54
```

**Tapi di cart terlihat: Rp 99.090,77**

Ini menunjukkan bahwa **Final Nett yang ditampilkan di cart adalah `subtotalAfterDiscount` (setelah principal discount), bukan `finalNett` (setelah semua discount)**.

## Kesimpulan

**Harga Nett yang benar seharusnya:**
```
Final Nett = Subtotal After Principal 
           - Group Promo Discount 
           - Bundle Promo Discount 
           - Invoice Discount
```

**Bukan hanya:**
```
Final Nett = Subtotal After Principal (SALAH!)
```

Perlu diperbaiki di `renderCartItem` untuk menampilkan `finalNett` yang sudah benar, bukan `subtotalAfterDiscount`.

