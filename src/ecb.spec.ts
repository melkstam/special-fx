import { describe, expect, test } from "vitest";
import { getCacheOptions } from "./ecb";

describe("getCacheOptions", () => {
  test("should return 5 minutes when we have passed the cutoff but do not have the latest yet", () => {
    const now = new Date("2024-06-04T14:55:00Z"); // 12:00 CET
    const ecbDate = "2024-06-03";
    const options = getCacheOptions(now, ecbDate);

    expect(options).toHaveProperty("expirationTtl", 5 * 60);
  });

  test("should return 15:50 CET when we are far until date", () => {
    const now = new Date("2024-06-04T10:00:00Z"); // 12:00 CET
    const ecbDate = "2024-06-04";
    const options = getCacheOptions(now, ecbDate);
    const expectedExpiry = new Date("2024-06-04T13:50:00Z");

    const expectedExpiration = Math.floor(expectedExpiry.getTime() / 1000);

    expect(options).toHaveProperty("expiration", expectedExpiration);
  });

  test("should return 15:50 CET when have gotten todays rates", () => {
    const now = new Date("2024-06-04T13:55:00Z"); // 12:00 CET
    const ecbDate = "2024-06-04";
    const options = getCacheOptions(now, ecbDate);
    const expectedExpiry = new Date("2024-06-05T13:50:00Z");

    const expectedExpiration = Math.floor(expectedExpiry.getTime() / 1000);

    expect(options).toHaveProperty("expiration", expectedExpiration);
  });
});
