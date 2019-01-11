#!/usr/bin/env node

const packageInfo = require('./package.json');
const fs = require('fs');
const readline = require('readline');
const util = require('util');
const path = require('path');

const rsa_utils = require('./lib/rsa');

const program = require('commander');
const isUUID = require('is-uuid');
const configdir = require('utils-configdir');
const mkdirp = require('mkdirp');
const opn = require('opn');

const { PluginLoader } = require('./lib/plugin');

program
	.version(packageInfo.version);

program.command("genkey")
	.description("Generate a RSA keypair and write the result into the appropriate location.")
	.option("-O, --output [key.pem]", "Override default keypair location", null)
	.action(generateKeypair);

program.command("init")
	.description("Creates a configuration file.")
	.option("--clientid [clientid]", "Provide the client id")
	.option("-O, --output [path]", "Override default config location", null)
	.action(initializeConfig);

program.command("listplugins")
	.description("Displays all installed plugins and their configuration if possible.")
	.option("-C, --config [config.json]", "Alternative config file location", null)
	.option("-P, --plugin-path [path]", "Set one or more additional paths where plugins can be found", collect, [])
	.action(listPlugins);

program.command("configure")
	.description("Opens the config file.")
	.option("-C, --config [config.json]", "Alternative config file location", null)
	.action(openConfigFile);

program.command("run")
	.description("Run the actual client.")
	.option("-C, --config [config.json]", "Alternative config file location", null)
	.option("-K, --keyfile [key.pem]", "Alternative keyfile location", null)
	.option("-P, --plugin-path [path]", "Set one or more additional paths where plugins can be found", collect, [])
	.action(require('./lib/client'));

program.parse(process.argv);

if (!program.args.length) {
	// show help by default
	program.outputHelp();
} else {
    //warn aboud invalid commands
    var validCommands = program.commands.map((cmd) => {
        return cmd.name;
    });
    var invalidCommands = program.args.filter((cmd) => {
        //if command executed it will be an object and not a string
        return (typeof cmd === 'string' && validCommands.indexOf(cmd) === -1);
    });
    if (invalidCommands.length) {
		console.log('Invalid command: "%s". See "--help" for a list of available commands.', invalidCommands.join(', '));
		process.exit(0);
    }
}

/**
 * Functionality of the "configure" subcommand
 */
function openConfigFile(cmd) {
	let configFilePath = (cmd.config != null) ? cmd.config : path.join(configdir("webhookify"), "config.json");

	opn(configFilePath).then(() => {
		// verify new config file
		if (fs.existsSync(configFilePath)) {
			var config;

			try {
				let configFile = fs.readFileSync(configFilePath);
				config = JSON.parse(configFile);
			} catch(err) {
				console.log("You have errors in your configuration file: " + err.message);
				return;
			}

			let problems = [];

			// check if clientid is set
			if (config.clientId == undefined) {
				problems.push("clientId is not set");
			}
			if (!isUUID.v4(config.clientId)) {
				problems.push("clientId has an invalid value");
			}

			if (config.plugins == undefined) {
				problems.push("plugins key is missing");
			} else {
				for(let i in config.plugins) {
					if (config.plugins[i].name == undefined) {
						problems.push(`plugin number ${i} has no name set`);
					}
					if (config.plugins[i].config == undefined) {
						let name = (config.plugins[i].name != undefined) ? `"${config.plugins[i].name}"` : `number ${i}`;
						problems.push(`plugin ${name} has no config set`);
					}
				}
			}

			if (problems.length == 0) {
				console.log("Configuration file looks ok.");
			} else {
				console.log("There are problems in your configuration file:");
				for(let i in problems) {
					console.log(`- ${problems[i]}`);
				}
			}
		}
	});
}

/**
 * Functionality of the "listplugins" subcommand
 */
function listPlugins(cmd) {
	// load config the same way we do in the run subcommand
	let configFilePath = (cmd.config != null) ? cmd.config : path.join(configdir("webhookify"), "config.json");

	var config;

	try {
		let configFile = fs.readFileSync(configFilePath);
		config = JSON.parse(configFile);
	} catch(err) {
		console.log("Error while opening configuration file: " + err.message);
		process.exit(1);
	}

	// get all configured plugins
	let configuredPlugins = {};
	for(let i in config.plugins) {
		configuredPlugins[config.plugins[i].name] = config.plugins[i].config;
	}

	let loader = new PluginLoader(cmd.pluginPath);

	// find all plugins
	let plugins = loader.findPlugins();

	if (plugins.length == 0) {
		console.log("No installed plugins were found.");
		process.exit(0);
	}

	console.log("Installed plugins:");
	for(let i in plugins) {
		console.log();
		console.log(`Plugin: ${plugins[i].name}`);
		console.log("---------------------");
		console.log(`Path: ${plugins[i]._path}`);

		if (configuredPlugins[plugins[i].name] != undefined) {
			console.log("Configured: Yes");
			console.log("Configuration:");
			console.log(JSON.stringify(configuredPlugins[plugins[i].name], undefined, 4));
		} else {
			console.log("Configured: No");
		}
	}
}

/**
 * Functionality of the "genkey" subcommand 
 */
function generateKeypair(cmd) {
	let keypair_path = cmd.output;

	if (keypair_path == null) {
		let cfg_dir = configdir("webhookify");
		if (!fs.existsSync(cfg_dir)) {
			mkdirp.sync(cfg_dir);
		}
		keypair_path = path.join(cfg_dir, "key.pem");
	}

	if (fs.existsSync(keypair_path)) {
		console.log("The specified keyfile already exists.");
		return;
	}

	console.log("Generating keypair with 2048 bit modulus...");
	let keypair = rsa_utils.generateKeyPair();

	console.log(`Writing keypair to ${keypair_path}...`);
	fs.writeFileSync(keypair_path, keypair.privateKey, { mode: 0o400 });

	console.log("The public component of your keypair is as follows:");
	console.log();
	console.log(keypair.publicKey);
	console.log();
	console.log("Please copy & paste this to the webhookify website.");
}

/**
 * Functionality of the "init" subcommand
 */
function initializeConfig(cmd) {
	let configfile_path = cmd.output;

	if (configfile_path == null) {
		let cfg_dir = configdir("webhookify");
		if (!fs.existsSync(cfg_dir)) {
			mkdirp.sync(cfg_dir);
		}
		configfile_path = path.join(cfg_dir, "config.json");
	}

	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout
	});

	// create promisified versions of required methods
	const question = function(q) {
		return new Promise((resolve, reject) => {
			rl.question(q, (result) => {
				return resolve(result);
			});
		});
	};
	const writeFile = util.promisify(fs.writeFile);

	let config = {
		clientId: null,
		plugins: []
	};

	Promise.resolve(config).then((config) => { //get client id
		if (cmd.clientid == undefined) {
			return question("Enter the client id (from the webhookify website): ")
				.then((result) => Object.assign(config, { clientId: result }));
		} else {
			return Object.assign(config, { clientId: cmd.clientid});
		}
	}).then((config) => { //error checking step
		rl.close();

		if (!isUUID.v4(config.clientId)) throw new Error("Invalid client id.");

		return config;
	}).then((config) => { //write config to file
		if (fs.existsSync(configfile_path)) throw new Error(`Config file (${configfile_path}) already exists.`);

		return writeFile(configfile_path, JSON.stringify(config, undefined, 4));
	}).catch((err) => {
		console.log(err.message);
		rl.close();
	});
}

function collect(val, collection) {
	collection.push(val);
	return collection;
}