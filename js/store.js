// Centralized State Management for Price Engine
// Mirror dari kalkulator/js/store.js, disederhanakan untuk price-engine
(function(window) {
    'use strict';

    // 1. State terpusat
    const _state = {
        // Identity (Data dari Login)
        identity: {
            currentUser: null
        },
        
        // Master Data (dari Supabase, di-cache di localStorage)
        masterData: {
            products: [],
            prices: new Map(), // Map<zoneCode, prices[]>
            productGroups: [],
            productGroupMembers: [],
            productGroupAvailability: [],
            bundlePromos: [],
            bundlePromoGroups: [],
            groupPromos: [],
            groupPromoTiers: [],
            principalDiscountTiers: [],
            invoiceDiscounts: [],
            freeProductPromos: [],
            promoAvailability: [],
            loyaltyClasses: [],
            loyaltyAvailability: []
        },
        
        // Cart (Map<productId, cartItem>)
        cart: new Map(),
        
        // Store Type & Loyalty Class
        storeType: 'grosir', // Default
        loyaltyClass: ''
    };

    // 2. Setters

    /**
     * Set current user
     */
    const setUser = (userData) => {
        _state.identity.currentUser = userData;
    };

    /**
     * Set master products
     */
    const setProducts = (products) => {
        _state.masterData.products = products || [];
    };

    /**
     * Set prices for a zone
     */
    const setPrices = (zoneCode, prices) => {
        _state.masterData.prices.set(zoneCode, prices || []);
    };

    /**
     * Set product groups
     */
    const setProductGroups = (groups) => {
        _state.masterData.productGroups = groups || [];
    };

    /**
     * Set product group members
     */
    const setProductGroupMembers = (members) => {
        _state.masterData.productGroupMembers = members || [];
    };

    /**
     * Set product group availability
     */
    const setProductGroupAvailability = (availability) => {
        _state.masterData.productGroupAvailability = availability || [];
    };

    /**
     * Set bundle promos
     */
    const setBundlePromos = (promos) => {
        _state.masterData.bundlePromos = promos || [];
    };

    /**
     * Set bundle promo groups
     */
    const setBundlePromoGroups = (groups) => {
        _state.masterData.bundlePromoGroups = groups || [];
    };

    /**
     * Set group promos
     */
    const setGroupPromos = (promos) => {
        _state.masterData.groupPromos = promos || [];
    };

    /**
     * Set group promo tiers
     */
    const setGroupPromoTiers = (tiers) => {
        _state.masterData.groupPromoTiers = tiers || [];
    };

    /**
     * Set principal discount tiers
     */
    const setPrincipalDiscountTiers = (tiers) => {
        _state.masterData.principalDiscountTiers = tiers || [];
    };

    /**
     * Set invoice discounts
     */
    const setInvoiceDiscounts = (discounts) => {
        _state.masterData.invoiceDiscounts = discounts || [];
    };

    /**
     * Set free product promos
     */
    const setFreeProductPromos = (promos) => {
        _state.masterData.freeProductPromos = promos || [];
    };

    /**
     * Set promo availability
     */
    const setPromoAvailability = (availability) => {
        _state.masterData.promoAvailability = availability || [];
    };

    /**
     * Set loyalty classes
     */
    const setLoyaltyClasses = (classes) => {
        _state.masterData.loyaltyClasses = classes || [];
    };

    /**
     * Set loyalty availability
     */
    const setLoyaltyAvailability = (availability) => {
        _state.masterData.loyaltyAvailability = availability || [];
    };

    /**
     * Update cart item
     */
    const updateCart = (productId, itemData) => {
        if (itemData) {
            _state.cart.set(productId, itemData);
        } else {
            _state.cart.delete(productId);
        }
    };

    /**
     * Clear cart
     */
    const clearCart = () => {
        _state.cart.clear();
    };

    /**
     * Set store type
     */
    const setStoreType = (storeType) => {
        _state.storeType = storeType || 'grosir';
    };

    /**
     * Set loyalty class
     */
    const setLoyaltyClass = (loyaltyClass) => {
        _state.loyaltyClass = loyaltyClass || '';
    };

    // 3. Getters

    const getUser = () => _state.identity.currentUser;
    const getProducts = () => _state.masterData.products;
    const getPrices = (zoneCode) => _state.masterData.prices.get(zoneCode) || [];
    const getProductGroups = () => _state.masterData.productGroups;
    const getProductGroupMembers = () => _state.masterData.productGroupMembers;
    const getProductGroupAvailability = () => _state.masterData.productGroupAvailability;
    const getBundlePromos = () => _state.masterData.bundlePromos;
    const getBundlePromoGroups = () => _state.masterData.bundlePromoGroups;
    const getGroupPromos = () => _state.masterData.groupPromos;
    const getGroupPromoTiers = () => _state.masterData.groupPromoTiers;
    const getPrincipalDiscountTiers = () => _state.masterData.principalDiscountTiers;
    const getInvoiceDiscounts = () => _state.masterData.invoiceDiscounts;
    const getFreeProductPromos = () => _state.masterData.freeProductPromos;
    const getPromoAvailability = () => _state.masterData.promoAvailability;
    const getLoyaltyClasses = () => _state.masterData.loyaltyClasses;
    const getLoyaltyAvailability = () => _state.masterData.loyaltyAvailability;
    const getCart = () => _state.cart;
    const getStoreType = () => _state.storeType;
    const getLoyaltyClass = () => _state.loyaltyClass;

    // 4. Export ke window
    window.AppStore = {
        // Setters
        setUser,
        setProducts,
        setPrices,
        setProductGroups,
        setProductGroupMembers,
        setProductGroupAvailability,
        setBundlePromos,
        setBundlePromoGroups,
        setGroupPromos,
        setGroupPromoTiers,
        setPrincipalDiscountTiers,
        setInvoiceDiscounts,
        setFreeProductPromos,
        setPromoAvailability,
        setLoyaltyClasses,
        setLoyaltyAvailability,
        updateCart,
        clearCart,
        setStoreType,
        setLoyaltyClass,
        
        // Getters
        getUser,
        getProducts,
        getPrices,
        getProductGroups,
        getProductGroupMembers,
        getProductGroupAvailability,
        getBundlePromos,
        getBundlePromoGroups,
        getGroupPromos,
        getGroupPromoTiers,
        getPrincipalDiscountTiers,
        getInvoiceDiscounts,
        getFreeProductPromos,
        getPromoAvailability,
        getLoyaltyClasses,
        getLoyaltyAvailability,
        getCart,
        getStoreType,
        getLoyaltyClass
    };

})(window);

