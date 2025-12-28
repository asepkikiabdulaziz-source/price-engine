# 🧪 Panduan Uji Aplikasi

## ✅ Prasyarat (Sudah Selesai)

1. ✅ Database schema sudah dibuat di Supabase
2. ✅ Data CSV sudah diimport ke database
3. ✅ Tools upload sudah teruji

## 🚀 Setup Aplikasi

### 1. Konfigurasi Credentials

Buka file `env.js` dan pastikan sudah diisi dengan credentials Supabase:

```javascript
export const SUPABASE_URL = 'https://your-project.supabase.co';
export const SUPABASE_ANON_KEY = 'your-anon-key';
```

**Cara mendapatkan credentials:**
1. Buka project di [Supabase Dashboard](https://supabase.com/dashboard)
2. Pergi ke Settings > API
3. Copy **Project URL** → paste ke `SUPABASE_URL`
4. Copy **anon/public key** → paste ke `SUPABASE_ANON_KEY`

### 2. Aktifkan Database Mode

Buka file `app.js`, pastikan **baris 14**:

```javascript
const DEV_MODE = false; // Set ke false untuk menggunakan database
```

### 3. Jalankan Aplikasi

**PENTING:** Aplikasi harus dijalankan melalui HTTP server (bukan buka file langsung), karena:
- Browser security (CORS)
- ES6 modules perlu HTTP protocol

#### Opsi 1: Menggunakan Script (Paling Mudah - Windows)

Double-click file `run-server.bat` di folder root, atau jalankan di terminal:

```bash
run-server.bat
```

Script akan otomatis menjalankan server di `http://localhost:8080`

**Untuk mengubah port:** Edit file `run-server.bat`, ubah nilai `PORT=8080` menjadi port yang diinginkan.

#### Opsi 2: Menggunakan Script (Linux/Mac)

```bash
chmod +x run-server.sh
./run-server.sh
```

Script akan otomatis menjalankan server di `http://localhost:8080`

**Untuk mengubah port:** Edit file `run-server.sh`, ubah nilai `PORT=8080` menjadi port yang diinginkan.

#### Opsi 3: Menggunakan Live Server (VS Code Extension) - Paling Mudah!

1. Install extension "Live Server" di VS Code
2. Klik kanan pada `index.html`
3. Pilih "Open with Live Server"
4. Browser akan otomatis terbuka

**Note:** Untuk mengubah port di Live Server, edit settings VS Code:
- `Live Server: Settings > Port` → set ke port yang diinginkan (default: 5500)

#### Opsi 4: Manual dengan Node.js

```bash
# Port default 8000
npx http-server -p 8000

# Atau port kustom (misal 8080 untuk menghindari bentrok)
npx http-server -p 8080

# Atau dengan host dan port spesifik
npx http-server -p 8080 -a localhost --cors
```

#### Opsi 5: Alternatif Lain (Optional)

```bash
# Jika sudah install Python
python -m http.server 8080

# Atau jika sudah install PHP
php -S localhost:8080
```

**Catatan:** 
- Jika port sudah digunakan oleh aplikasi lain, ubah ke port lain (misal: 8080, 3000, 5000)
- Gunakan Opsi 1 atau 3 (script/Live Server) yang paling mudah!

### 4. Buka di Browser

Buka browser dan akses:
- `http://localhost:8000` (jika menggunakan Python/Node.js)
- Atau URL yang ditampilkan oleh Live Server

## 🔐 Login

### Development Mode (Tanpa Login)

Jika ingin bypass login untuk testing:
1. Buka `app.js`, set `DEV_MODE = true` (baris 6)
2. Refresh browser
3. Aplikasi akan langsung masuk tanpa login

### Production Mode (Dengan Login)

1. Pastikan `DEV_MODE = false` di `app.js`
2. Buka aplikasi di browser
3. Login dengan akun Supabase:
   - Email dan password yang sudah terdaftar di Supabase Auth
   - Jika belum punya akun, buat dulu di Supabase Dashboard > Authentication

## ✅ Checklist Testing

### 1. Load Data Produk
- [ ] Produk muncul dari database
- [ ] Produk terkelompok berdasarkan product groups
- [ ] Harga produk muncul dengan format yang benar (Rp XXX.XXX)
- [ ] Unit produk (unit_1, unit_2, unit_3) muncul dengan benar

### 2. Form Input
- [ ] Store Type (Retail/Grosir) bisa dipilih
- [ ] Input quantity untuk setiap unit bisa diisi
- [ ] Tombol "Tambah" berfungsi

### 3. Error Handling
- [ ] Jika tidak ada data, muncul pesan yang jelas
- [ ] Jika database error, aplikasi tidak crash
- [ ] Error messages informatif

### 4. UI/UX
- [ ] Loading indicator muncul saat load data
- [ ] Produk di-render dengan rapih
- [ ] Responsive (bisa diakses dari mobile)

## 🐛 Troubleshooting

### Produk tidak muncul

**Penyebab:**
- Data belum diimport
- Credentials Supabase salah
- Tabel belum dibuat di database

**Solusi:**
1. Cek browser console (F12) untuk error messages
2. Pastikan credentials di `env.js` benar
3. Pastikan tabel sudah dibuat (jalankan `SCHEMA-CSV-FINAL.sql`)
4. Pastikan data sudah diimport menggunakan uploader

### Error: "Supabase not initialized"

**Penyebab:**
- `env.js` tidak ter-load
- Credentials kosong atau salah format

**Solusi:**
1. Pastikan `env.js` ada di root folder
2. Pastikan format credentials benar (string, bukan undefined)
3. Cek browser console untuk error detail

### Error: "Failed to fetch" atau CORS error

**Penyebab:**
- Browser block requests karena security
- Credentials salah

**Solusi:**
1. Gunakan HTTP server (jangan buka file langsung)
2. Pastikan credentials benar
3. Cek Supabase project settings (API access)

### Aplikasi stuck di loading

**Penyebab:**
- Database query terlalu lambat
- Network issue
- Data terlalu banyak

**Solusi:**
1. Cek browser console untuk error
2. Cek Network tab untuk melihat request status
3. Coba refresh halaman

## 📝 Catatan Penting

1. **Jangan lupa set `DEV_MODE = false`** untuk production
2. **Pastikan credentials Supabase benar** dan accessible
3. **Gunakan HTTP server** jangan buka file langsung (file://)
4. **Cek browser console** untuk debugging

## 🎯 Next Steps

Setelah aplikasi berjalan:
1. Test semua fitur dengan data real
2. Test perhitungan harga dan diskon
3. Test dengan berbagai skenario (retail vs grosir, dll)
4. Optimasi jika diperlukan (loading, caching, dll)
