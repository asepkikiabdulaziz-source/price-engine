// File baru: js/store.js
(function(window) {
    'use strict';

    // 1. Ini adalah "brankas" data terpusat kita
    const _state = {
        // [Poin 5] Siapa Anda Sebenarnya (Data dari Login)
        identity: {
            currentUserData: null,
            currentPICData: null,
            access_level: "SALES" // Default ke SALES
        },
        
        // [Poin 5] Siapa yang Anda Simulasikan (Data dari Dropdown)
        simulation: {
            zona: null,
            region: null,
            depo: null,
            tipeToko: "",
            tipeUser: "", 
            kelasPelanggan: ""
        },
        
        // [Poin 4] State Aplikasi
        allProducts: [],
        keranjang: new Map(),
        
        // [Poin 4] Cache data master promo
        promos: {
            strata: [],
            reguler: [],
            cod: [],
            deal_khusus: []
        }
    };

    // 2. Definisikan Fungsi untuk MENGUBAH data (Setters)
    
    /**
     * [PERBAIKAN LOGIKA]
     * Membedakan state awal untuk SALES, REGIONAL, dan CENTRAL.
     */
    const setUser = (userData, picData) => {
        _state.identity.currentUserData = userData;
        _state.identity.currentPICData = picData;
        
        // ▼▼▼ [PERBAIKAN LOGIKA] ▼▼▼
        
        // Tentukan access_level DULUAN
        // (Pastikan 'userData.access_level' sesuai ejaan di Firestore Anda)
        const accessLevel = userData.access_level || "SALES"; 
        _state.identity.access_level = accessLevel;
        
        if (accessLevel === "SALES") {
            // Sales: Inherit everything
            _state.simulation.zona = userData.ZONA || null;
            _state.simulation.region = userData.REGION || null;
            _state.simulation.depo = userData.DEPO || null;
            _state.simulation.tipeToko = userData.TYPE || "";
            _state.simulation.tipeUser = ""; // Sales tidak pakai ini
        } else if (accessLevel === "REGIONAL") {
            // Regional: Inherit Zona/Region, Tipe User "ALL", blank Depo/TipeToko
            _state.simulation.zona = userData.ZONA || null;
            _state.simulation.region = userData.REGION || null;
            _state.simulation.depo = ""; // Mulai kosong
            _state.simulation.tipeToko = ""; // Mulai kosong
            _state.simulation.tipeUser = "ALL"; // Terkunci ALL
        } else { // (CENTRAL)
            // Central: Start completely blank
            _state.simulation.zona = ""; 
            _state.simulation.region = "";
            _state.simulation.depo = "";
            _state.simulation.tipeToko = ""; 
            _state.simulation.tipeUser = "";
        }
        // ▲▲▲ [BATAS PERBAIKAN] ▲▲▲
    };

    /**
     * [Poin 5] Fungsi untuk mengubah konteks simulasi dari dropdown admin.
     */
    const setSimulationContext = (context) => {
        _state.simulation.zona = context.zona;
        _state.simulation.region = context.region;
        _state.simulation.depo = context.depo;
        _state.simulation.tipeToko = context.tipeToko;
        _state.simulation.tipeUser = context.tipeUser;
        _state.simulation.kelasPelanggan = context.kelasPelanggan;
    };

    /**
     * [Poin 4] Menyimpan data master produk.
     */
    const setAllProducts = (products) => {
        _state.allProducts = products;
    };
    
    /**
     * [Poin 4] Menyimpan data master promo.
     */
    const setMasterPromo = (tipe, data) => {
        if (_state.promos.hasOwnProperty(tipe)) {
            _state.promos[tipe] = data || [];
        }
    };

    /**
     * [Poin 4] Menggantikan window.keranjang.set() dan .delete().
     */
    const updateCart = (sku, itemData) => {
        if (itemData) {
            _state.keranjang.set(sku, itemData);
        } else {
            _state.keranjang.delete(sku); // Jika itemData null, hapus
        }
    };

    /**
     * [Poin 4] Mengosongkan keranjang.
     */
    const clearCart = () => {
        _state.keranjang.clear();
    };


    // 3. Definisikan Fungsi untuk MEMBACA data (Getters)
    
    const getCart = () => _state.keranjang;
    const getAllProducts = () => _state.allProducts;
    
    /**
     * [Poin 5] Getter untuk identitas asli (untuk UI).
     */
    const getIdentity = () => _state.identity;
    
    /**
     * [Poin 4 & 5] Getter untuk master promo.
     */
    const getMasterPromo = (tipe) => _state.promos[tipe] || [];
    
    /**
     * [Poin 4 & 5] Fungsi super-helper: Mengembalikan konteks SIMULASI.
     * Semua kalkulasi HARUS menggunakan ini.
     */
    const getContext = () => {
        return {
            // Data diambil dari _state.simulation
            selectedType: _state.simulation.tipeToko,
            selectedKelas: _state.simulation.kelasPelanggan,
            userZona: _state.simulation.zona,
            userRegion: _state.simulation.region,
            userDepo: _state.simulation.depo,
            selectedTipeUser: _state.simulation.tipeUser,
            
            // currentUserData (dari identitas) masih dipakai untuk filter area
            currentUserData: _state.identity.currentUserData 
        };
    };

    // 4. "Ekspos" semua fungsi ini ke 'window' dalam satu objek rapi
    window.AppStore = {
        // Setters
        setUser,
        setSimulationContext,
        setAllProducts,
        setMasterPromo,
        updateCart,
        clearCart,
        
        // Getters
        getCart,
        getAllProducts,
        getIdentity,
        getMasterPromo,
        getContext
    };

})(window);