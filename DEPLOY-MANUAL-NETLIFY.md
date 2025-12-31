# Panduan Deploy Manual di Netlify

Panduan ini menjelaskan cara melakukan deploy manual di Netlify, **dengan atau tanpa GitHub repository**.

## 🎯 Kapan Menggunakan Deploy Manual?

Deploy manual berguna ketika:
- Ingin deploy **tanpa GitHub repository** (drag & drop files)
- Ingin trigger deploy ulang tanpa mengubah code
- Ingin clear cache dan deploy ulang
- Testing deployment dengan environment variables baru
- Fix build yang gagal tanpa perubahan code
- Deploy dari local files tanpa push ke Git

## 📋 Prerequisites

- Akun Netlify (login ke [app.netlify.com](https://app.netlify.com))
- File project siap (jika deploy tanpa GitHub)
- Environment variables sudah di-set di Netlify Dashboard

## 🚀 Deploy Manual TANPA GitHub Repository (Drag & Drop)

Metode ini paling mudah untuk deploy tanpa menggunakan GitHub.

### Step 1: Siapkan File untuk Deploy

1. **Build project lokal** (generate `env.js` dari environment variables):
   ```bash
   # Set environment variables di terminal
   export SUPABASE_URL="https://dthgezcoklarfwbzkqym.supabase.co"
   export SUPABASE_ANON_KEY="your-key-here"
   
   # Run build script
   npm run build
   ```

2. **Atau buat `env.js` manual** jika tidak ada build script:
   Buat file `env.js` di root project dengan isi:
   ```javascript
   export const SUPABASE_URL = 'https://dthgezcoklarfwbzkqym.supabase.co';
   export const SUPABASE_ANON_KEY = 'your-key-here';
   ```

3. **Siapkan folder deploy** yang berisi file-file berikut:
   ```
   deploy-folder/
   ├── index.html
   ├── app.js
   ├── auth.js
   ├── database.js
   ├── calculation.js
   ├── validation.js
   ├── logger.js
   ├── env.js          ← Pastikan sudah di-generate dengan credentials
   ├── style.css
   ├── sw.js
   ├── manifest.json
   ├── netlify.toml
   ├── package.json
   └── js/
       └── store.js
   ```

### Step 2: Deploy via Drag & Drop

1. **Login ke Netlify Dashboard**
   - Buka [app.netlify.com](https://app.netlify.com)
   - Login dengan akun Anda

2. **Pilih Deploy Method**
   - Di dashboard, cari bagian **"Sites"**
   - Jika sudah ada site: klik **"Add new site"** → **"Deploy manually"**
   - Jika belum ada site: langsung lihat area **"Want to deploy a new site without connecting to Git? Drag and drop your site output folder here"**

3. **Drag & Drop Folder**
   - Drag folder yang sudah disiapkan (berisi file-file deploy) ke area drop zone
   - Atau klik area drop zone untuk browse folder
   - Netlify akan otomatis upload dan deploy

4. **Tunggu Deploy Selesai**
   - Netlify akan menunjukkan progress upload dan deploy
   - Setelah selesai, site akan live di URL: `https://random-name.netlify.app`

5. **Set Custom Domain (Optional)**
   - Site settings → Domain settings → Add custom domain

### Step 3: Set Environment Variables (Penting!)

Jika menggunakan build script, environment variables harus di-set **sebelum build lokal**.

Jika deploy manual tanpa build script:
- Environment variables **tidak bisa di-set via dashboard** untuk drag & drop deploy
- Harus sudah include di `env.js` yang di-deploy
- **Catatan**: Ini kurang aman karena credentials ada di file

**Rekomendasi**: Gunakan build script lokal atau Netlify CLI (lihat metode berikutnya)

## 🛠️ Deploy Manual dengan Netlify CLI (Tanpa GitHub)

Netlify CLI memungkinkan deploy dari local files dengan tetap bisa menggunakan environment variables.

### Step 1: Install Netlify CLI

```bash
# Install via npm (pastikan Node.js sudah terinstall)
npm install -g netlify-cli

# Atau via yarn
yarn global add netlify-cli
```

### Step 2: Login ke Netlify

```bash
netlify login
```

Ini akan membuka browser untuk autentikasi.

### Step 3: Build Project Lokal

```bash
# Set environment variables
export SUPABASE_URL="https://dthgezcoklarfwbzkqym.supabase.co"
export SUPABASE_ANON_KEY="your-key-here"

# Build project (generate env.js)
npm run build
```

### Step 4: Deploy ke Netlify

```bash
# Deploy ke production
netlify deploy --prod

# Atau deploy draft dulu untuk test
netlify deploy
```

### Step 5: Set Environment Variables di Netlify (Jika perlu)

Setelah site dibuat, set environment variables via dashboard:

1. Netlify Dashboard → Site settings → Environment variables
2. Add variables:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
3. Deploy ulang jika perlu (untuk build dengan env vars)

## 🔄 Update Deploy Manual (Tanpa GitHub)

### Update via Drag & Drop (Site Baru Setiap Kali)

1. Build ulang project lokal (update files)
2. Netlify Dashboard → Add new site → Deploy manually
3. Drag & drop folder baru
4. Netlify akan membuat site baru (atau replace yang lama jika di site yang sama)

### Update via Netlify CLI (Site yang Sama)

1. Update files lokal
2. Build ulang jika perlu:
   ```bash
   npm run build
   ```
3. Deploy:
   ```bash
   netlify deploy --prod
   ```
4. Netlify akan update site yang sama

### Update via Netlify Dashboard (Jika Site Sudah Ada)

1. Netlify Dashboard → Site → Deploys
2. Trigger deploy → Deploy manually
3. Upload files baru

## 📋 Deploy Manual dengan GitHub Repository (Trigger Deploy)

Jika site sudah terhubung dengan GitHub, gunakan metode ini untuk trigger deploy manual:

## 🚀 Cara Deploy Manual

### Metode 1: Trigger Deploy dari Deployments Tab (Paling Mudah)

1. **Login ke Netlify Dashboard**
   - Buka [app.netlify.com](https://app.netlify.com)
   - Login dengan akun Anda

2. **Pilih Site**
   - Klik pada site `price-engine` (atau nama site Anda)

3. **Buka Deployments Tab**
   - Klik tab **"Deploys"** atau **"Deployments"** di menu atas

4. **Trigger Deploy**
   - Klik tombol **"Trigger deploy"** di pojok kanan atas
   - Pilih salah satu opsi:
     - **"Clear cache and deploy site"** - Recommended untuk fix masalah cache
     - **"Deploy site"** - Deploy tanpa clear cache

5. **Pilih Branch**
   - Pilih branch yang ingin di-deploy (biasanya `main` atau `master`)
   - Klik **"Deploy"**

6. **Tunggu Deploy Selesai**
   - Monitor progress di Deployments tab
   - Status akan berubah dari "Building" → "Published" jika berhasil
   - Jika gagal, klik pada deploy untuk melihat error logs

### Metode 2: Trigger Deploy dari Site Overview

1. **Buka Site Overview**
   - Login ke Netlify Dashboard
   - Pilih site `price-engine`

2. **Cari Tombol Trigger Deploy**
   - Di bagian atas, cari dropdown **"Production deploys"** atau **"Deploys"**
   - Klik tombol **"Trigger deploy"** → **"Clear cache and deploy site"**

3. **Follow Steps 5-6 dari Metode 1**

### Metode 3: Menggunakan Build Hooks (Advanced)

Build hooks memungkinkan trigger deploy dari external service atau API.

1. **Setup Build Hook**
   - Site settings → **Build & deploy** → **Build hooks**
   - Klik **"Add build hook"**
   - Isi:
     - **Name**: `manual-deploy` atau nama yang diinginkan
     - **Branch**: `main` (atau branch yang diinginkan)
   - Klik **"Save"**

2. **Copy Build Hook URL**
   - Copy URL yang di-generate (format: `https://api.netlify.com/build_hooks/xxxxx`)

3. **Trigger Deploy via Build Hook**
   - **Dari Browser**: Buka URL build hook di browser (GET request akan trigger deploy)
   - **Dari cURL**: 
     ```bash
     curl -X POST -d {} https://api.netlify.com/build_hooks/xxxxx
     ```
   - **Dari JavaScript**:
     ```javascript
     fetch('https://api.netlify.com/build_hooks/xxxxx', { method: 'POST' });
     ```

## 🔧 Konfigurasi Build Settings

Pastikan build settings sudah benar:

### Build Command
```
npm run build
```

### Publish Directory
```
/
```

### Base Directory
```
(leave empty)
```

### Environment Variables
Pastikan sudah di-set di:
- Site settings → **Environment variables**
- Variables yang diperlukan:
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`

## ✅ Checklist Deploy Manual

Sebelum trigger deploy manual:

- [ ] Environment variables sudah di-set dengan benar
- [ ] Build settings sudah benar (dari `netlify.toml` atau dashboard)
- [ ] Branch yang dipilih adalah branch yang benar (biasanya `main`)
- [ ] Code sudah di-push ke GitHub (jika deploy dari GitHub)
- [ ] Sudah pilih "Clear cache and deploy site" jika ada masalah cache

Setelah deploy:

- [ ] Deploy status menunjukkan "Published"
- [ ] Site bisa diakses dan berfungsi dengan benar
- [ ] Login berfungsi
- [ ] Database connection berfungsi
- [ ] Tidak ada error di browser console

## 🐛 Troubleshooting

### Problem: Deploy Gagal

**Solusi:**
1. Klik pada deploy yang gagal untuk melihat error logs
2. Cek build logs untuk error message
3. Common issues:
   - Environment variables tidak di-set → Set di Netlify Dashboard
   - Build command error → Cek `package.json` dan `build.js`
   - Node version mismatch → Set Node version di Netlify (Settings → Build & deploy → Environment → Node version)

### Problem: Deploy Berhasil tapi Site Tidak Update

**Solusi:**
1. Clear browser cache
2. Gunakan "Clear cache and deploy site" di deploy berikutnya
3. Hard refresh browser (Ctrl+Shift+R atau Cmd+Shift+R)
4. Cek apakah deploy benar-benar selesai (status "Published")

### Problem: Build Timeout

**Solusi:**
1. Build timeout default adalah 15 menit
2. Jika build terlalu lama, cek:
   - Apakah ada infinite loop di build script?
   - Apakah dependency download terlalu lama?
   - Coba build lokal untuk debug: `npm run build`

### Problem: Environment Variables Tidak Terbaca

**Solusi:**
1. Pastikan variable names benar (case-sensitive):
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
2. Trigger deploy ulang setelah set environment variables
3. Environment variables hanya tersedia saat build time, bukan runtime

## 📝 Catatan Penting

1. **Auto Deploy**: Netlify secara default auto-deploy dari GitHub. Deploy manual berguna untuk override atau trigger ulang.

2. **Cache**: Netlify cache build artifacts. Gunakan "Clear cache and deploy site" jika ada masalah yang terkait cache.

3. **Environment Variables**: Set di Netlify Dashboard. Perubahan environment variables memerlukan trigger deploy baru untuk diterapkan.

4. **Build Logs**: Selalu cek build logs jika deploy gagal. Logs akan menunjukkan error yang spesifik.

5. **Deploy Preview**: Setiap PR akan otomatis generate deploy preview. Tidak perlu deploy manual untuk testing PR.

## 🎯 Quick Reference

### Deploy Manual TANPA GitHub (Drag & Drop)
1. Siapkan folder dengan file-file project
2. Netlify Dashboard → Add new site → Deploy manually
3. Drag & drop folder ke drop zone
4. Tunggu deploy selesai

### Deploy Manual TANPA GitHub (Netlify CLI)
1. `npm install -g netlify-cli`
2. `netlify login`
3. `npm run build` (dengan env vars)
4. `netlify deploy --prod`

### Deploy Manual DENGAN GitHub (Trigger Deploy)
1. Netlify Dashboard → Site → Deploys
2. Click "Trigger deploy" → "Clear cache and deploy site"
3. Pilih branch → Deploy

### Deploy via Build Hook
1. Site settings → Build hooks → Add build hook
2. Copy URL
3. Trigger via GET/POST request ke URL

### Check Deploy Status
- Netlify Dashboard → Site → Deploys tab
- Status: Building → Published (success) atau Failed (error)

### View Build Logs
- Netlify Dashboard → Site → Deploys → Click pada deploy
- Scroll ke bawah untuk melihat full build logs

## 📚 Resources

- [Netlify Deploy Documentation](https://docs.netlify.com/site-deploys/create-deploys/)
- [Netlify Build Hooks](https://docs.netlify.com/configure-builds/build-hooks/)
- [Netlify Environment Variables](https://docs.netlify.com/environment-variables/overview/)
