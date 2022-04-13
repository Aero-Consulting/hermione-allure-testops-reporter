'use strict';

const temp = require('temp');
const path = require('path');

temp.track();

class Temp {
	#tempDir;

	constructor (dir, opts = {}) {
		this.#tempDir = opts.attach
			? dir
			: temp.mkdirSync({
					dir: dir && path.resolve(dir),
					prefix: '.screenshots.tmp.',
			  });
	}

	path (opts = {}) {
		return temp.path({ ...opts, dir: this.#tempDir });
	}

	serialize () {
		return { dir: this.#tempDir };
	}
}

let tempInstance;
module.exports = {
	init: (dir) => {
		if (!tempInstance) {
			tempInstance = new Temp(dir);
		}
	},

	attach: (serializedTemp) => {
		if (!tempInstance) {
			tempInstance = new Temp(serializedTemp.dir, { attach: true });
		}
	},

	path: (opts) => tempInstance.path(opts),
	serialize: () => tempInstance.serialize(),
};
