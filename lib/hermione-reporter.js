'use strict'

const { createHash } = require('crypto')
const { AllureRuntime, LabelName, Stage, Status } = require('allure-js-commons')

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

  async handleAllTests (tests) {
    if (tests.length === 0) {
      return
    }

    for (const mochaTestCase of tests) {
      const assertViewResults = mochaTestCase.hermioneCtx.assertViewResults.get()

      if (assertViewResults.length === 0) {
        return
      }

      const globalGroup = this.runtime.startGroup('Global')

      let promises = []
      for (const assertViewResult of assertViewResults) {
        promises.push(this.doTest(mochaTestCase, assertViewResult, globalGroup))
      }

      await Promise.all(promises)

      globalGroup.endGroup()
    }
  }

  async doTest (mochaTestCase, assertViewResult, globalGroup) {
    return new Promise(async (resolve, reject) => {
      const runningTest = this.#startCase(
        mochaTestCase,
        assertViewResult,
        globalGroup
      )

      if (assertViewResult instanceof Error) {
        if (assertViewResult.name === 'ImageDiffError') {
          runningTest.status = Status.FAILED

          await this.#handleDiffError(runningTest, assertViewResult)
        } else {
          runningTest.status = Status.BROKEN
        }
      }

      runningTest.status ||= Status.PASSED

      if (assertViewResult?.refImg?.size) {
        this.#writeAttachment(
          runningTest,
          `${assertViewResult.stateName} Original`,
          assertViewResult.refImg.path,
          'image/png'
        )
      }

      this.#endTest(runningTest, assertViewResult)

      resolve()
    })
  }

  #startCase (mochaTestCase, assertViewResult, globalGroup) {
    const runningTest = globalGroup.startTest(assertViewResult.stateName)

    runningTest.fullName = assertViewResult.stateName
    runningTest.historyId = createHash('md5')
      .update(assertViewResult.stateName)
      .digest('hex')
    runningTest.stage = Stage.RUNNING

    if (mochaTestCase.parent) {
      const [
        parentSuite,
        suite,
        ...subSuites
      ] = mochaTestCase.parent.titlePath()
      if (parentSuite) {
        runningTest.addLabel(LabelName.PARENT_SUITE, parentSuite)
      }
      if (suite) {
        runningTest.addLabel(LabelName.SUITE, suite)
      }
      if (subSuites.length > 0) {
        runningTest.addLabel(LabelName.SUB_SUITE, subSuites.join(' > '))
      }
    }

    return runningTest
  }

  #endTest (runningTest, assertViewResult) {
    if (runningTest === null) {
      throw new Error('endTest while no test is running')
    }

    if (assertViewResult?.message && assertViewResult?.stack) {
      runningTest.statusDetails = {
        message: assertViewResult.message,
        trace: assertViewResult.stack
      }
    }

    runningTest.stage = Stage.FINISHED
    runningTest.endTest()
  }

  async #handleDiffError (runningTest, assertViewResult) {
    runningTest.addLabel('testType', 'screenshotDiff')

    const diffImg = await this.#createDiffImg(assertViewResult.diffOpts)

    const diffPath = this.#createDiffFile(
      assertViewResult.currImg.path,
      assertViewResult.refImg.path,
      diffImg.path
    )

    this.#writeAttachment(
      runningTest,
      `${assertViewResult.stateName} ImageDiff`,
      diffPath,
      'application/vnd.allure.image.diff'
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
