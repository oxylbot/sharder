const fs = require("fs").promises;
const zmq = require("zeromq");

const Shard = require("./gateway/Shard");

const shards = new Map();
const socket = zmq.socket("pull");

async function init() {
	const address = await fs.readFile("/etc/secret-volume/zeromq-address", "utf8");
	socket.connect(address);

	// TODO: get shards, gateway url, and total shards
	const totalShards = 0;
	const url = "";
	const shardList = [];

	shardList.forEach(shardID => {
		const shard = new Shard(url, shardID, totalShards);
		shards.set(shardID, shard);
	});
}

init();

process.on("SIGTERM", () => {
	socket.close();
	for(const shard of shards) shard.close();

	process.exit(0);
});
