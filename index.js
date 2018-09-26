const fs = require('fs');
const readline = require('readline');
const util = require('util');

const program = require('commander');
const ursa = require('ursa');
const isUUID = require('is-uuid');

program
	.version("1.0.0");

program.command("genkey")
	.description("Generate a RSA keypair and write the result into the appropriate location.")
	.option("-O, --output [key.pem]", "File to write the keypair to", "key.pem")
	.action(generateKeypair);

program.command("init")
	.description("Creates a configuration file.")
	.option("--clientid [clientid]", "Provide the client id")
	.action(initializeConfig);

program.command("run")
	.description("Run the actual client")
	.option("-C, --config [config.json]", "Alternative config file location", "config.json")
	.option("-K, --keyfile [key.pem]", "Alternative keyfile location", "key.pem")
	.action(require('./client'));

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

function generateKeypair(cmd) {
	if (fs.existsSync(cmd.output)) {
		console.log("The specified keyfile already exists.");
		return;
	}

	console.log("Generating keypair with 2048 bit modulus...");
	let keypair = ursa.generatePrivateKey(2048, 65537);

	console.log(`Writing keypair to ${cmd.output}...`);
	fs.writeFileSync(cmd.output, keypair.toPrivatePem(), { mode: 0o400 });

	console.log("The public component of your keypair is as follows:");
	console.log();
	console.log(keypair.toPublicPem().toString("utf8"));
	console.log();
	console.log("Please copy & paste this to the webhookify website");
}

function initializeConfig(cmd) {
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
		if (fs.existsSync("config.json")) throw new Error("Config file (config.json) already exists.");

		return writeFile("config.json", JSON.stringify(config, undefined, 4));
	}).catch((err) => {
		console.log(err.message);
		rl.close();
	});
}