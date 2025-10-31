import { createExecutionContext, env } from "cloudflare:test";
import { describe, expect, test, vi } from "vitest";
import app from "./index";

// Mock the ECB module to avoid external API calls
vi.mock("./ecb", () => ({
  ecbRatesCacheWrapper: vi.fn().mockResolvedValue({
    date: "2024-06-04",
    rates: {
      AUD: 1.6235,
      BGN: 1.9558,
      BRL: 5.4578,
      CAD: 1.4789,
      CHF: 0.9785,
      CNY: 7.8542,
      CZK: 24.5478,
      DKK: 7.4578,
      GBP: 0.8465,
      HKD: 8.4578,
      HUF: 385.47,
      IDR: 17456.78,
      ILS: 4.0547,
      INR: 90.5478,
      ISK: 148.57,
      JPY: 170.05,
      KRW: 1385.47,
      MXN: 18.2547,
      MYR: 5.1478,
      NOK: 11.7845,
      NZD: 1.7845,
      PHP: 62.5478,
      PLN: 4.2547,
      RON: 4.9758,
      SEK: 11.4523,
      SGD: 1.4625,
      THB: 39.5478,
      TRY: 32.4578,
      USD: 1.0847,
      ZAR: 19.6578,
    },
  }),
  ecbCurrencyCodeSchema: {
    options: [
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
    ],
  },
}));

describe("/currencies", () => {
  test("should get all currencies", async () => {
    const request = new Request("http://localhost/currencies");
    const ctx = createExecutionContext();
    const res = await app.fetch(request, env, ctx);

    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data).toHaveProperty("EUR");
    expect(data).toHaveProperty("USD");
    expect(data.EUR).toEqual({ code: "EUR", name: "Euro" });
    expect(data.USD).toEqual({ code: "USD", name: "United States Dollar" });
  });
});

describe("/:fromCurrency/latest", () => {
  test("should get exchange rates for USD", async () => {
    const request = new Request("http://localhost/USD/latest");
    const ctx = createExecutionContext();
    const res = await app.fetch(request, env, ctx);

    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data).toHaveProperty("from", "USD");
    expect(data).toHaveProperty("date", "2024-06-04");
    expect(data).toHaveProperty("rates");
    expect(data.rates).toHaveProperty("EUR");
    expect(data.rates).toHaveProperty("GBP");
  });

  test("should handle amount parameter", async () => {
    const request = new Request("http://localhost/USD/latest?amount=100");
    const ctx = createExecutionContext();
    const res = await app.fetch(request, env, ctx);

    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data).toHaveProperty("from", "USD");
    expect(data).toHaveProperty("rates");
    // Rates should be multiplied by 100
    expect(typeof data.rates.EUR).toBe("number");
  });

  test("should return 400 for invalid currency", async () => {
    const request = new Request("http://localhost/INVALID/latest");
    const ctx = createExecutionContext();
    const res = await app.fetch(request, env, ctx);

    expect(res.status).toBe(400);
  });
});

describe("/:fromCurrency/:toCurrency/latest", () => {
  test("should get specific currency conversion", async () => {
    const request = new Request("http://localhost/USD/EUR/latest");
    const ctx = createExecutionContext();
    const res = await app.fetch(request, env, ctx);

    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data).toHaveProperty("from", "USD");
    expect(data).toHaveProperty("to", "EUR");
    expect(data).toHaveProperty("date", "2024-06-04");
    expect(data).toHaveProperty("rate");
    expect(typeof data.rate).toBe("number");
  });

  test("should handle amount parameter for specific conversion", async () => {
    const request = new Request("http://localhost/USD/EUR/latest?amount=50");
    const ctx = createExecutionContext();
    const res = await app.fetch(request, env, ctx);

    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data).toHaveProperty("rate");
    expect(typeof data.rate).toBe("number");
  });

  test("should return 400 for invalid currencies", async () => {
    const request = new Request("http://localhost/INVALID/EUR/latest");
    const ctx = createExecutionContext();
    const res = await app.fetch(request, env, ctx);

    expect(res.status).toBe(400);
  });
});
