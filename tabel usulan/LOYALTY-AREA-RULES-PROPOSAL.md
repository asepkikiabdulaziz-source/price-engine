# Proposal: Area-Specific Loyalty Program Rules

## Masalah
Saat ini `store_loyalty_classes` menyimpan `target_monthly` dan `cashback_percentage` secara global. Namun requirement:
- **Kelas** bisa berbeda per area (sudah ada di `store_loyalty_availability`)
- **Target** bisa berbeda per area (belum ada)
- **Reward** bisa berbeda per area (belum ada)

## Solusi: Tabel `store_loyalty_area_rules`

### Struktur Tabel Baru

```sql
CREATE TABLE store_loyalty_area_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    loyalty_class_code TEXT NOT NULL,  -- reference ke store_loyalty_classes.code
    store_type TEXT NOT NULL CHECK (store_type IN ('grosir', 'retail', 'all')) DEFAULT 'all', -- filter type outlet
    zone_codes TEXT[],     -- array dari zone_code (null = all zones)
    region_codes TEXT[],   -- array dari region_code (null = all regions)
    depo_codes TEXT[],     -- array dari depo_code (null = all depos)
    target_monthly DECIMAL(15,2) NOT NULL, -- target untuk area ini
    cashback_percentage DECIMAL(5,2) NOT NULL, -- reward untuk area ini
    priority INTEGER DEFAULT 0, -- untuk resolve conflict (higher = more specific)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_loyalty_area_rules_class ON store_loyalty_area_rules(loyalty_class_code);
CREATE INDEX idx_loyalty_area_rules_zone_codes ON store_loyalty_area_rules USING GIN (zone_codes);
CREATE INDEX idx_loyalty_area_rules_region_codes ON store_loyalty_area_rules USING GIN (region_codes);
CREATE INDEX idx_loyalty_area_rules_depo_codes ON store_loyalty_area_rules USING GIN (depo_codes);
```

### Struktur CSV Baru: `master_loyalty_area_rules.csv`

```csv
loyalty_class_code,store_type,zone_codes,region_codes,depo_codes,target_monthly,cashback_percentage,priority
A,all,ZONA1,REG1,DEPO1,50000000,1.0,10
A,grosir,ZONA2,REG2,DEPO2,60000000,1.2,10
A,retail,ZONA2,REG2,DEPO2,55000000,1.1,10
A,all,all,all,all,25000000,0.5,0
B,all,ZONA1,REG1,DEPO1,30000000,0.6,10
B,all,all,all,all,25000000,0.5,0
```

**Format:**
- `store_type`: 'grosir', 'retail', atau 'all' (default: 'all') - filter type outlet
- `zone_codes`, `region_codes`, `depo_codes`: comma-separated values (akan di-parse menjadi array)
- `all` = berlaku untuk semua area di level tersebut
- `priority`: 0 = default/fallback, 10+ = area-specific (lebih tinggi = lebih spesifik)

### Logic Resolve Rules

**Prioritas:**
1. **Depo-specific** (priority 10+) → `depo_codes` match
2. **Region-specific** (priority 10+) → `region_codes` match, `depo_codes` = all/null
3. **Zone-specific** (priority 10+) → `zone_codes` match, `region_codes` = all/null, `depo_codes` = all/null
4. **Default** (priority 0) → `zone_codes` = all, `region_codes` = all, `depo_codes` = all

**Algoritma:**
```javascript
function resolveLoyaltyRule(loyaltyClassCode, storeType, userZona, userRegion, userDepo, areaRules) {
    // Filter rules untuk kelas ini
    const classRules = areaRules.filter(r => r.loyalty_class_code === loyaltyClassCode);
    
    // Filter by store_type first
    const storeTypeRules = classRules.filter(rule => {
        if (rule.store_type === 'all') return true;
        return rule.store_type === storeType;
    });
    
    // Sort by priority (descending) dan specificity
    const sortedRules = storeTypeRules.sort((a, b) => {
        // 1. Priority (higher first)
        if (b.priority !== a.priority) return b.priority - a.priority;
        
        // 2. Specificity: depo > region > zone > all
        const aSpecificity = getSpecificity(a);
        const bSpecificity = getSpecificity(b);
        return bSpecificity - aSpecificity;
    });
    
    // Find first matching rule
    for (const rule of sortedRules) {
        if (matchesArea(rule, userZona, userRegion, userDepo)) {
            return rule;
        }
    }
    
    // Fallback: return default dari store_loyalty_classes
    return null; // akan menggunakan default dari store_loyalty_classes
}

function getSpecificity(rule) {
    let score = 0;
    if (rule.depo_codes && rule.depo_codes.length > 0 && !rule.depo_codes.includes('all')) score += 3;
    if (rule.region_codes && rule.region_codes.length > 0 && !rule.region_codes.includes('all')) score += 2;
    if (rule.zone_codes && rule.zone_codes.length > 0 && !rule.zone_codes.includes('all')) score += 1;
    return score;
}

function matchesArea(rule, userZona, userRegion, userDepo) {
    // Check zone
    if (rule.zone_codes && rule.zone_codes.length > 0) {
        if (!rule.zone_codes.includes('all') && !rule.zone_codes.includes(userZona)) {
            return false;
        }
    }
    
    // Check region
    if (rule.region_codes && rule.region_codes.length > 0) {
        if (!rule.region_codes.includes('all') && !rule.region_codes.includes(userRegion)) {
            return false;
        }
    }
    
    // Check depo
    if (rule.depo_codes && rule.depo_codes.length > 0) {
        if (!rule.depo_codes.includes('all') && !rule.depo_codes.includes(userDepo)) {
            return false;
        }
    }
    
    return true;
}
```

### Flow Penggunaan

1. **Load Data:**
   - Load `store_loyalty_classes` (default values)
   - Load `store_loyalty_area_rules` (area-specific overrides)
   - Load `store_loyalty_availability` (untuk check availability)

2. **Resolve Rule:**
   - Check availability dari `store_loyalty_availability`
   - Jika available, resolve area-specific rule dari `store_loyalty_area_rules`
   - Jika tidak ada area-specific rule, gunakan default dari `store_loyalty_classes`

3. **Calculate:**
   - Gunakan `target_monthly` dan `cashback_percentage` dari resolved rule
   - Hitung cashback berdasarkan total purchase bulanan

### Migration Path

1. **Phase 1:** Tambah tabel `store_loyalty_area_rules` (kosong)
2. **Phase 2:** Import CSV `master_loyalty_area_rules.csv`
3. **Phase 3:** Update calculation logic untuk menggunakan area-specific rules
4. **Phase 4:** `store_loyalty_classes` tetap sebagai fallback/default

### Keuntungan

✅ **Fleksibel:** Bisa override target dan reward per area  
✅ **Konsisten:** Mengikuti pola `promo_availability` yang sudah ada  
✅ **Backward Compatible:** Default dari `store_loyalty_classes` tetap digunakan jika tidak ada area-specific rule  
✅ **Scalable:** Bisa menambah rules baru tanpa mengubah struktur existing  

### Contoh Use Case

**Scenario:**
- Kelas A di ZONA1: target 50M, cashback 1.0%
- Kelas A di ZONA2: target 60M, cashback 1.2%
- Kelas A di area lain: target 50M, cashback 1.0% (default)

**Data:**
```csv
loyalty_class_code,store_type,zone_codes,region_codes,depo_codes,target_monthly,cashback_percentage,priority
A,all,ZONA1,all,all,50000000,1.0,10
A,grosir,ZONA2,all,all,60000000,1.2,10
A,retail,ZONA2,all,all,55000000,1.1,10
A,all,all,all,all,50000000,1.0,0
```

**Result:**
- User di ZONA1 → gunakan rule ZONA1 (target 50M, cashback 1.0%)
- User di ZONA2 → gunakan rule ZONA2 (target 60M, cashback 1.2%)
- User di ZONA3 → gunakan default (target 50M, cashback 1.0%)

