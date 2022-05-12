'use strict'

const { createHash } = require('crypto')
const { AllureRuntime, Stage, Status } = require('allure-js-commons')

const uriFromPng = require('../utils/uriFromPng')
const fs = require('fs')
const { Image, temp } = require('gemini-core')

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

  passTestCase (runningTest) {
    this.#startCase(runningTest)
    this.#endTest(runningTest, Status.PASSED)
  }

  failTestCase (runningTest) {}

  pendingTestCase (runningTest) {
    this.#startCase(runningTest)
    this.#endTest(Status.SKIPPED, { message: 'Test ignored' })
  }

  async prepareTests (mochaTestCase) {
    let promises = []

    // If error it's mocha error (can't click or sometnig like this) - process it not from assertViewResult
    if (mochaTestCase.err && mochaTestCase.err.name != 'AssertViewError') {
      promises.push(this.#processTest(mochaTestCase))
    }

    // Get all AssertView results and process each of it as a independent test
    const assertViewResults = mochaTestCase.hermioneCtx.assertViewResults.get()
    for (const assertViewTestCase of assertViewResults) {
      promises.push(this.#processTest(assertViewTestCase))
    }

    await Promise.all(promises)

    return Promise.resolve()
  }

  async #processTest (test) {
    const group = this.runtime.startGroup('Global')

    const runningTest = this.#startCase(test, group)

    if (test?.err instanceof Error || test instanceof Error) {
      const error = test?.err ? test.err : test

      await this.#failedTest(runningTest, test, error)
    }

    runningTest.status ||= Status.PASSED

    this.#endTest(runningTest, test)

    group.endGroup()

    return Promise.resolve()
  }

  async #failedTest (runningTest, testCase, error) {
    if (error?.name === 'ImageDiffError') {
      runningTest.status = Status.FAILED

      await this.#handleDiffError(runningTest, testCase)
    }

    if (error?.message && error?.stack) {
      runningTest.statusDetails = {
        message: error.message,
        trace: error.stack
      }
    }

    runningTest.status ||= Status.BROKEN

    return Promise.resolve()
  }

  #startCase (testCase, group) {
    const testName = testCase?.stateName
      ? testCase?.stateName
      : testCase.fullTitle()

    const runningTest = group.startTest(testName)

    runningTest.fullName = testName
    runningTest.historyId = createHash('md5')
      .update(testName)
      .digest('hex')
    runningTest.stage = Stage.RUNNING

    return runningTest
  }

  #endTest (runningTest, testCase) {
    if (runningTest === null) {
      throw new Error('endTest while no test is running')
    }

    if (testCase?.refImg?.size) {
      this.#writeAttachment(
        runningTest,
        `${testCase.stateName} Original`,
        testCase.refImg.path,
        'image/png'
      )
    }

    runningTest.stage = Stage.FINISHED
    runningTest.endTest()
  }

  async #handleDiffError (runningTest, test) {
    runningTest.addLabel('testType', 'screenshotDiff')

    const diffImg = await this.#createDiffImg(test.diffOpts)

    const diffPath = this.#createDiffFile(
      test.currImg.path,
      test.refImg.path,
      diffImg.path
    )

    this.#writeAttachment(
      runningTest,
      `${test.stateName} ImageDiff`,
      diffPath,
      {
        contentType: 'application/vnd.allure.image.diff',
        fileExtension: 'imagediff'
      }
    )

    return runningTest
  }

  #createDiffFile (currImg, refImg, diffOpts) {
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

  async #createDiffImg (diffOptions) {
    temp.init()
    const diffPath = temp.path({ suffix: '.png' })
    const diffBuffer = await Image.buildDiff(diffOptions)

    const diffImgInst = new Image(diffBuffer)
    const diffImg = {
      path: diffPath,
      size: diffImgInst.getSize()
    }

    await diffImgInst.save(diffImg.path)

    return diffImg
  }

  #writeAttachment (runningTest, name, path, options) {
    if (runningTest === null) {
      throw new Error('no runningTest')
    }
    const file = this.runtime.writeAttachmentFromPath(path, options)
    return runningTest.addAttachment(name, options, file)
  }
}
