const AllureHermioneReporter = require('./lib/hermione-reporter');
const updateRefs = require('./lib/readEnvs');

module.exports = function (hermione, opts) {
	// Check updateRefs argvs
	const updateRefsData = updateRefs(process.argv);

	if (!opts.enabled || updateRefsData) {
		return;
	}

	const allureConfig = {
		resultsDir: opts?.targetDir || 'allure-results',
		...opts.reporterOptions,
	};

	const allureReporter = new AllureHermioneReporter(allureConfig);

	hermione.on(hermione.events.SUITE_BEGIN, function (suite) {
		allureReporter.startSuite(suite.fullTitle());
	});

	hermione.on(hermione.events.SUITE_END, function (suite) {
		allureReporter.endSuite(suite);
	});

	hermione.on(hermione.events.TEST_BEGIN, function (test) {
		allureReporter.startCase(test);
	});

	hermione.on(hermione.events.TEST_PASS, function (test) {
		allureReporter.passTestCase(test);
	});

	hermione.on(hermione.events.TEST_FAIL, function (test) {
		allureReporter.failTestCase(test, test.err);
	});

	hermione.on(hermione.events.TEST_PENDING, function (test) {
		allureReporter.pendingTestCase(test);
	});
};
