-- ============================================
-- SCHEMA CSV FINAL - Price Engine
-- Mapping dari CSV ke Database Tables
-- ============================================

-- Enable UUID extension (required for uuid_generate_v4())
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. MASTER DATA GEOGRAFIS
-- ============================================

-- master_zona.csv → zones
CREATE TABLE zones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code TEXT UNIQUE NOT NULL,  -- zona_id dari CSV
    name TEXT NOT NULL,          -- zona_name dari CSV
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- master_region.csv → regions
CREATE TABLE regions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code TEXT UNIQUE NOT NULL,  -- region_id dari CSV
    name TEXT NOT NULL,          -- region_name dari CSV
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- master_depo.csv → depos
CREATE TABLE depos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code TEXT UNIQUE NOT NULL,  -- depo_id dari CSV
    name TEXT NOT NULL,          -- depo_name dari CSV
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 2. MASTER DATA PRODUK
-- ============================================

-- master_pincipal.csv → principals
CREATE TABLE principals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code TEXT UNIQUE NOT NULL,  -- id_principal dari CSV
    name TEXT NOT NULL,          -- nama_principal dari CSV
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- master_product.csv → master_products
CREATE TABLE master_products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code TEXT UNIQUE NOT NULL,           -- kode_model dari CSV
    name TEXT NOT NULL,                  -- nama_produk dari CSV
    principal_id UUID REFERENCES principals(id),
    category TEXT,                       -- id_kategori dari CSV
    unit_1 TEXT,                         -- satuan terbesar (karton) dari CSV
    unit_2 TEXT,                         -- satuan lebih kecil (box) dari CSV (nullable)
    unit_3 TEXT,                         -- satuan lainnya dari CSV (nullable)
    ratio_unit_2_per_unit_1 DECIMAL(10,2), -- rasio: berapa unit_2 per unit_1 (misalnya 8 box per karton) (nullable)
    ratio_unit_3_per_unit_2 DECIMAL(10,2), -- rasio: berapa unit_3 per unit_2 (nullable)
    availability_default TEXT CHECK (availability_default IN ('OPEN', 'CLOSED')), -- ketersediaan_default dari CSV
    spec_technical JSONB,                -- spek_teknis dari CSV (parsed JSON)
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- master_harga.csv → prices
CREATE TABLE prices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id TEXT NOT NULL,  -- reference ke master_products.code (TEXT, no id column)
    zone_id UUID REFERENCES zones(id) ON DELETE CASCADE,
    base_price DECIMAL(15,2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(product_id, zone_id)
);

-- ============================================
-- 3. MASTER DATA GRUP PRODUK
-- ============================================

-- master_group.csv → product_groups
CREATE TABLE product_groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code TEXT UNIQUE NOT NULL,  -- code dari CSV
    name TEXT NOT NULL,          -- name dari CSV
    priority INTEGER DEFAULT 0,  -- priority dari CSV
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- master_group_member.csv → product_group_members
CREATE TABLE product_group_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id TEXT NOT NULL,  -- reference ke master_products.code (TEXT, no id column)
    product_group_id UUID REFERENCES product_groups(id) ON DELETE CASCADE,
    priority INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(product_id, product_group_id)
);

-- master_bucket_member.csv → bucket_members
-- PENTING: Bucket adalah entity BERBEDA dari Product Group
-- - Product Group → untuk Promo Group/Strata (product_groups + product_group_members)
-- - Bucket → untuk Promo Bundle/Paket (bucket_members)
-- Meskipun bucket_id mungkin sama dengan product_group_code, member-nya bisa berbeda!
CREATE TABLE bucket_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id TEXT NOT NULL,  -- reference ke master_products.code (TEXT, no id column)
    bucket_id TEXT NOT NULL,  -- bucket_id dari CSV (untuk Promo Bundle, berbeda dari product_group_code)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(product_id, bucket_id)
);

-- master_group_availability.csv → product_group_availability (atau area_coverage dengan entity_type='product_group')
CREATE TABLE product_group_availability (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_group_code TEXT NOT NULL,  -- reference ke product_groups.code
    rule_type TEXT NOT NULL CHECK (rule_type IN ('allow', 'deny')),
    level TEXT NOT NULL CHECK (level IN ('zona', 'region', 'depo')),
    zone_codes TEXT[],     -- array dari zone_code
    region_codes TEXT[],   -- array dari region_code
    depo_codes TEXT[],     -- array dari depo_code
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 4. MASTER DATA LOYALTY
-- ============================================

-- master_loyalty_class.csv → store_loyalty_classes
CREATE TABLE store_loyalty_classes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code TEXT UNIQUE NOT NULL,           -- class_code dari CSV
    name TEXT NOT NULL,                  -- class_name dari CSV
    target_monthly DECIMAL(15,2) NOT NULL, -- target_monthly dari CSV
    cashback_percentage DECIMAL(5,2) NOT NULL, -- cashback_percentage dari CSV
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- master_loyalty_availability.csv → store_loyalty_availability
CREATE TABLE store_loyalty_availability (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    loyalty_class_code TEXT NOT NULL,  -- reference ke store_loyalty_classes.code
    rule_type TEXT NOT NULL CHECK (rule_type IN ('allow', 'deny')),
    level TEXT NOT NULL CHECK (level IN ('zona', 'region', 'depo', 'all')),
    zone_codes TEXT[],     -- array dari zone_code
    region_codes TEXT[],   -- array dari region_code
    depo_codes TEXT[],     -- array dari depo_code
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- master_loyalty_area_rules.csv → store_loyalty_area_rules
CREATE TABLE store_loyalty_area_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    loyalty_class_code TEXT NOT NULL,  -- reference ke store_loyalty_classes.code
    zone_codes TEXT[],     -- array dari zone_code (null = all zones)
    region_codes TEXT[],   -- array dari region_code (null = all regions)
    depo_codes TEXT[],     -- array dari depo_code (null = all depos)
    target_monthly DECIMAL(15,2) NOT NULL, -- target untuk area ini
    cashback_percentage DECIMAL(5,2) NOT NULL, -- reward untuk area ini
    priority INTEGER DEFAULT 0, -- untuk resolve conflict (higher = more specific)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 5. DISKON PRINCIPAL
-- ============================================

-- discon_principal_rule.csv → principal_discount_tiers
CREATE TABLE principal_discount_tiers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    promo_id TEXT NOT NULL,  -- reference ke promo_availability.promo_id
    description TEXT,
    principal_codes TEXT[] NOT NULL,  -- principal dari CSV (parsed array) - ambil dari row pertama tier
    min_purchase_amount DECIMAL(15,2) NOT NULL, -- trigger dari CSV
    discount_percentage DECIMAL(5,2) NOT NULL,  -- disc dari CSV
    priority INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(promo_id, min_purchase_amount)
);

-- ============================================
-- 6. PROMO GRUP PRODUK / STRATA
-- ============================================

-- discon_strata_rule.csv → group_promo dan group_promo_tiers
CREATE TABLE group_promo (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    promo_id TEXT UNIQUE NOT NULL,  -- promo_id dari CSV (per promo_id unique)
    description TEXT NOT NULL,
    product_group_code TEXT NOT NULL, -- group dari CSV
    tier_mode TEXT NOT NULL CHECK (tier_mode IN ('mix', 'non mix')),
    tier_unit TEXT NOT NULL CHECK (tier_unit IN ('unit_1', 'unit_2', 'unit_3')),
    consider_variant BOOLEAN DEFAULT FALSE, -- jika varian column ada
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE group_promo_tiers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    promo_id TEXT NOT NULL,  -- reference ke group_promo.promo_id
    description TEXT,
    min_qty DECIMAL(10,2) NOT NULL,      -- qty_min dari CSV
    discount_per_unit DECIMAL(15,2) NOT NULL, -- potongan dari CSV
    variant_count INTEGER,                -- varian dari CSV (nullable)
    priority INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 7. PROMO BUNDLING
-- ============================================

-- discon_paket_rule.csv → bundle_promo, bundle_promo_groups
-- PENTING: Promo Bundle menggunakan BUCKET (bukan Product Group)
-- Bucket berbeda dari Product Group meskipun namanya mungkin sama
-- - Product Group → untuk Promo Group/Strata (group_promo)
-- - Bucket → untuk Promo Bundle (bundle_promo)
CREATE TABLE bundle_promo (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    promo_id TEXT UNIQUE NOT NULL,  -- promo_id dari CSV
    description TEXT NOT NULL,
    discount_per_package DECIMAL(15,2) NOT NULL, -- potongan dari CSV
    max_packages INTEGER,                        -- kelipatan dari CSV
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Kelompok produk (group/pair) - bucket_id dari CSV
-- bucket_id reference ke bucket_members (product_ids didapat dengan JOIN ke bucket_members)
CREATE TABLE bundle_promo_groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    promo_id TEXT NOT NULL,  -- reference ke bundle_promo.promo_id
    group_number INTEGER NOT NULL,  -- 1, 2, 3 (urut dari bucket dalam CSV)
    bucket_id TEXT NOT NULL,  -- bucket_id dari CSV (reference ke bucket_members.bucket_id)
    total_quantity INTEGER NOT NULL,  -- qty_bucket dari CSV (total yang harus dicapai)
    unit TEXT NOT NULL CHECK (unit IN ('unit_1', 'unit_2', 'unit_3')), -- unit_bucket dari CSV
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(promo_id, group_number)
);

-- ============================================
-- 8. DISKON INVOICE
-- ============================================

-- discon_invoice.csv → invoice_discounts
CREATE TABLE invoice_discounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    promo_id TEXT UNIQUE NOT NULL,  -- promo_id dari CSV
    description TEXT NOT NULL,
    min_purchase_amount DECIMAL(15,2) NOT NULL,
    payment_method TEXT NOT NULL CHECK (payment_method IN ('COD', 'CBD')),
    discount_percentage DECIMAL(5,2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 9. PROMO GRATIS PRODUK
-- ============================================

-- promo_gratis_produk.csv → free_product_promo
CREATE TABLE free_product_promo (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    promo_id TEXT UNIQUE NOT NULL,  -- promo_id dari CSV
    description TEXT NOT NULL,
    trigger_type TEXT NOT NULL CHECK (trigger_type IN ('nominal', 'qty')),
    min_purchase_amount DECIMAL(15,2), -- nullable jika trigger_type = 'qty'
    min_quantity INTEGER,               -- nullable jika trigger_type = 'nominal'
    purchase_scope TEXT NOT NULL CHECK (purchase_scope IN ('per_principal', 'combined_principal', 'total_invoice')),
    principal_codes TEXT[],             -- principal_ids dari CSV (parsed array, nullable)
    required_product_id TEXT,           -- reference ke master_products.code (TEXT, no id column)
    free_product_id TEXT,               -- reference ke master_products.code (TEXT, no id column)
    free_quantity INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 10. PROMO AVAILABILITY (UNIFIED)
-- ============================================

-- promo_availability.csv → promo_availability (atau area_coverage dengan entity_type)
CREATE TABLE promo_availability (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    promo_id TEXT NOT NULL,  -- reference ke promo tables (promo_id)
    description TEXT,
    promo_type TEXT NOT NULL CHECK (promo_type IN ('principal', 'strata', 'bundling', 'invoice', 'free_product')),
    store_type TEXT NOT NULL CHECK (store_type IN ('retail', 'grosir', 'all')),
    rule_type TEXT NOT NULL CHECK (rule_type IN ('allow', 'deny', 'all')),
    level TEXT NOT NULL CHECK (level IN ('zona', 'region', 'depo', 'all')),
    zone_codes TEXT[],     -- array dari zone_code
    region_codes TEXT[],   -- array dari region_code
    depo_codes TEXT[],     -- array dari depo_code
    start_date DATE,       -- tanggal mulai promo (nullable, jika null = mulai kapan saja)
    end_date DATE,         -- tanggal akhir promo (nullable, jika null = tidak ada batas waktu)
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================

-- Indexes untuk performa query
CREATE INDEX idx_prices_product_zone ON prices(product_id, zone_id);
CREATE INDEX idx_product_group_members_group ON product_group_members(product_group_id);
CREATE INDEX idx_group_promo_tiers_promo ON group_promo_tiers(promo_id);
CREATE INDEX idx_bundle_promo_groups_promo ON bundle_promo_groups(promo_id);
CREATE INDEX idx_bundle_promo_groups_bucket ON bundle_promo_groups(bucket_id);
CREATE INDEX idx_promo_availability_promo ON promo_availability(promo_id, promo_type);
CREATE INDEX idx_promo_availability_store ON promo_availability(store_type);

-- GIN indexes untuk array
CREATE INDEX idx_product_group_availability_zone_codes ON product_group_availability USING GIN (zone_codes);
CREATE INDEX idx_product_group_availability_region_codes ON product_group_availability USING GIN (region_codes);
CREATE INDEX idx_product_group_availability_depo_codes ON product_group_availability USING GIN (depo_codes);
CREATE INDEX idx_promo_availability_zone_codes ON promo_availability USING GIN (zone_codes);
CREATE INDEX idx_promo_availability_region_codes ON promo_availability USING GIN (region_codes);
CREATE INDEX idx_promo_availability_depo_codes ON promo_availability USING GIN (depo_codes);

-- Indexes untuk store_loyalty_availability (array fields untuk performa query)
CREATE INDEX idx_store_loyalty_availability_class ON store_loyalty_availability(loyalty_class_code);
CREATE INDEX idx_store_loyalty_availability_zone_codes ON store_loyalty_availability USING GIN (zone_codes);
CREATE INDEX idx_store_loyalty_availability_region_codes ON store_loyalty_availability USING GIN (region_codes);
CREATE INDEX idx_store_loyalty_availability_depo_codes ON store_loyalty_availability USING GIN (depo_codes);

-- Indexes untuk store_loyalty_area_rules (array fields untuk performa query)
CREATE INDEX idx_store_loyalty_area_rules_class ON store_loyalty_area_rules(loyalty_class_code);
CREATE INDEX idx_store_loyalty_area_rules_zone_codes ON store_loyalty_area_rules USING GIN (zone_codes);
CREATE INDEX idx_store_loyalty_area_rules_region_codes ON store_loyalty_area_rules USING GIN (region_codes);
CREATE INDEX idx_store_loyalty_area_rules_depo_codes ON store_loyalty_area_rules USING GIN (depo_codes);
CREATE INDEX idx_store_loyalty_area_rules_priority ON store_loyalty_area_rules(loyalty_class_code, priority DESC);

