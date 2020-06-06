const express = require("express");
const os = require("os");

const app = express();

app.enable("trust proxy");
app.disable("etag");
app.disable("x-powered-by");
app.set("env", process.env.NODE_ENV);

app.use(express.json());

app.get("/request-guild-members", async (req, res) => {
	const shard = req.app.locals.shards.get((req.query.id >> 22) % app.locals.shardCount);

	const options = {};
	if(req.query.query) options.query = req.query.query;
	else options.userIds = Array.isArray(req.query.userIds) ? req.query.userIds : [req.query.userIds];

	const data = await shard.requestMembers(req.query.id, options);
	if(data.not_found) return res.status(400).json({ errpr: "Invalid ID" });

	return res.status(200).json(data.members);
});

app.listen(process.env[`${os.hostname().toUpperCase()}_SERVICE_PORT`]);

module.exports = (shards, shardCount) => {
	app.locals.shards = shards;
	app.locals.shardCount = shardCount;
};
