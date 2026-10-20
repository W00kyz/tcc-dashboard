import { expect, test as teardown } from "@playwright/test";

import {
  clearRunStart,
  countE2eLeftovers,
  countRunTraces,
  sweepE2eRecords,
} from "./support/cleanup";

// Runs after every spec, pass or fail: the dev database ends the run as it started.
teardown("remove every record the suite created", () => {
  sweepE2eRecords();
  expect(countE2eLeftovers()).toBe(0);
  expect(countRunTraces()).toBe(0);
  clearRunStart();
});
