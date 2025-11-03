import { createExecutionContext, env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import app from "./index";

// Mock the ECB module to avoid external API calls
vi.mock("./ecb", () => ({
  getEcbRates: vi.fn().mockResolvedValue({
    date: "2024-06-04",
    lastModified: new Date("2024-06-04T16:00:00Z"),
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
  getEcbCacheTtl: vi.fn().mockReturnValue(3600),
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
  afterEach(async () => {
    // Clear caches between tests
    await caches.default.delete("http://localhost/currencies");
  });

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

  test("should cache currencies response with 24 hour TTL", async () => {
    const request = new Request("http://localhost/currencies");
    const ctx = createExecutionContext();
    const res = await app.fetch(request, env, ctx);

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe(
      "public, max-age=86400, s-maxage=86400",
    );
  });

  test("should serve from cache on subsequent requests", async () => {
    const request = new Request("http://localhost/currencies");
    const ctx = createExecutionContext();

    // First request
    const res1 = await app.fetch(request, env, ctx);
    expect(res1.status).toBe(200);

    // Second request should be served from cache
    const res2 = await app.fetch(request, env, ctx);
    expect(res2.status).toBe(200);

    // Should have same response data
    const data1 = await res1.json();
    const data2 = await res2.json();
    expect(data1).toEqual(data2);
  });
});

describe("/:fromCurrency/latest", () => {
  afterEach(async () => {
    // Clear caches between tests
    await caches.default.delete("http://localhost/USD/latest");
    await caches.default.delete("http://localhost/USD/latest?amount=100");
  });

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

  test("should cache exchange rates with ECB TTL", async () => {
    const request = new Request("http://localhost/USD/latest");
    const ctx = createExecutionContext();
    const res = await app.fetch(request, env, ctx);

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe(
      "public, max-age=3600, s-maxage=3600",
    );
    expect(res.headers.get("Last-Modified")).toBeTruthy();
  });

  test("should cache different amounts separately", async () => {
    const ctx = createExecutionContext();

    // Request with default amount (1)
    const request1 = new Request("http://localhost/USD/latest");
    const res1 = await app.fetch(request1, env, ctx);
    expect(res1.status).toBe(200);

    // Request with amount=100
    const request2 = new Request("http://localhost/USD/latest?amount=100");
    const res2 = await app.fetch(request2, env, ctx);
    expect(res2.status).toBe(200);

    const data1 = await res1.json();
    const data2 = await res2.json();

    // Rates should be different (multiplied by amount)
    expect(data2.rates.EUR).toBe(data1.rates.EUR * 100);
  });
});

describe("/:fromCurrency/:toCurrency/latest", () => {
  afterEach(async () => {
    // Clear caches between tests
    await caches.default.delete("http://localhost/USD/EUR/latest");
    await caches.default.delete("http://localhost/USD/EUR/latest?amount=50");
  });

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

  test("should cache specific conversion with ECB TTL", async () => {
    const request = new Request("http://localhost/USD/EUR/latest");
    const ctx = createExecutionContext();
    const res = await app.fetch(request, env, ctx);

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe(
      "public, max-age=3600, s-maxage=3600",
    );
    expect(res.headers.get("Last-Modified")).toBeTruthy();
  });

  test("should cache different currency pairs separately", async () => {
    const ctx = createExecutionContext();

    // Request USD to EUR
    const request1 = new Request("http://localhost/USD/EUR/latest");
    const res1 = await app.fetch(request1, env, ctx);
    expect(res1.status).toBe(200);

    // Request EUR to USD
    const request2 = new Request("http://localhost/EUR/USD/latest");
    const res2 = await app.fetch(request2, env, ctx);
    expect(res2.status).toBe(200);

    const data1 = await res1.json();
    const data2 = await res2.json();

    // Should have different currency pairs
    expect(data1.from).toBe("USD");
    expect(data1.to).toBe("EUR");
    expect(data2.from).toBe("EUR");
    expect(data2.to).toBe("USD");
  });
});
