import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { prettyJSON } from "hono/pretty-json";
import { requestId } from "hono/request-id";
import z from "zod";

const currencyCodeSchema = z.enum([
  "AUD",
  "BGN",
  "BRL",
  "CAD",
  "CHF",
  "CNY",
  "CZK",
  "DKK",
  "EUR",
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
  async (c) => {
    const { fromCurrency } = c.req.valid("param");

    // Dummy exchange rates for demonstration purposes
    return c.json({
      from: fromCurrency,
      rates: {
        EUR: 0.85,
        USD: 1.0,
        JPY: 110.0,
      },
      date: new Date().toISOString().split("T")[0],
    });
  },
);

export default app;
