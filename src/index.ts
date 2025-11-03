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

// ECB does not fetch EUR since it's the base currency
const currencyCodeSchema = z.enum([...ecbCurrencyCodeSchema.options, "EUR"]);
const historicalCurrencyCodeSchema = z.enum([
  ...ecbHistoricalCurrencyCodeSchema.options,
  "EUR",
]);

interface CurrencyInformation {
  code: z.infer<typeof currencyCodeSchema>;
  name: string;
}

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

    // Include EUR in the rates object
    const rates = {
      ...data.rates,
      EUR: 1,
    };

    const baseRate = rates[fromCurrency];

    for (const key of currencyCodeSchema.options) {
      rates[key] /= baseRate;
    }

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

    // Include EUR in the rates object
    const rates = {
      ...data.rates,
      EUR: 1,
    };

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

    const historicalRates = data.rates.map((dayData) => {
      // Include EUR in the rates object for each day
      const rates = {
        ...dayData.rates,
        EUR: 1,
      };

      const rate =
        rates[toCurrency] && rates[fromCurrency]
          ? (rates[toCurrency] / rates[fromCurrency]) * amount
          : null;

      return [dayData.date, rate];
    });

    const res = c.json({
      from: fromCurrency,
      to: toCurrency,
      rates: Object.fromEntries(historicalRates),
    });

    // Historical data is updated once daily, cache for 24 hours
    const lastModifiedHeader = res.headers.get("Last-Modified");
    const lastModified = lastModifiedHeader
      ? new Date(lastModifiedHeader)
      : new Date();

    const cacheTtl = getEcbCacheTtl(new Date(), lastModified);
    res.headers.set(
      "Cache-Control",
      `public, max-age=${cacheTtl}, s-maxage=${cacheTtl}`,
    );

    if (data.lastModified) {
      res.headers.set("Last-Modified", data.lastModified.toUTCString());
    }

    await caches.default.put(c.req.raw, res.clone());

    return res;
  },
);

export default app;
