import { describe, expect, test } from "vitest";
import { getEcbCacheTtl } from "./ecb";

describe("getEcbCacheTtl", () => {
  test("should cache until cutoff when current time is before cutoff", () => {
    // Last modified: June 4, 2024 at 14:00 CET
    const lastModified = new Date("2024-06-04T12:00:00Z"); // 14:00 CET
    // Current time: June 5, 2024 at 10:00 CET (before 15:50 cutoff)
    const now = new Date("2024-06-05T08:00:00Z"); // 10:00 CET

    const ttl = getEcbCacheTtl(now, lastModified);

    // Should cache until 15:50 CET on June 5 (cutoff time)
    // From 10:00 to 15:50 = 5 hours 50 minutes = 21000 seconds
    expect(ttl).toBe(21000);
  });

  test("should cache for 60 seconds when current time is after cutoff", () => {
    // Last modified: June 4, 2024 at 14:00 CET
    const lastModified = new Date("2024-06-04T12:00:00Z"); // 14:00 CET
    // Current time: June 5, 2024 at 16:00 CET (after 15:50 cutoff)
    const now = new Date("2024-06-05T14:00:00Z"); // 16:00 CET

    const ttl = getEcbCacheTtl(now, lastModified);

    // Should cache for short time (60 seconds) as we're past cutoff
    expect(ttl).toBe(60);
  });

  test("should keep long cache window over the weekend", () => {
    // Last modified: Friday June 7, 2024 at 14:00 CEST
    const lastModified = new Date("2024-06-07T12:00:00Z");
    // Current time: Sunday June 9, 2024 at 12:00 CEST
    const now = new Date("2024-06-09T10:00:00Z");

    const ttl = getEcbCacheTtl(now, lastModified);

    // Expect caching to extend to Monday 15:50 CEST, not fall back to 60 seconds
    expect(ttl).toBe(100_200);
  });
});
