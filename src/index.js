const request = require("./request");

async function init() {
	const { gateway, shards } = await request().get("/gateway/bot");
}

init();
