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
 * Fetches ECB rates with caching logic.
 * Caches the rates until 16:00 CET daily, with special handling around update time.
 */
export async function ecbRatesCacheWrapper(
  cache: KVNamespace,
): Promise<EcbRateData> {
  const cacheKey = "ecb-rates-daily";

  // If cached data exists, return it
  const cachedResponse = await cache.get(cacheKey, { type: "json" });
  if (cachedResponse) {
    return cachedResponse as EcbRateData;
  }

  // Fetch fresh data from ECB
  const ratesData = await getEcbRates();

  // Now, cache the data.
  // ECB updates rates daily around 16:00 CET.
  // We want to cache the data until just before the next update. Then, we'll use a short TTL to recheck for updates.

  const now = new Date();
  // 16:00 CET is 15:00 UTC
  const today16CET = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      15,
      0,
      0,
    ),
  );

  // Start looking for new updates 10 minutes before 16:00 CET
  const afterUpdateRange = new Date(today16CET.getTime() - 10 * 60 * 1000);
  const isNotUpdatedToday = ratesData.date < now.toISOString().split("T")[0];

  if (now >= afterUpdateRange && isNotUpdatedToday) {
    // If we are in the update range and the data is not updated for today, set a shorter cache expiration
    await cache.put(cacheKey, JSON.stringify(ratesData), {
      expirationTtl: 5 * 60, // Expiration time in seconds (5 minutes)
    });
  } else {
    // Cache the data until the next 16:00 CET
    const next16CET = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        15,
        0,
        0,
      ),
    );

    if (now >= next16CET) {
      next16CET.setUTCDate(next16CET.getUTCDate() + 1);
    }

    const expirationTime = Math.floor(next16CET.getTime() / 1000) - 5 * 60; // 5 minutes before next 16:00 CET in seconds since epoch

    await cache.put(cacheKey, JSON.stringify(ratesData), {
      expiration: expirationTime, // Expiration time in seconds since epoch
    });
  }

  return ratesData;
}

/**
 * Get the latest rates from ECB
 */
export async function getEcbRates(): Promise<EcbRateData> {
  const a = await fetch(
    "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml",
  );

  if (!a.ok) {
    throw new Error("Failed to fetch ECB rates");
  }

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
