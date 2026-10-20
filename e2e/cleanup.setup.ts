import { expect, test as setup } from "@playwright/test";

import {
  countE2eLeftovers,
  countRunTraces,
  markRunStart,
  sweepE2eRecords,
} from "./support/cleanup";

// Runs before any sign-in (the "prepare" project). An interrupted run never reaches the
// teardown: its records, and the traces inside its window, go before this run starts.
setup("remove records left by an interrupted run, then open this run's window", () => {
  sweepE2eRecords();
  expect(countE2eLeftovers()).toBe(0);
  expect(countRunTraces()).toBe(0);
  markRunStart();
});
