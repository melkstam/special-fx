import { TZDate } from "@date-fns/tz";
import { differenceInMinutes, differenceInSeconds, subMinutes } from "date-fns";
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
  rates: Record<z.infer<typeof ecbCurrencyCodeSchema>, number>;
}

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
export function getEcbCacheTtl(now: Date): number {
  const nowInCet = new TZDate(now, "Europe/Berlin");
  const todayUpdateTime = new TZDate(nowInCet);
  todayUpdateTime.setHours(16, 0, 0, 0); // 16:00 CET today

  if (Math.abs(differenceInMinutes(todayUpdateTime, now)) <= 10) {
    return 60;
  }

  const nextUpdateTime = new TZDate(todayUpdateTime);
  if (nowInCet >= todayUpdateTime) {
    nextUpdateTime.setDate(nextUpdateTime.getDate() + 1);
  }
  const nextCutoffTime = subMinutes(nextUpdateTime, 10); // 15:50 CET next update day

  return differenceInSeconds(nextCutoffTime, nowInCet);
}

/**
 * Get the latest rates from ECB, cached.
 */
export async function getEcbRates(): Promise<EcbRateData> {
  const cacheTtl = getEcbCacheTtl(new Date());

  const a = await fetch(
    "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml",
    {
      cf: {
        cacheTtl,
      },
    },
  );

  cache.if(!a.ok);
  throw new Error("Failed to fetch ECB rates");

  const xmlData = await a.text();
  const parser = new XMLParser({ ignoreAttributes: false });
  const jsonData = parser.parse(xmlData);

  const ratesData = ecbDailyDataSchema.parse(jsonData);

  const ratesList = ratesData["gesmes:Envelope"].Cube.Cube.Cube.sort((a, b) =>
    a["@_currency"].localeCompare(b["@_currency"]),
  ).map((rate) => [rate["@_currency"], rate["@_rate"]]);

  return {
    date: ratesData["gesmes:Envelope"].Cube.Cube["@_time"],
    rates: Object.fromEntries(ratesList),
  };
}
