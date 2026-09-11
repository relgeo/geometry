# RelGeo Geometry

Library matematika geometri 2D tingkat bawah untuk ekosistem RelGeo.

Package ini menampung operasi geometri analitik yang dipakai oleh runtime dan renderer RelGeo, seperti intersection, path math, bounding behavior, dan utilitas bentuk dasar.

Package ini bukan source of truth bahasa, tetapi ia menopang implementasi kontrak aktif repo saat ini, yaitu `RelGeo DSL v0.5`.

Metadata package `@relgeo/geometry` saat ini adalah `0.5.0`, pada compatibility line RelGeo DSL `v0.5`. Patch release dapat bergerak mandiri; perubahan kontrak bahasa akan dinaikkan bersama ke line berikutnya.

Status packaging saat ini:

* package ini adalah low-level library surface
* package publik tersedia melalui npm sebagai `@relgeo/geometry`
* ia tetap merupakan low-level library dan bukan onboarding surface utama bagi pengguna baru

Pakai package ini jika Anda ingin:

* memakai utilitas geometri 2D analitik tingkat rendah
* berbagi logika intersection atau path math lintas runtime/renderer
* memisahkan numerics dari kontrak DSL tingkat atas

Jika yang Anda butuhkan adalah DSL RelGeo itu sendiri, mulai dari `@relgeo/core`, bukan dari package ini.

Dalam monorepo ini:

```bash
pnpm install
```

Peran package ini di repo:

* fondasi numerik untuk `@relgeo/core`
* fondasi geometri untuk `@relgeo/renderer-svg`
* tempat yang tepat untuk logika 2D analitik yang tidak seharusnya bercampur dengan kontrak DSL

Dokumen terkait:

* kontrak bahasa aktif: `RelGeo DSL v0.5`, disajikan melalui website pada `/docs/language-spec/`
* dokumentasi publik dan contoh penggunaan: [relgeo.github.io](https://relgeo.github.io/)
