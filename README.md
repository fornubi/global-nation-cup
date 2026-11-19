# global-nation-cup-2026
HTML5 Football Game

## Struktur Folder

```
.
├── index.html                  # Halaman utama game
├── css/
│   └── style.css               # Styling UI
├── data/
│   └── teams.json              # Data tim (dimuat lewat fetch)
└── js/
    ├── teams-data.js           # Data tim cadangan (dipakai saat dibuka via file://)
    ├── config.js               # Konstanta ukuran canvas, lapangan, gawang
    ├── state.js                # State global game (skor, waktu, mode, input, dll.)
    ├── entities/
    │   ├── ball.js             # Bola: fisika, deteksi gol & bola keluar
    │   ├── player.js           # Pemain: state, input manusia, aksi (pass/shoot/slide)
    │   ├── player-ai.js        # AI pemain: keputusan, posisi, set piece
    │   └── player-render.js    # Gambar sprite & animasi pemain
    ├── input/
    │   └── gamepad.js          # Dukungan controller
    ├── ui/
    │   ├── menu.js             # Menu: mode, difficulty, pilih tim & jersey
    │   └── hud.js              # HUD: skor, timer, pesan, info pemain
    ├── render/
    │   └── renderer.js         # Render lapangan, kamera, selebrasi gol
    ├── core/
    │   ├── match.js            # Alur pertandingan: kickoff, babak, gol, set piece, full time
    │   ├── replay.js           # Rekam & putar ulang gol
    │   └── loop.js             # Game loop & update per frame
    ├── modes/
    │   └── penalty.js          # Adu penalti
    └── main.js                 # Entry point: init, keyboard, debug hooks
```

File JS dimuat sebagai `<script>` biasa (bukan ES module) agar game tetap bisa dibuka
langsung via `file://`. Semua file berbagi scope global, jadi **urutan `<script>` di
`index.html` penting**: `config.js` & `state.js` paling awal, `player.js` sebelum
`player-ai.js`/`player-render.js`, dan `main.js` paling akhir.

## Menjalankan

Buka `index.html` langsung di browser, atau jalankan server lokal agar `data/teams.json` bisa dimuat:

```
npx serve .
```
