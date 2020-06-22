const logger = require("./logger");
const MessageSocket = require("./sockets/MessageSocket");
const os = require("os");
const path = require("path");
const protobuf = require("protobufjs");
const rest = require("./rest");
const Shard = require("./gateway/Shard");
const superagent = require("superagent");

const shards = new Map();
const messageSocket = new MessageSocket();

const orchestratorURL = `http://shard-orchestrator:${process.env.SHARD_ORCHESTRATOR_SERVICE_PORT}`;

async function getShards() {
	try {
		const { body } = await superagent.get(`${orchestratorURL}/shards`)
			.query({ hostname: os.hostname() });

		return {
			shardCount: body.shard_count,
			shardsToUse: body.shards,
			gatewayURL: body.url
		};
	} catch(error) {
		logger.error("Recieved error while requesting shards", { error });
		if(!error.response || (error.status && error.status >= 400 && error.status !== 429)) {
			throw error;
		} else {
			logger.debug("Trying to get shards again ratelimit");
			await new Promise(resolve => setTimeout(resolve, error.response.body.retry_at - Date.now()));
			return await getShards();
		}
	}
}

async function init() {
	const messageProto = await protobuf.load(path.resolve(__dirname, "..", "protobuf", "DiscordMessage.proto"));

	messageSocket.start(messageProto);
	logger.info("Loaded message prototype & started socket");

	const { shardCount, shardsToUse, gatewayURL } = await getShards();
	logger.info("Recieved sharding info", { shardCount, shardsToUse, gatewayURL });

	for(const shardID of shardsToUse) {
		logger.info(`Creating shard ${shardID}`);
		const shard = new Shard({
			gatewayURL,
			shardID,
			shardCount,
			messageSocket,
			token: process.env.TOKEN
		});

		shard.on("disconnectError", error => {
			logger.error(`Shard ${shardID} disconnect with code ${error.code} with reason ${error.reason}\n` +
						`Message: ${error.message}`, { error });
		});

		shards.set(shardID, shard);
		await new Promise(resolve => setTimeout(resolve, 5500));
	}

	rest(shards, shardCount);
}

init();

process.on("unhandledRejection", error => {
	logger.error(error.stack, { error });
	process.exit(1);
});

process.on("SIGTERM", () => {
	messageSocket.close();
	shards.forEach(shard => shard.close());
	logger.info("Closing shards and message socket due to SIGTERM");

	process.exit(0);
});
