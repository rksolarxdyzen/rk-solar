/**
 * Smoke tests for Accounts/Won pure logic (no DB).
 * Run: npx --yes tsx scripts/smoke-accounts-won.ts
 */
import assert from "node:assert/strict";
import {
  assertPaymentWithinQuoteCap,
  companySubsidyPendingAmount,
  milestoneRemaining,
  sumVerifiedByMilestone,
} from "../src/lib/accounts/receivables-math";
import { checkWonClosingGate } from "../src/lib/leads/won-gate";

function ok(name: string) {
  console.log(`  ✓ ${name}`);
}

// —— Payment cap ——
{
  const pass = assertPaymentWithinQuoteCap({
    projectTotal: 168000,
    existingNonRejectedTotal: 90000,
    newAmount: 78000,
  });
  assert.equal(pass.ok, true);
  ok("cap allows payment within quotation");

  const fail = assertPaymentWithinQuoteCap({
    projectTotal: 168000,
    existingNonRejectedTotal: 90000,
    newAmount: 80000,
  });
  assert.equal(fail.ok, false);
  if (!fail.ok) assert.match(fail.message, /exceeds quotation/i);
  ok("cap rejects payment over quotation");

  const replace = assertPaymentWithinQuoteCap({
    projectTotal: 100000,
    existingNonRejectedTotal: 100000,
    newAmount: 100000,
    replacingAmount: 100000,
  });
  assert.equal(replace.ok, true);
  ok("cap allows replacing pending row at same amount");

  const noQuote = assertPaymentWithinQuoteCap({
    projectTotal: null,
    existingNonRejectedTotal: 0,
    newAmount: 1000,
  });
  assert.equal(noQuote.ok, false);
  ok("cap blocks when no quotation/plan total");
}

// —— Milestone / subsidy math ——
{
  const verified = sumVerifiedByMilestone([
    { milestone: "token", amount: 90000, verification_status: "verified" },
    { milestone: "pre_dispatch", amount: 50000, verification_status: "pending" },
    { milestone: "final", amount: 10000, verification_status: "rejected" },
  ]);
  assert.equal(verified.token, 90000);
  assert.equal(verified.pre_dispatch, 0);
  assert.equal(verified.final, 0);
  ok("only verified payments count toward milestone sums");

  assert.equal(milestoneRemaining(90000, 90000), 0);
  assert.equal(milestoneRemaining(90000, 40000), 50000);
  ok("milestone remaining math");

  assert.equal(
    companySubsidyPendingAmount({
      companyBearsSubsidy: true,
      subsidyAmountAtWon: 78000,
      subsidyVerifiedAt: null,
    }),
    78000
  );
  assert.equal(
    companySubsidyPendingAmount({
      companyBearsSubsidy: true,
      subsidyAmountAtWon: 78000,
      subsidyVerifiedAt: "2026-09-01T00:00:00Z",
    }),
    0
  );
  assert.equal(
    companySubsidyPendingAmount({
      companyBearsSubsidy: false,
      subsidyAmountAtWon: 78000,
      subsidyVerifiedAt: null,
    }),
    0
  );
  ok("company subsidy pending respects checkbox + verified");
}

// —— Won gate ——
{
  const base = {
    panelName: "Adani 540W",
    panelQuantity: 6,
    inverterCompany: "Polycab",
    tokenAmount: 50000,
    preDispatchAmount: 50000,
    finalAmount: 68000,
    consumerNumber: "GEB12345",
    companyBearsSubsidy: true,
  };
  const docs = ["electricity_bill", "customer_id"];

  const pass = checkWonClosingGate(base, docs);
  assert.equal(pass.passed, true, pass.blockedReasons.join("; "));
  ok("Won gate passes with consumer + subsidy checkbox");

  const noConsumer = checkWonClosingGate({ ...base, consumerNumber: "12" }, docs);
  assert.equal(noConsumer.passed, false);
  assert.ok(noConsumer.blockedReasons.some((r) => /consumer/i.test(r)));
  ok("Won gate requires consumer number");

  const noCheckbox = checkWonClosingGate(
    { ...base, companyBearsSubsidy: undefined as unknown as boolean },
    docs
  );
  assert.equal(noCheckbox.passed, false);
  ok("Won gate requires subsidy checkbox boolean");
}

console.log("\nAll smoke tests passed.");
