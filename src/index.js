const CacheSocket = require("./sockets/CacheSocket");
const MessageSocket = require("./sockets/MessageSocket");
const os = require("os");
const path = require("path");
const protobuf = require("protobufjs");
const Shard = require("./gateway/Shard");
const superagent = require("superagent");

const shards = new Map();
const cacheSocket = new CacheSocket();
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
	} catch({ response: { body } }) {
		await new Promise(resolve => setTimeout(resolve, body.retry_at - Date.now()));
		return await getShards();
	}
}

async function init() {
	const cacheProto = await protobuf.load(path.resolve(__dirname, "..", "protobuf", "Cache.proto"));
	const messageProto = await protobuf.load(path.resolve(__dirname, "..", "protobuf", "DiscordMessage.proto"));

	cacheSocket.start(cacheProto);
	messageSocket.start(messageProto);

	const { shardCount, shardsToUse, gatewayURL } = await getShards();

	for(const shardID of shardsToUse) {
		const shard = new Shard({
			gatewayURL,
			shardID,
			shardCount,
			messageSocket,
			cacheSocket,
			token: process.env.TOKEN
		});

		shard.on("disconnectError", error => {
			console.error(`Shard ${shardID} disconnect with code ${error.code} with reason ${error.reason}\n` +
						`Message: ${error.message}`);
		});

		shards.set(shardID, shard);
		await new Promise(resolve => setTimeout(resolve, 5500));
	}

	await superagent.put(`${orchestratorURL}/finished`);
}

init();

process.on("SIGTERM", () => {
	messageSocket.close();
	cacheSocket.close();
	for(const shard of shards) shard.close();

	process.exit(0);
});
