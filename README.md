# Online Oyunlar — Blackjack + 101 Okey

Siteye girişte oyun seçim ekranı vardır.

## Oyunlar

- **Blackjack:** 5 kişilik, mevcut casino sistemi.
- **101 Okey:** 4 kişilik, iki katlı ıstaka, serbest taş dizilimi, 101 açma, 5 çift açma, taş çekme/atma, yandan taş alma, masaya taş işleme ve skor.

## 101 Okey

- 106 taş kullanılır.
- Her oyuncuya 21 taş, başlayana 22 taş verilir.
- Başlayan oyuncu ilk turda taş çekmeden taş atabilir.
- Seri açmak için seçilen geçerli perlerin toplamı en az 101 olmalıdır.
- 5 çift ile açma desteklenir.
- El açıldıktan sonra masadaki geçerli perlere taş işleme desteklenir.
- Taşlar oyuncunun iki katlı ıstakasında sürükle-bırak ile istenen sıraya dizilebilir.
- Oyun sunucu tarafında hamle doğrulaması yapar.

## Kurulum

```bash
npm install
npm start
```

Render gibi servislerde start komutu `npm start` olmalıdır.

- Atılan taşlar artık yönlüdür: 1→2, 2→3, 3→4, 4→1; her kenarda ayrı bir deste olarak üst üste birikir.
