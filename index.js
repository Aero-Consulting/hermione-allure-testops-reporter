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
  let tests = []

  hermione.on(hermione.events.TEST_END, function (test) {
    tests.push(test)
  })

  hermione.on(hermione.events.RUNNER_END, async function () {
    console.log(`There ${tests.length} test to handle!`)
    if (tests.length === 0) {
      return
    }

    let promises = []

    //Remove retries exept last one
    tests = tests.filter(testCase => !testCase?.retriesLeft)

    for (const mochaTestCase of tests) {
      promises.push(allureReporter.prepareTests(mochaTestCase))
    }

    await Promise.all(promises)
  })
}
