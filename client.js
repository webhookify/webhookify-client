const fs = require('fs');
const util = require('util');

const { Protocol } = require('webhookify');

// entry point for the client
module.exports = function(cmd) {
	//read config file and keyfle

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

	let conn = new Protocol(config.clientId, keyFile);

	conn.connect();

	conn.on("disconnected", (reason) => {
		util.log(`Disconnected (reason: ${reason})`);
	});

	conn.on("push", (plugin, payload) => {
		console.log("PUSH", plugin, payload);
	});
}