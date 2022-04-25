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
    await allureReporter.handleAllTests(tests)
  })
}
