# 📦 Install Node.js untuk Import CSV

## 🚀 Quick Install

### Option 1: Download & Install (Recommended)

1. **Download Node.js:**
   - Buka: https://nodejs.org/
   - Pilih **LTS version** (v20.x atau v18.x)
   - Download installer untuk Windows

2. **Install:**
   - Run installer yang sudah didownload
   - Ikuti wizard (Next, Next, Install)
   - **Penting:** Centang "Add to PATH" (biasanya sudah default)

3. **Restart PowerShell/Terminal:**
   - Tutup PowerShell yang sedang digunakan
   - Buka PowerShell baru

4. **Verify:**
   ```powershell
   node --version
   npm --version
   ```

---

### Option 2: Install via Chocolatey (Jika sudah punya Chocolatey)

```powershell
choco install nodejs
```

---

### Option 3: Install via Winget (Windows 10/11)

```powershell
winget install OpenJS.NodeJS.LTS
```

---

## ✅ Setelah Node.js Terinstall

1. **Buka PowerShell di folder scripts:**
   ```powershell
   cd "d:\PROJECT\JKS-ENGINE\price-engine\scripts"
   ```

2. **Install dependencies:**
   ```powershell
   npm install
   ```

3. **Run import:**
   ```powershell
   npm run import
   ```

---

## ❓ Troubleshooting

### Masih "npm is not recognized" setelah install?

1. **Restart PowerShell** (close dan open baru)
2. **Check PATH:**
   ```powershell
   $env:PATH -split ';' | Where-Object { $_ -like '*node*' }
   ```
3. **Jika Node.js sudah terinstall tapi tidak di PATH:**
   - Buka System Properties → Environment Variables
   - Edit PATH, tambahkan: `C:\Program Files\nodejs\`
   - Restart PowerShell

### Verify Node.js Location:

```powershell
# Check common locations
Test-Path "C:\Program Files\nodejs\node.exe"
Test-Path "C:\Program Files (x86)\nodejs\node.exe"
```

---

## 📝 Note

Jika tidak ingin install Node.js sekarang, Anda bisa:
- Import data manual via Supabase Dashboard (Table Editor → Import CSV)
- Atau gunakan script alternatif (Python, dll)

---

**Download Node.js:** https://nodejs.org/

