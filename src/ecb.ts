import { TZDate } from "@date-fns/tz";
import { add, differenceInSeconds } from "date-fns";
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

/**
 * Calculate cache options based on current time and latest fetch date.
 *
 * The ECB updates rates daily at around 16:00 CET.
 *
 * So, if we are after 15:50 CET and don't have today's rates yet, we cache only a short time.
 *
 * If we have the most recent rates, we cache until the next 15:50 CET.
 *
 * @param now Current timestamp
 * @param latestFetchDate The date of the latest fetched rates in YYYY-MM-DD format
 * @returns Cache options for Workers KV
 */
// export function getCacheOptions(
//   now: Date,
//   latestFetchDate: string,
// ): { expirationTtl: number } | { expiration: number } {
//   const nowInCet = new TZDate(now, "Europe/Berlin");
//   const todayUpdateTime = new TZDate(nowInCet);
//   todayUpdateTime.setHours(16, 0, 0, 0); // 16:00 CET today
//   const cutoffTime = subMinutes(todayUpdateTime, 10); // 15:50 CET today

//   const haveTodaysRates =
//     formatISO(nowInCet, { representation: "date" }) === latestFetchDate;

//   if (!haveTodaysRates && nowInCet >= cutoffTime) {
//     // We are close to update time but don't have today's rates yet. We cache for 5 minutes.
//     const ttlSeconds = 5 * 60;
//     return { expirationTtl: ttlSeconds };
//   }

//   // Now, we either have today's rates, or it's not close to update time.
//   // Cache until the next 16:00 CET.

//   if (nowInCet >= cutoffTime) {
//     // It's past today's update time, so set to tomorrow 16:00 CET
//     todayUpdateTime.setDate(todayUpdateTime.getDate() + 1);
//   }

//   const nextCutoffTime = subMinutes(todayUpdateTime, 10); // 15:50 CET next update day

//   // Set expiration to next cutoff time
//   return { expiration: Math.floor(nextCutoffTime.getTime() / 1000) };
// }

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

/**
 * Calculate cache options based on current time and latest fetch date.
 *
 * The ECB updates rates daily at around 16:00 CET.
 *
 * So, if now is between last modified and 15:50 CET, we cache until 15:50 CET.
 * If now is after the first 15:50 CET after last modified, we cache until next day's 15:50 CET.
 *
 * @param now Current timestamp
 * @param lastModified The date of last updated
 * @returns Cache options for Workers KV
 */
export function getEcbCacheTtl(now: Date, lastModified: Date): number {
  const nowInCet = new TZDate(now, "Europe/Berlin");

  const lastModifiedInCet = new TZDate(lastModified, "Europe/Berlin");
  const cutoffAfterLastModified = add(lastModifiedInCet, { days: 1 });
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
