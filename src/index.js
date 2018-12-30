const fs = require("fs").promises;
const CacheSocket = require("./sockets/CacheSocket");
const MessageSocket = require("./sockets/MessageSocket");
const Shard = require("./gateway/Shard");

const shards = new Map();
const cacheSocket = new CacheSocket(process.env.CACHE_SOCKET_ADDRESS);
const messageSocket = new MessageSocket(process.env.MESSAGE_SOCKET_ADDRESS);

async function init() {
	const token = await fs.readFile("/etc/secrets/token.txt", "utf8");

	process.env.SHARDS_TO_USE
		.split(",")
		.map(int => parseInt(int))
		.forEach(shardID => {
			const shard = new Shard({
				gatewayURL: process.env.GATEWAY_URL,
				shardID,
				totalShards: parseInt(process.env.TOTAL_SHARDS),
				messageSocket,
				cacheSocket,
				token
			});

			shards.set(shardID, shard);
		});
}

init();

process.on("SIGTERM", () => {
	messageSocket.close();
	cacheSocket.close();
	for(const shard of shards) shard.close();

	process.exit(0);
});
