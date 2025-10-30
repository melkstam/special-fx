import { Hono } from "hono";
import { prettyJSON } from "hono/pretty-json";
import { requestId } from "hono/request-id";
import z from "zod";
import { ecbCurrencyCodeSchema, ecbRatesCacheWrapper } from "./ecb";
import { zValidator } from "./zod-validator";

// ECB does not fetch EUR since it's the base currency
const currencyCodeSchema = z.enum([...ecbCurrencyCodeSchema.options, "EUR"]);

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

app.get("/currencies", async (c) => {
  return c.json(currencyInformation);
});

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
    const { fromCurrency } = c.req.valid("param");
    const { amount } = c.req.valid("query");

    const data = await ecbRatesCacheWrapper(c.env.CACHE);

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

    // Dummy exchange rates for demonstration purposes
    return c.json({
      from: fromCurrency,
      date: data.date,
      rates: rates,
    });
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
    const { fromCurrency, toCurrency } = c.req.valid("param");
    const { amount } = c.req.valid("query");

    const data = await ecbRatesCacheWrapper(c.env.CACHE);

    // Include EUR in the rates object
    const rates = {
      ...data.rates,
      EUR: 1,
    };

    const rate = (rates[toCurrency] / rates[fromCurrency]) * amount;

    // Dummy exchange rates for demonstration purposes
    return c.json({
      from: fromCurrency,
      to: toCurrency,
      date: data.date,
      rate: rate,
    });
  },
);

export default app;
