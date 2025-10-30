import { zValidator as zv } from "@hono/zod-validator";
import type { ValidationTargets } from "hono";

import type { ZodType } from "zod";

/**
 * A wrapper around Hono's zValidator to standardize validation error responses.
 */
export const zValidator = <
  T extends ZodType,
  Target extends keyof ValidationTargets,
>(
  target: Target,
  schema: T,
) =>
  zv(target, schema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          message: "Validation Error",
          issues: result.error.issues,
        },
        400,
      );
    }
  });
