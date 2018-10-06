/**
 * Plugin loader
 * In large part copied from homebridge (https://github.com/nfarina/homebridge/blob/master/lib/plugin.js),
 * but realized as an ES6 class
 */

const packageInfo = require('../package.json');
const fs = require('fs');
const path = require('path');

const semver = require('semver');

class Plugin {
	constructor(pluginPath) {
		this._path = pluginPath;
		this._pluginObject = null; // instantiated plugin class object
	}

	get name() {
		if (this._pluginObject == null) {
			return path.basename(this._path).replace("whfp-", "");
		} else {
			return this._pluginObject.name;
		}
	}

	get module() {
		return this._pluginObject;
	}

	static loadPackageJSON(pluginPath) {
		// check for a package.json
		let pjsonPath = path.join(pluginPath, "package.json");
		let pjson = null;
	  
		if (!fs.existsSync(pjsonPath)) {
		  throw new Error(`Plugin ${pluginPath} does not contain a package.json.`);
		}
	  
		try {
		  // attempt to parse package.json
		  pjson = JSON.parse(fs.readFileSync(pjsonPath));
		}
		catch (err) {
		  throw new Error(`Plugin ${pluginPath} contains an invalid package.json. Error: ${err}`);
		}
	  
		// make sure the name is prefixed with 'whfp-'
		if (!pjson.name || pjson.name.indexOf('whfp-') != 0) {
		  throw new Error(`Plugin ${pluginPath} does not have a package name that begins with 'whfp-'.`);
		}
	  
		// verify that it's tagged with the correct keyword
		if (!pjson.keywords || pjson.keywords.indexOf("webhookify-plugin") == -1) {
		  throw new Error(`Plugin ${pluginPath} package.json does not contain the keyword 'webhookify-plugin'.`);
		}
	  
		return pjson;
	}

	load(config) {
		// does this plugin exist at all?
		if (!fs.existsSync(this._path)) {
			throw new Error(`Plugin ${this._path} was not found. Make sure the module '${this._path}' is installed.`);
		}

		let pjson = Plugin.loadPackageJSON(this._path);

		let main = (pjson.main != undefined) ? pjson.main : "index.js";
		let mainPath = path.join(process.cwd(), this._path, main);

		let PluginModule = require(mainPath);

		if (!semver.satisfies(PluginModule.version, '^' + packageInfo.version)) {
			throw new Error(`Plugin ${this._path} was created with an older version of the plugin class (${PluginModule.version}), which is not compatible with this version (${packageInfo.version}) of the client.`);
		}

		// instantiate plugin with the supplied config and call it a day
		this._pluginObject = new PluginModule(config);
	}
}

class PluginLoader {
	constructor(additionalPaths) {
		additionalPaths = additionalPaths || [];

		this.paths = PluginLoader.getDefaultPaths().concat(additionalPaths);
	}

	static getDefaultPaths() {
		var win32 = process.platform === 'win32';
		var paths = [];
		
		// add the paths used by require()
		paths = paths.concat(require.main.paths);
		
		// THIS SECTION FROM: https://github.com/yeoman/environment/blob/master/lib/resolver.js
		
		// Adding global npm directories
		// We tried using npm to get the global modules path, but it haven't work out
		// because of bugs in the parseable implementation of `ls` command and mostly
		// performance issues. So, we go with our best bet for now.
		if (process.env.NODE_PATH) {
			paths = process.env.NODE_PATH.split(path.delimiter)
			.filter(function(p) { return !!p; }) // trim out empty values
			.concat(paths);
		} else {
			// Default paths for each system
			if (win32) {
				paths.push(path.join(process.env.APPDATA, 'npm/node_modules'));
			} else {
				paths.push('/usr/local/lib/node_modules');
				paths.push('/usr/lib/node_modules');
				const exec = require('child_process').execSync;
				paths.push(exec('/bin/echo -n "$(npm --no-update-notifier -g prefix)/lib/node_modules"').toString('utf8'));
			}
		}
		return paths;
	}

	/**
	 * Searches through all the paths and instantiates new plugins if they are found
	 * @param {string[]} searchNames of the plugins
	 * @returns {Object} name:plugin
	 */
	findPlugins(searchNames) {
		let searchedPaths = {}; // don't search the same paths twice
		let plugins = {};

		// find all installed plugins instead of only configured ones
		let findAll = (searchNames == undefined);

		// prepend each name with "whfp-"
		searchNames = searchNames || [];
		searchNames = searchNames.map((name) => ("whfp-" + name));

		for(let i in this.paths) {
			let requirePath = this.paths[i];

			// did we already search this path?
			if (searchedPaths[requirePath]) {
				continue;
			}
	  
		  	searchedPaths[requirePath] = true;

			// skip paths that don't exist
			if (!fs.existsSync(requirePath)) {
				continue;
			}

			let names = fs.readdirSync(requirePath);

			// does this path point inside a single plugin and not a directory containing plugins?
			if (fs.existsSync(path.join(requirePath, "package.json"))) {
				names = [""];
			}
	
			// read through each directory in this node_modules folder
			for (let j in names) {
				let name = names[j];
	
				// reconstruct full path
				let pluginPath = path.join(requirePath, name);
				try {
					// we only care about directories
					if (!fs.statSync(pluginPath).isDirectory()) {
						continue;
					}
				} catch (err) {
					continue;
				}

				// does this module contain a package.json?
				let pjson;

				try {
					// throws an Error if this isn't a webhookify plugin
					pjson = Plugin.loadPackageJSON(pluginPath);
				} catch (err) {
					// is this "trying" to be a webhookify plugin? if so let you know what went wrong.
					if (!name || name.indexOf('whfp-') == 0) {
						console.warn(err.message);
					}
		
					// skip this module
					continue;
				}

				// if this plugin is one of the requested ones, instantiate a loader
				if (searchNames.indexOf(pjson.name) != -1 || findAll) {
					let plugin = new Plugin(pluginPath);
					plugins[plugin.name] = plugin;
				}
			}
		}

		return plugins;
	}
}

module.exports = { Plugin, PluginLoader };