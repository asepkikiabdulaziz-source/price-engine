# Nabaticuan - Price Engine

Aplikasi simulasi harga dan diskon untuk sales dengan berbagai jenis promo.

## 📁 Struktur Folder

```
price-engine/
├── uploader/              # Tools untuk upload CSV ke Supabase
│   ├── import-csv.js     # Main import script
│   └── ...
├── tabel usulan/         # CSV files dan SQL schema
│   ├── SCHEMA-CSV-FINAL.sql  # SQL schema (jalankan di Supabase)
│   └── *.csv            # Data source files
├── app.js                # Application logic
├── auth.js               # Authentication (Supabase)
├── database.js           # Database operations (Supabase)
├── db.js                 # Local database (Dexie - offline sync)
├── index.html            # Frontend
└── ...
```

## 🚀 Quick Start

### 1. Setup Database

1. Buat project di [Supabase](https://supabase.com)
2. Dapatkan URL dan anon key dari Settings > API
3. Update `env.js` dengan credentials Supabase
4. Jalankan `tabel usulan/SCHEMA-CSV-FINAL.sql` di Supabase SQL Editor
5. Import data CSV menggunakan tools di folder `uploader/`

### 2. Import Data

```bash
cd uploader
npm install
node import-csv.js all  # atau IMPORT.bat
```

### 3. Run Application

1. Buka `env.js` dan pastikan Supabase credentials sudah benar
2. Set `DEV_MODE = false` di `app.js` (baris 14)

3. **Jalankan aplikasi melalui HTTP server** (penting untuk CORS dan ES modules):
   
   **Cara termudah - Windows:** Double-click `run-server.bat` (akan run di port 8080)
   
   **Cara termudah - VS Code:** Install extension "Live Server", lalu klik kanan `index.html` → "Open with Live Server"
   
   **Atau manual (pilih yang sudah terinstall):**
   ```bash
   # Node.js (recommended - jika sudah install Node.js)
   npx http-server -p 8080
   
   # Atau Python (jika sudah terinstall)
   python -m http.server 8080
   
   # Atau PHP (jika sudah terinstall)
   php -S localhost:8080
   ```
   
   **Catatan:** 
   - Python/PHP tidak wajib! Aplikasi ini murni JavaScript. Mereka hanya tools untuk menjalankan simple HTTP server lokal.
   - Jika port sudah digunakan aplikasi lain, ubah port di `run-server.bat` atau gunakan port lain (misal: 3000, 5000)
   - Untuk menghindari bentrok dengan aplikasi lain, aplikasi ini menggunakan localStorage key spesifik (`price_engine_user_session`)

4. Login dengan akun Supabase (atau set `DEV_MODE = true` untuk bypass login)

## 🔧 Development Mode

Untuk development tanpa database:
1. Set `DEV_MODE = true` di `app.js`
2. Aplikasi akan bypass authentication dan menggunakan dummy data

## 📚 Dokumentasi

- `UJI-APLIKASI.md` - Panduan uji aplikasi
- `tabel usulan/README.md` - Info tentang CSV dan SQL schema
- `uploader/README.md` - Panduan menggunakan uploader tools
