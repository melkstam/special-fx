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

/**
 * Get the next occurrence of 16:00 CET (Central European Time). This is roughly when the ECB updates its rates.
 */
function getNext16CET(): Date {
  const now = new Date();

  const next16CET = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      15, // 16:00 CET is 15:00 UTC
      0,
      0,
    ),
  );

  if (now >= next16CET) {
    next16CET.setUTCDate(next16CET.getUTCDate() + 1);
  }

  return next16CET;
}

interface EcbRateData {
  date: string; // YYYY-MM-DD
  rates: Record<z.infer<typeof ecbCurrencyCodeSchema>, number>;
}

export async function ecbRatesCacheWrapper(
  cache: KVNamespace,
): Promise<EcbRateData> {
  const cacheKey = "ecb-rates-daily";

  const cachedResponse = await cache.get(cacheKey, { type: "json" });
  if (cachedResponse) {
    return cachedResponse as EcbRateData;
  }

  const ratesData = await getEcbRates();

  // Cache the data until the next 16:00 CET
  const next16CET = getNext16CET();
  const expirationTime = Math.floor(next16CET.getTime() / 1000) - 5 * 60; // 5 minutes before next 16:00 CET in seconds since epoch

  await cache.put(cacheKey, JSON.stringify(ratesData), {
    expiration: expirationTime, // Expiration time in seconds since epoch
  });

  return ratesData;
}

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
