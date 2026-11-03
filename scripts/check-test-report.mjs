import { readFileSync } from 'node:fs';

if (!process.argv[2]) throw Error('Usage: node scripts/check-test-report.mjs <vitest-json-report>');
const report = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const assertions = (report.testResults ?? []).flatMap(result => result.assertionResults ?? []);
if (report.success !== true || !Number.isInteger(report.numTotalTests) || report.numTotalTests <= 0
  || report.numPassedTests !== report.numTotalTests || report.numFailedTests !== 0
  || report.numPendingTests !== 0 || report.numTodoTests !== 0
  || report.numFailedTestSuites !== 0 || report.numPendingTestSuites !== 0
  || assertions.length !== report.numTotalTests || assertions.some(result => result.status !== 'passed')) {
  throw Error('Full verification requires a nonempty test run with no failed, skipped or todo tests');
}
console.log(`Verified ${report.numPassedTests} tests with no failures or skips.`);
