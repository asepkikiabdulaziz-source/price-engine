# Login Hierarchy - Sistem Autentikasi

## Flow Login

1. **Pilih Region** - User memilih region dari dropdown
2. **Pilih Depo** - Setelah region dipilih, dropdown depo di-enable dan diisi berdasarkan region
3. **Input Kode Sales** - User input kode sales
4. **Input Password** - User input password

## Logic Login

1. Generate `login_code` = `{depo_code}-{kode_sales}`
2. Query `view_auth_session` dengan `login_code`
3. Validasi:
   - `slot_is_active = true`
   - `assignment_is_active = true`
   - `depo_id` sesuai dengan depo yang dipilih
   - Tanggal efektif assignment dan slot masih valid
4. Dapatkan `email` dari `view_auth_session`
5. Login ke **Supabase Auth** menggunakan `email` + `password`
6. Return user data dari `view_auth_session` + Supabase Auth user + session

## Format login_code

`login_code` di `view_auth_session` harus mengikuti format:
```
{depo_id}-{kode_sales}
```

Contoh:
- Depo: `DP001`
- Kode Sales: `SLS001`
- Login Code: `DP001-SLS001`

## Struktur View view_auth_session

View harus memiliki kolom:
- `login_code` (TEXT) - Format: `{depo_id}-{kode_sales}`
- `email` (TEXT) - Email untuk Supabase Auth
- `depo_id` (TEXT) - ID depo
- `slot_is_active` (BOOLEAN)
- `assignment_is_active` (BOOLEAN)
- `assignment_effective_date` (DATE)
- `assignment_end_date` (DATE)
- `slot_effective_date` (DATE)
- Kolom lain sesuai kebutuhan

## Session Management

- Session disimpan di `localStorage` dengan key `user_session`
- Session berisi data dari `view_auth_session` + Supabase Auth user + session
- Logout akan sign out dari Supabase Auth dan clear localStorage

## Catatan

- Password untuk Supabase Auth harus sama dengan password di sistem (atau sesuai konfigurasi)
- User harus terdaftar di Supabase Auth dengan email yang sesuai
- Email di `view_auth_session` harus match dengan email di Supabase Auth

