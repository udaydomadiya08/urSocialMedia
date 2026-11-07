'use strict';

/**
 * INSAY Social Platforms Suite — Master Verification Runner
 * Runs the test suites for all 5 platforms sequentially and produces a unified report.
 */

const { spawn } = require('child_process');
const path = require('path');

const SUITES = [
  { name: 'INSAYGRAM', dir: path.join(__dirname, '..', 'apps', 'insaygram'), script: 'tests/run_tests.js' },
  { name: 'INSAYBOOK', dir: path.join(__dirname, '..', 'apps', 'insaybook'), script: 'tests/run_tests.js' },
  { name: 'INSAYSNAP', dir: path.join(__dirname, '..', 'apps', 'insaysnap'), script: 'tests/run_tests.js' },
  { name: 'INSAYTOK', dir: path.join(__dirname, '..', 'apps', 'insaytok'), script: 'tests/run_tests.js' },
  { name: 'INSAYCORD', dir: path.join(__dirname, '..', 'apps', 'insaycord'), script: 'tests/run_tests.js' }
];

async function runSuite(suite) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const child = spawn(process.execPath, [suite.script], {
      cwd: suite.dir,
      env: { ...process.env, NODE_ENV: 'test' }
    });

    let output = '';
    child.stdout.on('data', d => {
      output += d.toString();
      process.stdout.write(d);
    });
    child.stderr.on('data', d => {
      output += d.toString();
      process.stderr.write(d);
    });

    child.on('close', code => {
      const durationMs = Date.now() - startTime;
      // Parse passed and failed numbers
      const match = output.match(/Passed:\s*(\d+)\s*\|\s*Failed:\s*(\d+)/) ||
                    output.match(/(\d+)\s+passed,\s+(\d+)\s+failed/i);

      let passed = 0;
      let failed = 0;
      if (match) {
        passed = parseInt(match[1], 10);
        failed = parseInt(match[2], 10);
      } else if (code === 0) {
        passed = 1;
      } else {
        failed = 1;
      }

      resolve({
        name: suite.name,
        code,
        passed,
        failed,
        total: passed + failed,
        durationMs
      });
    });
  });
}

async function runAll() {
  console.log(`\n========================================================================`);
  console.log(`         INSAY ECOSYSTEM MASTER QUALITY ASSURANCE RUNNER               `);
  console.log(`========================================================================\n`);

  const results = [];
  for (const s of SUITES) {
    const res = await runSuite(s);
    results.push(res);
  }

  console.log(`\n========================================================================`);
  console.log(`                       EXECUTIVE QA AUDIT SUMMARY                       `);
  console.log(`========================================================================`);
  console.log(`| Platform   | Total Tests | Passed | Failed | Duration   | Status     |`);
  console.log(`|------------|-------------|--------|--------|------------|------------|`);

  let totalTests = 0;
  let totalPassed = 0;
  let totalFailed = 0;
  let totalDuration = 0;

  results.forEach(r => {
    totalTests += r.total;
    totalPassed += r.passed;
    totalFailed += r.failed;
    totalDuration += r.durationMs;

    const statusStr = r.failed === 0 ? '✔ VERIFIED' : '✖ FAILED';
    console.log(
      `| ${r.name.padEnd(10)} | ${r.total.toString().padEnd(11)} | ${r.passed.toString().padEnd(6)} | ${r.failed.toString().padEnd(6)} | ${(r.durationMs + ' ms').padEnd(10)} | ${statusStr.padEnd(10)} |`
    );
  });

  console.log(`|------------|-------------|--------|--------|------------|------------|`);
  console.log(
    `| TOTAL      | ${totalTests.toString().padEnd(11)} | ${totalPassed.toString().padEnd(6)} | ${totalFailed.toString().padEnd(6)} | ${(totalDuration + ' ms').padEnd(10)} | ${totalFailed === 0 ? '✔ 100% PASS' : '✖ HAS FAILS'} |`
  );
  console.log(`========================================================================\n`);

  process.exit(totalFailed === 0 ? 0 : 1);
}

runAll();

