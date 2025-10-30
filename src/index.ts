import { zValidator } from "@hono/zod-validator";

import { Hono } from "hono";
import { prettyJSON } from "hono/pretty-json";
import { requestId } from "hono/request-id";
import z from "zod";
import { ecbCurrencyCodeSchema, getEcbRates } from "./ecb";

// ECB does not fetch EUR since it's the base currency
const currencyCodeSchema = z.enum([...ecbCurrencyCodeSchema.options, "EUR"]);

const app = new Hono();

app.use(prettyJSON());
app.use(requestId());

app.get("/", (c) => {
  return c.text("Hello Hono!");
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

    // Dummy exchange rates for demonstration purposes
    return c.json({
      from: fromCurrency,
      date: data.date,
      rates: rates,
    });
  },
);

export default app;
