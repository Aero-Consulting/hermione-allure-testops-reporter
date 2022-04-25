const AllureHermioneReporter = require('./lib/hermione-reporter')
const updateRefs = require('./lib/readEnvs')

module.exports = function (hermione, opts) {
  // Check updateRefs argvs
  const updateRefsData = updateRefs(process.argv)

  if (!opts.enabled || updateRefsData) {
    return
  }

  const allureConfig = {
    resultsDir: opts?.targetDir || 'allure-results',
    ...opts.reporterOptions
  }

  const allureReporter = new AllureHermioneReporter(allureConfig)
  let suits = []
  let tests = []

  hermione.on(hermione.events.SUITE_END, function (suite) {
    suits.push(suite)
    // allureReporter.endSuite(suite)
  })

  hermione.on(hermione.events.TEST_PASS, function (test) {
    tests.push(test)
    // allureReporter.passTestCase(test)
  })

  hermione.on(hermione.events.TEST_FAIL, function (test) {
    tests.push(test)
    // allureReporter.failTestCase(test, test.err)
  })

  hermione.on(hermione.events.TEST_PENDING, function (test) {
    tests.push(test)
    // allureReporter.pendingTestCase(test)
  })

  hermione.on(hermione.events.END, async function () {
    await allureReporter.handleTests(tests)
  })
}
