'use strict'

const { createHash } = require('crypto')
const { AllureRuntime, LabelName, Stage, Status } = require('allure-js-commons')

const uriFromPng = require('../utils/uriFromPng')
const fs = require('fs')
const { temp } = require('gemini-core')

module.exports = class AllureHermioneReporter {
  constructor (allureConfig) {
    this.runtime = new AllureRuntime(allureConfig)

    this.suites = []
    this.steps = []
    this.runningTest = null
  }

  startSuite (suiteName) {
    const scope = this.currentSuite() || this.runtime
    const suite = scope.startGroup(suiteName || 'Global')

    this.pushSuite(suite)
  }

  endSuite () {
    if (this.currentSuite() !== null) {
      if (this.currentStep() !== null) {
        this.currentStep().endStep()
      }
      this.currentSuite().endGroup()
      this.popSuite()
    }
  }

  startCase (test) {
    if (this.currentSuite() === null) {
      throw new Error('No active suite')
    }

    this.runningTest = this.currentSuite().startTest(test.title)
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
    } else {
      const latestStatus = this.runningTest.status
      // if test already has a failed state, we should not overwrite it
      if (latestStatus === Status.FAILED || latestStatus === Status.BROKEN) {
        return
      }

      if (test.hermioneCtx.assertViewResults.hasFails()) {
        this.runningTest.addLabel('testType', 'screenshotDiff')

        const failedTest = test.hermioneCtx.assertViewResults.get()[0]

        if (failedTest?.diffOpts?.diffImg) {
          const diffPath = this.createDiffFile(
            failedTest.currImg.path,
            failedTest.refImg.path,
            failedTest.diffOpts.diffImg.path
          )

          this.writeAttachment(
            `${failedTest.stateName} ImageDiff`,
            diffPath,
            'application/vnd.allure.image.diff'
          )
        }
      }

      const status =
        error.name === 'AssertionError' || error.name === 'AssertViewError'
          ? Status.FAILED
          : Status.BROKEN

      this.endTest(status, { message: error.message, trace: error.stack })
    }
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

  currentStep () {
    return this.steps.length > 0 ? this.steps[this.steps.length - 1] : null
  }

  writeAttachment (name, path, options) {
    if (this.runningTest === null) {
      throw new Error('endTest while no test is running')
    }
    const file = this.runtime.writeAttachmentFromPath(path, options)
    return this.runningTest.addAttachment(name, options, file)
  }

  currentSuite () {
    return this.suites.length > 0 ? this.suites[this.suites.length - 1] : null
  }

  pushSuite (suite) {
    this.suites.push(suite)
  }

  popSuite () {
    this.suites.pop()
  }

  createDiffFile (currImg, refImg, diffOpts) {
    const diffFileJson = JSON.stringify({
      expected: uriFromPng(currImg),
      actual: uriFromPng(refImg),
      diff: uriFromPng(diffOpts)
    })

    temp.init()
    const tempPath = temp.path({ suffix: '.imagediff' })

    fs.writeFileSync(tempPath, diffFileJson)
    return tempPath
  }
}
