const Gateway = require("oxyl-boilerplate");
const Shard = require("./gateway/Shard");
const request = require("./request");

const gateway = new Gateway();
const shards = new Map();

async function init() {
	const { gateway: url, shards: totalShards } = await request().gateway().bot();

	gateway.once("shards", shardList => {
		shardList.forEach(shardID => {
			const shard = new Shard(gateway, url, shardID, totalShards);
			shards.set(shardID, shard);
			gateway.addShard(shard);
		});
	});
}

init();
