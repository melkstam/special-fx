import { Hono } from "hono";

import { prettyJSON } from "hono/pretty-json";
import { requestId } from "hono/request-id";
import z from "zod";
import {
  ecbCurrencyCodeSchema,
  ecbHistoricalCurrencyCodeSchema,
  getEcbCacheTtl,
  getEcbHistoricalRates,
  getEcbRates,
} from "./ecb";
import { zValidator } from "./zod-validator";

// ECB does not include EUR in their data since it's the base currency (always 1.0)
// We add it to our schema to support EUR in API requests
const currencyCodeSchema = z.enum([...ecbCurrencyCodeSchema.options, "EUR"]);
const historicalCurrencyCodeSchema = z.enum([
  ...ecbHistoricalCurrencyCodeSchema.options,
  "EUR",
]);

interface CurrencyInformation {
  code: z.infer<typeof currencyCodeSchema>;
  name: string;
}

// Static currency information mapping - provides human-readable names for currency codes
const currencyInformation = {
  AUD: { code: "AUD", name: "Australian Dollar" },
  BGN: { code: "BGN", name: "Bulgarian Lev" },
  BRL: { code: "BRL", name: "Brazilian Real" },
  CAD: { code: "CAD", name: "Canadian Dollar" },
  CHF: { code: "CHF", name: "Swiss Franc" },
  CNY: { code: "CNY", name: "Chinese Yuan" },
  CZK: { code: "CZK", name: "Czech Koruna" },
  DKK: { code: "DKK", name: "Danish Krone" },
  GBP: { code: "GBP", name: "British Pound Sterling" },
  HKD: { code: "HKD", name: "Hong Kong Dollar" },
  HUF: { code: "HUF", name: "Hungarian Forint" },
  IDR: { code: "IDR", name: "Indonesian Rupiah" },
  ILS: { code: "ILS", name: "Israeli New Shekel" },
  INR: { code: "INR", name: "Indian Rupee" },
  ISK: { code: "ISK", name: "Icelandic Króna" },
  JPY: { code: "JPY", name: "Japanese Yen" },
  KRW: { code: "KRW", name: "South Korean Won" },
  MXN: { code: "MXN", name: "Mexican Peso" },
  MYR: { code: "MYR", name: "Malaysian Ringgit" },
  NOK: { code: "NOK", name: "Norwegian Krone" },
  NZD: { code: "NZD", name: "New Zealand Dollar" },
  PHP: { code: "PHP", name: "Philippine Peso" },
  PLN: { code: "PLN", name: "Polish Złoty" },
  RON: { code: "RON", name: "Romanian Leu" },
  SEK: { code: "SEK", name: "Swedish Krona" },
  SGD: { code: "SGD", name: "Singapore Dollar" },
  THB: { code: "THB", name: "Thai Baht" },
  TRY: { code: "TRY", name: "Turkish Lira" },
  USD: { code: "USD", name: "United States Dollar" },
  ZAR: { code: "ZAR", name: "South African Rand" },
  EUR: { code: "EUR", name: "Euro" },
} as const satisfies Record<
  z.infer<typeof currencyCodeSchema>,
  CurrencyInformation
>;

const app = new Hono<{ Bindings: Cloudflare.Env }>();

app.use(prettyJSON());
app.use(requestId());

// GET /currencies - Returns all available currencies with their codes and names
app.get(
  "/currencies",

  async (c) => {
    const cachedResponse = await caches.default.match(c.req.raw);

    if (cachedResponse) {
      return cachedResponse;
    }

    const response = c.json(currencyInformation);

    // Cache currencies for 24 hours since they don't change often
    const ttl = 24 * 60 * 60; // 24 hours
    response.headers.set(
      "Cache-Control",
      `public, max-age=${ttl}, s-maxage=${ttl}`,
    );

    await caches.default.put(c.req.raw, response.clone());

    return response;
  },
);

// GET /:fromCurrency/latest - Returns latest exchange rates from a base currency to all others
// Query param: amount (optional, default 1) - multiplies all rates by this amount
app.get(
  "/:fromCurrency/latest",
  zValidator(
    "param",
    z.object({
      fromCurrency: currencyCodeSchema,
    }),
  ),
  zValidator(
    "query",
    z.object({
      amount: z
        .string()
        .transform((val) => Number(val))
        .pipe(z.number())
        .default(1),
    }),
  ),

  async (c) => {
    const cachedResponse = await caches.default.match(c.req.raw);

    if (cachedResponse) {
      return cachedResponse;
    }

    const { fromCurrency } = c.req.valid("param");
    const { amount } = c.req.valid("query");

    const data = await getEcbRates();

    // ECB rates are always relative to EUR, so we add EUR=1 to complete the set
    const rates = {
      ...data.rates,
      EUR: 1,
    };

    // Convert from EUR-based rates to fromCurrency-based rates
    // If fromCurrency is USD and USD rate is 1.1, then 1 USD = 1/1.1 EUR
    const baseRate = rates[fromCurrency];

    // Divide all rates by the base rate to get rates relative to fromCurrency
    for (const key of currencyCodeSchema.options) {
      rates[key] /= baseRate;
    }

    // Apply the amount multiplier to all rates
    for (const key of currencyCodeSchema.options) {
      rates[key] *= amount;
    }

    const response = c.json({
      from: fromCurrency,
      date: data.date,
      rates: rates,
    });

    // Use ECB cache TTL based on last modified date
    const ttl = data.lastModified
      ? getEcbCacheTtl(new Date(), data.lastModified)
      : 3600;
    response.headers.set(
      "Cache-Control",
      `public, max-age=${ttl}, s-maxage=${ttl}`,
    );
    response.headers.set(
      "Last-Modified",
      (data.lastModified ?? new Date()).toUTCString(),
    );

    await caches.default.put(c.req.raw, response.clone());

    return response;
  },
);

// GET /:fromCurrency/:toCurrency/latest - Returns latest exchange rate between two specific currencies
// Query param: amount (optional, default 1) - amount to convert
app.get(
  "/:fromCurrency/:toCurrency/latest",
  zValidator(
    "param",
    z.object({
      fromCurrency: currencyCodeSchema,
      toCurrency: currencyCodeSchema,
    }),
  ),
  zValidator(
    "query",
    z.object({
      amount: z
        .string()
        .transform((val) => Number(val))
        .pipe(z.number())
        .default(1),
    }),
  ),

  async (c) => {
    const cachedResponse = await caches.default.match(c.req.raw);

    if (cachedResponse) {
      return cachedResponse;
    }

    const { fromCurrency, toCurrency } = c.req.valid("param");
    const { amount } = c.req.valid("query");

    const data = await getEcbRates();

    // ECB rates are always relative to EUR, so we add EUR=1 to complete the set
    const rates = {
      ...data.rates,
      EUR: 1,
    };

    // Calculate cross-currency rate: (toCurrency/EUR) / (fromCurrency/EUR) * amount
    const rate = (rates[toCurrency] / rates[fromCurrency]) * amount;

    const response = c.json({
      from: fromCurrency,
      to: toCurrency,
      date: data.date,
      rate: rate,
    });

    // Use ECB cache TTL based on last modified date
    const ttl = data.lastModified
      ? getEcbCacheTtl(new Date(), data.lastModified)
      : 3600;
    response.headers.set(
      "Cache-Control",
      `public, max-age=${ttl}, s-maxage=${ttl}`,
    );
    response.headers.set(
      "Last-Modified",
      (data.lastModified ?? new Date()).toUTCString(),
    );

    await caches.default.put(c.req.raw, response.clone());

    return response;
  },
);

// GET /:fromCurrency/:toCurrency/historical - Returns historical exchange rates between two currencies
// Returns rates for all available dates as date->rate pairs
// Note: Uses historicalCurrencyCodeSchema which includes deprecated currencies
app.get(
  "/:fromCurrency/:toCurrency/historical",
  zValidator(
    "param",
    z.object({
      fromCurrency: historicalCurrencyCodeSchema,
      toCurrency: historicalCurrencyCodeSchema,
    }),
  ),
  zValidator(
    "query",
    z.object({
      amount: z
        .string()
        .transform((val) => Number(val))
        .pipe(z.number())
        .default(1),
    }),
  ),
  async (c) => {
    const cachedResponse = await caches.default.match(c.req.raw);

    if (cachedResponse) {
      return cachedResponse;
    }

    const { fromCurrency, toCurrency } = c.req.valid("param");
    const { amount } = c.req.valid("query");

    const data = await getEcbHistoricalRates();

    // Process each day's historical data
    const historicalRates = data.rates.map((dayData) => {
      // ECB rates are always relative to EUR, so we add EUR=1 for each day
      const rates = {
        ...dayData.rates,
        EUR: 1,
      };

      // Calculate rate if both currencies exist for this date, otherwise null
      // Some historical currencies may not have data for all dates
      const rate =
        rates[toCurrency] && rates[fromCurrency]
          ? (rates[toCurrency] / rates[fromCurrency]) * amount
          : null;

      return [dayData.date, rate];
    });

    const response = c.json({
      from: fromCurrency,
      to: toCurrency,
      rates: Object.fromEntries(historicalRates),
    });

    const ttl = data.lastModified
      ? getEcbCacheTtl(new Date(), data.lastModified)
      : 3600;
    response.headers.set(
      "Cache-Control",
      `public, max-age=${ttl}, s-maxage=${ttl}`,
    );
    response.headers.set(
      "Last-Modified",
      (data.lastModified ?? new Date()).toUTCString(),
    );

    await caches.default.put(c.req.raw, response.clone());

    return response;
  },
);

export default app;
