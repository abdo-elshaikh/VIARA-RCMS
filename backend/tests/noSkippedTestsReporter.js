class NoSkippedTestsReporter {
  onRunComplete(_contexts, results) {
    const skippedTests = results.numPendingTests || 0;
    const skippedSuites = results.numPendingTestSuites || 0;

    if (skippedTests > 0 || skippedSuites > 0) {
      this.error = new Error(
        `Skipped tests are forbidden: ${skippedTests} test(s), ${skippedSuites} suite(s)`
      );
    }
  }

  getLastError() {
    return this.error;
  }
}

module.exports = NoSkippedTestsReporter;
