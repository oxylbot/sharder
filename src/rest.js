const express = require("express");
const expressWinston = require("express-winston");
const logger = require("../logger");
const os = require("os");

const app = express();

app.enable("trust proxy");
app.disable("etag");
app.disable("x-powered-by");
app.set("env", process.env.NODE_ENV);

app.use(express.json());
app.use(expressWinston.logger({ winstonInstance: logger }));

app.get("/request-guild-members", async (req, res) => {
	const shard = req.app.locals.shards.get((req.query.id >> 22) % app.locals.shardCount);

	const options = {};
	if(req.query.query) options.query = req.query.query;
	else options.userIds = Array.isArray(req.query.userIds) ? req.query.userIds : [req.query.userIds];

	const data = await shard.requestMembers(req.query.id, options);
	if(data.not_found && data.not_found.length) return res.status(400).json({ error: "Invalid ID" });

	return res.status(200).json(data.members);
});

app.use(expressWinston.errorLogger({ winstonInstance: logger }));

const port = process.env[`${os.hostname().toUpperCase().replace("-", "_")}_SERVICE_PORT`];
app.listen(port, () => {
	logger.info(`REST API listening on port ${port}`);
});

module.exports = (shards, shardCount) => {
	app.locals.shards = shards;
	app.locals.shardCount = shardCount;
};
