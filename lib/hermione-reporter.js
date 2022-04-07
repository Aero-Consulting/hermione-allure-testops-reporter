const { createHash } = require('crypto')
const { AllureRuntime, LabelName, Stage, Status } = require('allure-js-commons')

module.exports = class AllureHermioneReporter {
  constructor (allureConfig) {
    this.runtime = new AllureRuntime(allureConfig)

    this.suites = []
    this.steps = []
    this.runningTest = null
  }

  startSuite (suiteName) {
    const scope = this.currentSuite || this.runtime
    const suite = scope.startGroup(suiteName || 'Global')

    this.suites.push(suite)
  }

  endSuite () {
    if (this.currentSuite !== null) {
      if (this.currentStep !== null) {
        this.currentStep.endStep()
      }
      this.currentSuite.endGroup()
      this.suites.pop()
    }
  }

  startCase (test) {
    if (this.currentSuite === null) {
      throw new Error('No active suite')
    }

    this.runningTest = this.currentSuite.startTest(test.title)
    this.runningTest.fullName = test.title
    this.runningTest.historyId = createHash('md5')
      .update(test.fullTitle())
      .digest('hex')
    this.runningTest.stage = Stage.RUNNING

    if (test.parent) {
      const [parentSuite, suite, ...subSuites] = test.parent.titlePath()
      if (parentSuite) {
        this.runningTest.addLabel(LabelName.PARENT_SUITE, parentSuite)
      }
      if (suite) {
        this.runningTest.addLabel(LabelName.SUITE, suite)
      }
      if (subSuites.length > 0) {
        this.runningTest.addLabel(LabelName.SUB_SUITE, subSuites.join(' > '))
      }
    }
  }

  passTestCase (test) {
    if (this.runningTest === null) {
      this.startCase(test)
    }
    this.endTest(Status.PASSED)
  }

  failTestCase (test, error) {
    if (this.runningTest === null) {
      this.startCase(test)
      return
    }

    const latestStatus = this.runningTest.status
    // if test already has a failed state, we should not overwrite it
    if (latestStatus === Status.FAILED || latestStatus === Status.BROKEN) {
      return
    }

    if (test.hermioneCtx.assertViewResults.hasFails()) {
      this.runningTest.addLabel('testType', 'screenshotDiff')

      const [failedTest] = test.hermioneCtx.assertViewResults.get()

      this.writeAttachment('actual', failedTest.currImg.path, 'image/png')
      this.writeAttachment('expected', failedTest.refImg.path, 'image/png')

      if (failedTest?.diffOpts?.diffImg) {
        this.writeAttachment(
          'ImageDiff',
          failedTest.diffOpts.diffImg.path,
          'image/png'
        )
      }
    }

    const status =
      error.name === 'AssertionError' || error.name === 'AssertViewError'
        ? Status.FAILED
        : Status.BROKEN

    this.endTest(status, { message: error.message, trace: error.stack })
  }

  pendingTestCase (test) {
    this.startCase(test)
    this.endTest(Status.SKIPPED, { message: 'Test ignored' })
  }

  endTest (status, details) {
    if (this.runningTest === null) {
      throw new Error('endTest while no test is running')
    }

    if (details) {
      this.runningTest.statusDetails = details
    }

    this.runningTest.status = status
    this.runningTest.stage = Stage.FINISHED
    this.runningTest.endTest()
    this.runningTest = null
  }

  writeAttachment (name, path, options) {
    if (this.runningTest === null) {
      throw new Error('endTest while no test is running')
    }
    const file = this.runtime.writeAttachmentFromPath(path, options)
    return this.runningTest.addAttachment(name, options, file)
  }

  get currentSuite () {
    return this.suites.length > 0 ? this.suites[this.suites.length - 1] : null
  }

  get currentStep () {
    return this.steps.length > 0 ? this.steps[this.steps.length - 1] : null
  }
}
