import { TZDate } from "@date-fns/tz";
import { addBusinessDays, differenceInSeconds } from "date-fns";
import { XMLParser } from "fast-xml-parser";
import z from "zod";

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

const ecbDailyDataSchema = z.object({
  "gesmes:Envelope": z.object({
    Cube: z.object({
      Cube: z.object({
        "@_time": z.iso.date(), // YYYY-MM-DD
        Cube: z.array(
          z.object({
            "@_currency": ecbCurrencyCodeSchema,
            "@_rate": z.string().transform((val) => Number(val)),
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
          "@_time": z.string(), // YYYY-MM-DD
          Cube: z.array(
            z.object({
              "@_currency": ecbHistoricalCurrencyCodeSchema,
              "@_rate": z.string().transform((val) => Number(val)),
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
 * Calculate cache options based on current time and latest fetch date.
 *
 * The ECB updates rates daily at around 16:00 CET.
 *
 * So, if now is between last modified and the next business day's 15:50 CET, we cache until that cutoff.
 * If now is after the first business-day cutoff after last modified, we cache for a short window while waiting for the new rates.
 *
 * @param now Current timestamp
 * @param lastModified The date of last updated
 * @returns Cache options for Workers KV
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
 * Get the latest rates from ECB, cached.
 */
export async function getEcbRates(): Promise<EcbRateData> {
  const res = await ecbRatesCached();

  const xmlData = await res.text();
  const parser = new XMLParser({ ignoreAttributes: false });
  const jsonData = parser.parse(xmlData);

  const ratesData = ecbDailyDataSchema.parse(jsonData);

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
 * Fetches the ECB rates, with a cache
 */
async function ecbRatesCached(): Promise<Response> {
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

  const cacheTtl = getEcbCacheTtl(new Date(), lastModified);
  response.headers.set("Cache-Control", `public, s-maxage=${cacheTtl}`);

  await caches.default.put(requestUrl, response.clone());

  return response;
}

/**
 * Get historical rates from ECB, cached.
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
 * Fetches the ECB historical rates, with a cache
 */
async function ecbHistoricalRatesCached(): Promise<Response> {
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
