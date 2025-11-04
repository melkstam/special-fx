# Special FX API 🚥

A fast, reliable foreign exchange rate API powered by Cloudflare Workers and the European Central Bank (ECB) data.
Get real-time and historical currency exchange rates for major currencies.

**Base URL:** `https://specialfx.dev/`

## Quick Start

### Get All Available Currencies

```bash
curl "https://specialfx.dev/currencies"
```

### Convert Currency (Latest Rates)

```bash
# Convert 1 USD to all other currencies
curl "https://specialfx.dev/USD/latest"

# Convert 100 EUR to all other currencies
curl "https://specialfx.dev/EUR/latest?amount=100"

# Convert 50 GBP to USD
curl "https://specialfx.dev/GBP/USD/latest?amount=50"
```

### Get Historical Rates

```bash
# Get USD to EUR historical rates for the last 90 days
curl "https://specialfx.dev/USD/EUR/historical"

# Convert 1000 USD to EUR for all available historical dates
curl "https://specialfx.dev/USD/EUR/historical?amount=1000"
```

## API Endpoints

### `GET /currencies`

Returns all available currencies with their codes and human-readable names.

**Response:**
```json
{
  "AUD": { "code": "AUD", "name": "Australian Dollar" },
  "BGN": { "code": "BGN", "name": "Bulgarian Lev" },
  "BRL": { "code": "BRL", "name": "Brazilian Real" },
  "CAD": { "code": "CAD", "name": "Canadian Dollar" },
  "CHF": { "code": "CHF", "name": "Swiss Franc" },
  "CNY": { "code": "CNY", "name": "Chinese Yuan" },
  "CZK": { "code": "CZK", "name": "Czech Koruna" },
  "DKK": { "code": "DKK", "name": "Danish Krone" },
  "EUR": { "code": "EUR", "name": "Euro" },
  "GBP": { "code": "GBP", "name": "British Pound Sterling" },
  "HKD": { "code": "HKD", "name": "Hong Kong Dollar" },
  "HUF": { "code": "HUF", "name": "Hungarian Forint" },
  "IDR": { "code": "IDR", "name": "Indonesian Rupiah" },
  "ILS": { "code": "ILS", "name": "Israeli New Shekel" },
  "INR": { "code": "INR", "name": "Indian Rupee" },
  "ISK": { "code": "ISK", "name": "Icelandic Króna" },
  "JPY": { "code": "JPY", "name": "Japanese Yen" },
  "KRW": { "code": "KRW", "name": "South Korean Won" },
  "MXN": { "code": "MXN", "name": "Mexican Peso" },
  "MYR": { "code": "MYR", "name": "Malaysian Ringgit" },
  "NOK": { "code": "NOK", "name": "Norwegian Krone" },
  "NZD": { "code": "NZD", "name": "New Zealand Dollar" },
  "PHP": { "code": "PHP", "name": "Philippine Peso" },
  "PLN": { "code": "PLN", "name": "Polish Złoty" },
  "RON": { "code": "RON", "name": "Romanian Leu" },
  "SEK": { "code": "SEK", "name": "Swedish Krona" },
  "SGD": { "code": "SGD", "name": "Singapore Dollar" },
  "THB": { "code": "THB", "name": "Thai Baht" },
  "TRY": { "code": "TRY", "name": "Turkish Lira" },
  "USD": { "code": "USD", "name": "United States Dollar" },
  "ZAR": { "code": "ZAR", "name": "South African Rand" }
}
```

---

### `GET /{fromCurrency}/latest`

Get latest exchange rates from a base currency to all other currencies.

**Parameters:**
- `fromCurrency` (path) - Source currency code (e.g., USD, EUR, GBP)
- `amount` (query, optional) - Amount to convert (default: 1)

**Example:**
```bash
curl "https://specialfx.dev/USD/latest?amount=100"
```

**Response:**
```json
{
  "from": "USD",
  "date": "2025-11-04",
  "rates": {
    "AUD": 152.50,
    "BGN": 179.85,
    "BRL": 490.25,
    "CAD": 135.20,
    "CHF": 86.75,
    "CNY": 719.50,
    "CZK": 2245.80,
    "DKK": 685.40,
    "EUR": 92.15,
    "GBP": 79.25,
    "HKD": 781.20,
    "HUF": 35420.0,
    "IDR": 1563500.0,
    "ILS": 370.80,
    "INR": 8315.0,
    "ISK": 13785.0,
    "JPY": 14950.0,
    "KRW": 132450.0,
    "MXN": 1705.0,
    "MYR": 467.50,
    "NOK": 1063.0,
    "NZD": 162.80,
    "PHP": 5615.0,
    "PLN": 401.25,
    "RON": 458.50,
    "SEK": 1075.0,
    "SGD": 134.20,
    "THB": 3540.0,
    "TRY": 2945.0,
    "USD": 100.0,
    "ZAR": 1875.0
  }
}
```

---

### `GET /{fromCurrency}/{toCurrency}/latest`

Get latest exchange rate between two specific currencies.

**Parameters:**
- `fromCurrency` (path) - Source currency code
- `toCurrency` (path) - Target currency code
- `amount` (query, optional) - Amount to convert (default: 1)

**Example:**
```bash
curl "https://specialfx.dev/GBP/USD/latest?amount=500"
```

**Response:**
```json
{
  "from": "GBP",
  "to": "USD",
  "date": "2025-11-04",
  "rate": 631.65
}
```

---

### `GET /{fromCurrency}/{toCurrency}/historical`

Get historical exchange rates between two currencies for the last 90 days.

**Parameters:**
- `fromCurrency` (path) - Source currency code (supports historical currencies)
- `toCurrency` (path) - Target currency code (supports historical currencies)
- `amount` (query, optional) - Amount to convert for each date (default: 1)

**Historical Currency Support:**
In addition to current currencies, the historical endpoint supports deprecated currencies like:
- `CYP` (Cyprus Pound)
- `EEK` (Estonian Kroon)
- `HRK` (Croatian Kuna)
- `LTL` (Lithuanian Litas)
- `LVL` (Latvian Lats)
- `MTL` (Maltese Lira)
- `ROL` (Romanian Leu)
- `RUB` (Russian Ruble)
- `SIT` (Slovenian Tolar)
- `SKK` (Slovak Koruna)
- `TRL` (Turkish Lira)

**Example:**
```bash
curl "https://specialfx.dev/USD/EUR/historical?amount=1000"
```

**Response:**
```json
{
  "from": "USD",
  "to": "EUR",
  "rates": {
    "2025-11-04": 921.5,
    "2025-11-03": 920.8,
    "2025-11-02": 919.2,
    "2025-11-01": 918.7,
    "2025-10-31": 917.9,
    "2025-10-30": 916.5,
    "2025-10-29": 915.8,
    "2025-10-28": 914.2,
    "...": "..."
  }
}
```

**Note:** Some historical currency pairs may have `null` values for dates when the currency wasn't tracked or didn't exist.

---

## Pretty Print JSON

For better readability, add the `pretty` query parameter to any endpoint to get formatted JSON responses.

**Example:**
```bash
curl "https://specialfx.dev/USD/latest?amount=100&pretty"
```

## Data Source

This API uses exchange rate data from the **European Central Bank (ECB)**.

The ECB publishes daily reference exchange rates for various currencies against the Euro. The rates are updated every business day at around 16:00 CET.


## Rate Limits

Currently, the API does not enforce rate limits.

If you are kind and use the API responsibly, you can expect it to remain free and open for everyone.
