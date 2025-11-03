import { TZDate } from "@date-fns/tz";
import { addBusinessDays, differenceInSeconds } from "date-fns";
import { XMLParser } from "fast-xml-parser";
import z from "zod";

// Current currencies supported by ECB's daily exchange rate feed
// EUR is excluded as it's the base currency (always 1.0)
export const ecbCurrencyCodeSchema = z.enum([
  "AUD",
  "BGN",
  "BRL",
  "CAD",
  "CHF",
  "CNY",
  "CZK",
  "DKK",
  "GBP",
  "HKD",
  "HUF",
  "IDR",
  "ILS",
  "INR",
  "ISK",
  "JPY",
  "KRW",
  "MXN",
  "MYR",
  "NOK",
  "NZD",
  "PHP",
  "PLN",
  "RON",
  "SEK",
  "SGD",
  "THB",
  "TRY",
  "USD",
  "ZAR",
]);

// Historical currencies include deprecated ones (CYP, EEK, etc.) from ECB's historical dataset
// This covers currencies that were replaced by EUR or are no longer tracked
export const ecbHistoricalCurrencyCodeSchema = z.enum([
  "AUD",
  "BGN",
  "BRL",
  "CAD",
  "CHF",
  "CNY",
  "CYP",
  "CZK",
  "DKK",
  "EEK",
  "GBP",
  "HKD",
  "HRK",
  "HUF",
  "IDR",
  "ILS",
  "INR",
  "ISK",
  "JPY",
  "KRW",
  "LTL",
  "LVL",
  "MTL",
  "MXN",
  "MYR",
  "NOK",
  "NZD",
  "PHP",
  "PLN",
  "ROL",
  "RON",
  "RUB",
  "SEK",
  "SGD",
  "SIT",
  "SKK",
  "THB",
  "TRL",
  "TRY",
  "USD",
  "ZAR",
]);

// Schema for parsing ECB's daily XML feed structure
// ECB returns data in a nested XML format with gesmes namespace
const ecbDailyDataSchema = z.object({
  "gesmes:Envelope": z.object({
    Cube: z.object({
      Cube: z.object({
        "@_time": z.iso.date(), // Date in YYYY-MM-DD format
        Cube: z.array(
          z.object({
            "@_currency": ecbCurrencyCodeSchema,
            "@_rate": z.string().transform((val) => Number(val)), // ECB rates as strings, convert to numbers
          }),
        ),
      }),
    }),
  }),
});

interface EcbRateData {
  date: string; // YYYY-MM-DD
  lastModified: Date | undefined;
  rates: Record<z.infer<typeof ecbCurrencyCodeSchema>, number>;
}

const ecbHistoricalDataSchema = z.object({
  "gesmes:Envelope": z.object({
    Cube: z.object({
      Cube: z.array(
        z.object({
          "@_time": z.string(), // Date in YYYY-MM-DD format
          Cube: z.array(
            z.object({
              "@_currency": ecbHistoricalCurrencyCodeSchema,
              "@_rate": z.string().transform((val) => Number(val)), // Convert string rates to numbers
            }),
          ),
        }),
      ),
    }),
  }),
});

interface EcbHistoricalRateData {
  lastModified: Date | undefined;
  rates: Array<{
    date: string; // YYYY-MM-DD
    rates: Partial<
      Record<z.infer<typeof ecbHistoricalCurrencyCodeSchema>, number>
    >;
  }>;
}

/**
 * Calculate cache TTL based on ECB's update schedule.
 *
 * The ECB publishes new rates daily around 16:00 CET on business days.
 * We use smart caching to minimize API calls while ensuring fresh data:
 * - Before next expected update: cache until 15:50 CET the next business day
 * - After expected update time: short cache (1 minute) to allow quick pickup of new rates
 *
 * @param now Current timestamp
 * @param lastModified When the ECB data was last updated
 * @returns Cache TTL in seconds
 */
export function getEcbCacheTtl(now: Date, lastModified: Date): number {
  const nowInCet = new TZDate(now, "Europe/Berlin");

  const lastModifiedInCet = new TZDate(lastModified, "Europe/Berlin");
  const cutoffAfterLastModified = addBusinessDays(lastModifiedInCet, 1);
  cutoffAfterLastModified.setHours(15, 50, 0, 0);

  if (nowInCet < cutoffAfterLastModified) {
    // We are before the first cutoff time after last modified, then cache until next cutoff
    return differenceInSeconds(cutoffAfterLastModified, nowInCet);
  }

  // If we are passed the cutoff time, we only cache a short time (1 minute) in preparation for the next update
  return 60;
}

/**
 * Fetch and parse the latest exchange rates from ECB's daily XML feed.
 * Returns structured data with rates keyed by currency code.
 */
export async function getEcbRates(): Promise<EcbRateData> {
  const res = await ecbRatesCached();

  const xmlData = await res.text();
  const parser = new XMLParser({ ignoreAttributes: false }); // Keep XML attributes for currency codes and rates
  const jsonData = parser.parse(xmlData);

  const ratesData = ecbDailyDataSchema.parse(jsonData);

  // Sort currencies alphabetically for consistent output and convert to key-value pairs
  const ratesList = ratesData["gesmes:Envelope"].Cube.Cube.Cube.sort((a, b) =>
    a["@_currency"].localeCompare(b["@_currency"]),
  ).map((rate) => [rate["@_currency"], rate["@_rate"]]);

  const lastModifiedHeader = res.headers.get("Last-Modified");
  const lastModified = lastModifiedHeader
    ? new Date(lastModifiedHeader)
    : undefined;

  return {
    date: ratesData["gesmes:Envelope"].Cube.Cube["@_time"],
    lastModified: lastModified,
    rates: Object.fromEntries(ratesList),
  };
}

/**
 * Fetch ECB daily rates with Cloudflare cache layer.
 * Implements smart caching based on ECB's update schedule.
 */
async function ecbRatesCached(): Promise<Response> {
  // ECB's official daily exchange rate XML feed
  const requestUrl =
    "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";

  const cacheRes = await caches.default.match(requestUrl);
  if (cacheRes) {
    return cacheRes;
  }

  const res = await fetch(requestUrl);
  if (!res.ok) {
    throw new Error("Failed to fetch ECB rates");
  }

  const response = new Response(res.body, res);

  const lastModifiedHeader = res.headers.get("Last-Modified");
  const lastModified = lastModifiedHeader
    ? new Date(lastModifiedHeader)
    : new Date();

  // Use smart TTL based on ECB update schedule
  const cacheTtl = getEcbCacheTtl(new Date(), lastModified);
  response.headers.set("Cache-Control", `public, s-maxage=${cacheTtl}`);

  await caches.default.put(requestUrl, response.clone());

  return response;
}

/**
 * Fetch and parse historical exchange rates from ECB's 90-day XML feed.
 * Returns data sorted by date (newest first) with partial currency coverage per date.
 */
export async function getEcbHistoricalRates(): Promise<EcbHistoricalRateData> {
  const res = await ecbHistoricalRatesCached();

  const xmlData = await res.text();
  const parser = new XMLParser({ ignoreAttributes: false });
  const jsonData = parser.parse(xmlData);

  const historicalData = ecbHistoricalDataSchema.parse(jsonData);

  const lastModifiedHeader = res.headers.get("Last-Modified");
  const lastModified = lastModifiedHeader
    ? new Date(lastModifiedHeader)
    : undefined;

  // Process each day's data and sort currencies alphabetically
  const rates = historicalData["gesmes:Envelope"].Cube.Cube.map((dayData) => {
    const ratesList = dayData.Cube.sort((a, b) =>
      a["@_currency"].localeCompare(b["@_currency"]),
    ).map((rate) => [rate["@_currency"], rate["@_rate"]]);

    return {
      date: dayData["@_time"],
      rates: Object.fromEntries(ratesList),
    };
  }).sort((a, b) => b.date.localeCompare(a.date)); // Sort by date descending (newest first)

  return {
    lastModified,
    rates,
  };
}

/**
 * Fetch ECB historical rates with Cloudflare cache layer.
 * Uses the same smart caching strategy as daily rates.
 */
async function ecbHistoricalRatesCached(): Promise<Response> {
  // ECB's historical exchange rate XML feed (last 90 days)
  const requestUrl =
    "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist.xml";

  const cacheRes = await caches.default.match(requestUrl);
  if (cacheRes) {
    return cacheRes;
  }

  const res = await fetch(requestUrl);
  if (!res.ok) {
    throw new Error("Failed to fetch ECB historical rates");
  }

  const response = new Response(res.body, res);

  const lastModifiedHeader = res.headers.get("Last-Modified");
  const lastModified = lastModifiedHeader
    ? new Date(lastModifiedHeader)
    : new Date();

  const cacheTtl = getEcbCacheTtl(new Date(), lastModified);
  response.headers.set("Cache-Control", `public, s-maxage=${cacheTtl}`);

  await caches.default.put(requestUrl, response.clone());

  return response;
}
