const fs = require('fs');
const util = require('util');

const { Protocol } = require('webhookify');
const { PluginLoader } = require('./plugin');

// entry point for the client
module.exports = function(cmd) {
	// read config file and keyfle

	let configFilePath = cmd.config;
	let keyFilePath = cmd.keyfile;

	var config;

	try {
		let configFile = fs.readFileSync(configFilePath);
		config = JSON.parse(configFile);
	} catch(err) {
		console.log("Error while opening configuration file: " + err.message);
		process.exit(1);
	}

	var keyFile;

	try {
		keyFile = fs.readFileSync(keyFilePath);
	} catch(err) {
		console.log("Error while opening keyfile: " + err.message);
		process.exit(1);
	}

	// load plugins and their config
	let loader = new PluginLoader(cmd.pluginPath);

	let pluginNames = config.plugins.map(p => p.name);
	let plugins = loader.findPlugins(pluginNames);

	for(let pluginName in plugins) {
		console.log(`Loading plugin ${pluginName}...`);
		try {
			plugins[pluginName].load(config.plugins.find(p => p.name == pluginName).config);
			console.log("Loaded!");
		} catch(err) {
			console.log("ERROR:", err.message);
		}
	}

	let conn = new Protocol(config.clientId, keyFile);

	conn.connect();

	conn.on("disconnected", (reason) => {
		util.log(`Disconnected (reason: ${reason})`);
	});

	conn.on("push", (plugin, payload) => {
		//console.log("PUSH", plugin, payload);

		if (plugins[plugin] != undefined) {
			plugins[plugin].module.handlePush(payload);
		}
	});

	conn.on("fetch", (plugin, payload, reply) => {
		//console.log("FETCH", plugin, payload);

		if (plugins[plugin] != undefined) {
			plugins[plugin].module.handleFetch(payload, (response) => {
				reply(null, response);
			});
		} else {
			reply(new Error("The specified plugin was not found."));
		}
	});
}