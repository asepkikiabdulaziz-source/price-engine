# Panduan Deploy Manual di Netlify

Panduan ini menjelaskan cara melakukan deploy manual di Netlify melalui dashboard.

## 🎯 Kapan Menggunakan Deploy Manual?

Deploy manual berguna ketika:
- Ingin deploy tanpa push ke GitHub
- Ingin trigger deploy ulang tanpa mengubah code
- Ingin clear cache dan deploy ulang
- Testing deployment dengan environment variables baru
- Fix build yang gagal tanpa perubahan code

## 📋 Prerequisites

- Akun Netlify (login ke [app.netlify.com](https://app.netlify.com))
- Site sudah terhubung dengan GitHub repository
- Environment variables sudah di-set di Netlify Dashboard

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

### Deploy Manual via Dashboard
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
