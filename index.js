const AllureHermioneReporter = require('./lib/hermione-reporter')
const updateRefs = require('./lib/readEnvs')

module.exports = function (hermione, opts) {
  // Check updateRefs argvs
  const updateRefsData = updateRefs(process.argv)

  if (!opts.enabled) {
    return
  }

  const allureConfig = {
    resultsDir: opts?.targetDir || 'allure-results',
    ...opts.reporterOptions
  }

  const allureReporter = new AllureHermioneReporter(allureConfig)
  let promises = []

  hermione.on(hermione.events.TEST_END, function (test) {
    //Remove retries exept last one
    if (test.retriesLeft) return

    promises.push(allureReporter.prepareTests(test))
  })

  hermione.on(hermione.events.RUNNER_END, async function () {
    // Wait untill all reports process (make diff picture take A LOT of time)
    await Promise.all(promises)
  })
}
