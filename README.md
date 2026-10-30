# Cafetaria De Zeeheld

Website van Cafetaria De Zeeheld, Paterswoldseweg 19, Groningen.

- `index.html`: website met menukaart, online bestellen (afhalen), ledenkorting en NL/EN
- `keuken.html`: keukenscherm voor binnenkomende bestellingen
- `js/menu-data.js`: menukaart en prijzen
- `js/shop.js`: openingstijden, afhaaltijden, korting, accounts en bestellingen

> Demo-modus: bestellingen en accounts worden in `localStorage` van de browser bewaard.
> Voor echte bestellingen moet `js/shop.js` aan een server/database gekoppeld worden.

## Lokaal bekijken

```powershell
powershell -ExecutionPolicy Bypass -File .claude/serve.ps1
```

Open daarna http://localhost:8137
