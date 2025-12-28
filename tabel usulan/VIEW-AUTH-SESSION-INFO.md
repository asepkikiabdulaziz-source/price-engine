# View: view_auth_session

## Struktur Kolom

| column_name               | data_type | Deskripsi |
| ------------------------- | --------- | --------- |
| id                        | uuid      | User ID |
| email                     | text      | Email user |
| login_code                | text      | Login code (bisa digunakan untuk login) |
| password_text             | text      | Password (plain text atau hash, perlu validasi) |
| nik                       | text      | NIK user |
| full_name                 | text      | Nama lengkap |
| slot_id                   | text      | ID slot |
| job_title                 | text      | Jabatan |
| depo_id                   | text      | ID depo |
| region_id                 | text      | ID region |
| branch_id                 | text      | ID branch |
| slot_is_active            | boolean   | Status aktif slot |
| slot_effective_date       | date      | Tanggal efektif slot |
| role_level                | text      | Level role/akses |
| assigned_nik              | text      | NIK yang di-assign |
| assignment_is_active      | boolean   | Status aktif assignment |
| assignment_effective_date | date      | Tanggal efektif assignment |
| assignment_end_date       | date      | Tanggal akhir assignment |

## Logic Login

1. User bisa login menggunakan **email** atau **login_code**
2. Password dibandingkan dengan **password_text** (plain text comparison)
3. Validasi:
   - `slot_is_active = true`
   - `assignment_is_active = true`
   - `assignment_effective_date <= today`
   - `assignment_end_date >= today` (jika ada)
   - `slot_effective_date <= today`
4. Session disimpan di localStorage (bukan Supabase Auth session)
5. Return data user (tanpa password_text)

## Catatan

- Password comparison menggunakan plain text (jika perlu hash, update di auth.js)
- Session management menggunakan localStorage (bukan Supabase Auth)
- User info termasuk lokasi (depo_id, region_id, branch_id) dan role_level untuk authorization

