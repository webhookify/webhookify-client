/**
 * RSA Key Generator
 * Uses build-in crypto where available and tries to fall back to ursa if it isn't
 */

module.exports = {
	generateKeyPair
};

function generateKeyPair() {
	// try to use the built-in generator first
	let crypto;
	try {
		crypto = require('crypto');
	} catch(e) {
		console.log("Crypto support is not enabled.");
		process.exit();
	}

	if ("generateKeyPairSync" in crypto) {
		console.log("Using crypto");
		return crypto.generateKeyPairSync("rsa", {
			modulusLength: 2048,
			publicExponent: 65537,
			publicKeyEncoding: {
				format: "pem",
				type: "spki"
			},
			privateKeyEncoding: {
				format: "pem",
				type: "pkcs1"
			}
		});
	}

	// try ursa fallback
	let ursa;
	try {
		ursa = require('ursa');
		console.log("Using ursa");
	} catch(e) {
		console.log("ursa is not installed and crypto is missing the required functionality.");
		console.log("You can either update to Node 10 or later or install the ursa module.");
		process.exit();
	}

	let keypair = ursa.generatePrivateKey(2048, 65537);
	return {
		publicKey: keypair.toPublicPem().toString("utf8"),
		privateKey: keypair.toPrivatePem().toString("utf8")
	};
}