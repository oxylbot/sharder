const config = require("../config");
const { REST: constants } = require("./constants");
const superagent = require("superagent");

class Term {
	constructor(request, methods = []) {
		this.request = request;

		methods.forEach(method => {
			if(typeof method === "object") {
				this[method.use] = (...args) => {
					request.complete = false;
					return request[method.real](...args);
				};
			} else {
				this[method] = (...args) => {
					request.complete = false;
					return request[method](...args);
				};
			}
		});
	}

	run() {
		return this.request.run();
	}

	then(...args) {
		this.request.then(...args);
	}
}

class Request {
	constructor() {
		this.url = `${constants.BASE_URL}/v${constants.VERSION}`;
		this.request = superagent;
		this.multipart = false;
		this.method = "get";
		this.body = {};
		this.query = {};
		this.headers = {
			Authorization: `Bot ${config.token}`,
			"User-Agent": "Oxyl Bot"
		};

		this.complete = false;
		return new Term(this, ["gateway"]);
	}

	addPath(...paths) {
		this.url += `/${paths.join("/")}`;
	}

	setMethod(method) {
		this.method = method;
	}

	delete() {
		this.method = "delete";
		this.complete = true;

		return new Term(this);
	}

	gateway() {
		this.addPath("gateway");
		this.complete = true;

		return new Term(this, [{
			use: "bot",
			real: "gatewayBot"
		}]);
	}

	gatewayBot() {
		this.addPath("bot");
		this.complete = true;

		return new Term(this);
	}

	reason(reason) {
		if(!reason) throw new Error("Reason not given");

		this.headers["X-Audit-Log-Reason"] = reason;
		this.complete = true;

		return new Term(this);
	}

	channels() {
		this.addPath("channels");

		return new Term(this, [{
			use: "get",
			real: "getChannel"
		}]);
	}

	getChannel(id) {
		if(!id) throw new Error("ID must be defined for channels().get(id)");

		this.addPath(id);
		this.complete = true;

		return new Term(this, [{
			use: "name",
			real: "setChannelName"
		}, {
			use: "position",
			real: "setChannelPosition"
		}, {
			use: "topic",
			real: "setChannelTopic"
		}, {
			use: "nsfw",
			real: "setChannelNSFW"
		}, {
			use: "ratelimit",
			real: "setChannelRatelimit"
		}, {
			use: "bitrate",
			real: "setChannelBitrate"
		}, {
			use: "userLimit",
			real: "setChannelUserLimit"
		}, {
			use: "parentID",
			real: "setChannelParentID"
		}, {
			use: "messages",
			real: "getChannelMessages"
		}, {
			use: "send",
			real: "createChannelMessage"
		}, "delete"]);
	}

	createChannelMessage(content) {
		if(typeof content === "string") this.body.content = content;
		else this.body.content = "";

		if(typeof content === "object") {
			if(content.content) this.body.content = content.content;
			else this.body.content = "";

			if(content.file) this.body.file = content.file;
			else if(content.hasOwnProperty("...")) this.body.file = content;

			if(content.embed) this.body.embed = content;
			else if(content.hasOwnProperty("...")) this.body.embed = content;
		}

		this.complete = true;
		this.multipart = true;
		this.method = "POST";
		this.addPath("messages");

		return new Term(this);
	}

	getChannelMessages({ around, before, after, limit }) {
		if(around) this.query.around = around;
		else if(before) this.query.before = before;
		else if(after) this.query.after = after;
		if(limit) this.query.limit = limit;

		this.addPath("messages");
		this.complete = true;

		return new Term(this, [{
			use: "get",
			real: "getChannelMessage"
		}]);
	}

	getChannelMessage(id) {
		if(!id) throw new Error("Message ID must be defined for channels().get(id).messages().get(id)");

		this.addPath(id);
		this.complete = true;

		return new Term(this, [{
			use: "reactions",
			real: "getMessageReactions"
		}]);
	}

	setChannelName(name) {
		if(!name) {
			throw new Error("Name but be defined for channels.get(id).name(name)");
		} else if(name.length < 2 || name.length > 100) {
			throw new Error("Name must be between 2 and 100 characters for channels.get(id).name(name)");
		}

		this.method = "patch";
		this.complete = true;
		this.body.name = name.toString();

		return new Term(this, [{
			use: "name",
			real: "setChannelName"
		}, {
			use: "position",
			real: "setChannelPosition"
		}, {
			use: "topic",
			real: "setChannelTopic"
		}, {
			use: "nsfw",
			real: "setChannelNSFW"
		}, {
			use: "ratelimit",
			real: "setChannelRatelimit"
		}, {
			use: "bitrate",
			real: "setChannelBitrate"
		}, {
			use: "userLimit",
			real: "setChannelUserLimit"
		}, {
			use: "parentID",
			real: "setChannelParentID"
		}]);
	}

	setChannelPosition(position) {
		if(!Number.isInteger(position) || position < 0) {
			throw new Error("Position but be a finite integer greater than 0 for channels.get(id).position(position)");
		}

		this.method = "patch";
		this.complete = true;
		this.body.position = position;

		return new Term(this, [{
			use: "name",
			real: "setChannelName"
		}, {
			use: "position",
			real: "setChannelPosition"
		}, {
			use: "topic",
			real: "setChannelTopic"
		}, {
			use: "nsfw",
			real: "setChannelNSFW"
		}, {
			use: "ratelimit",
			real: "setChannelRatelimit"
		}, {
			use: "bitrate",
			real: "setChannelBitrate"
		}, {
			use: "userLimit",
			real: "setChannelUserLimit"
		}, {
			use: "parentID",
			real: "setChannelParentID"
		}]);
	}

	setChannelTopic(topic) {
		if(!topic) {
			topic = "";
		} else if(topic.length > 1024) {
			throw new Error("Topic must be no more than 1024 characters for channels.get(id).topic(topic)");
		}

		this.method = "patch";
		this.complete = true;
		this.body.name = topic.toString();

		return new Term(this, [{
			use: "name",
			real: "setChannelName"
		}, {
			use: "position",
			real: "setChannelPosition"
		}, {
			use: "topic",
			real: "setChannelTopic"
		}, {
			use: "nsfw",
			real: "setChannelNSFW"
		}, {
			use: "ratelimit",
			real: "setChannelRatelimit"
		}, {
			use: "bitrate",
			real: "setChannelBitrate"
		}, {
			use: "userLimit",
			real: "setChannelUserLimit"
		}, {
			use: "parentID",
			real: "setChannelParentID"
		}]);
	}

	setChannelNSFW(nsfw) {
		if(typeof nsfw !== "boolean") {
			throw new Error("channels.get(id).nsfw(boolean) requires a boolean value");
		}

		this.method = "patch";
		this.complete = true;
		this.body.nsfw = nsfw;

		return new Term(this, [{
			use: "name",
			real: "setChannelName"
		}, {
			use: "position",
			real: "setChannelPosition"
		}, {
			use: "topic",
			real: "setChannelTopic"
		}, {
			use: "nsfw",
			real: "setChannelNSFW"
		}, {
			use: "ratelimit",
			real: "setChannelRatelimit"
		}, {
			use: "bitrate",
			real: "setChannelBitrate"
		}, {
			use: "userLimit",
			real: "setChannelUserLimit"
		}, {
			use: "parentID",
			real: "setChannelParentID"
		}]);
	}

	setChannelRatelimit(ratelimit) {
		if(!Number.isInteger(ratelimit)) {
			throw new Error("Ratelimit but be a finite integer for channels.get(id).ratelimit(ratelimit)");
		} else if(ratelimit < 0 || ratelimit > 120) {
			throw new Error("Ratelimit but be between 0 and 120 for channels.get(id).ratelimit(ratelimit)");
		}

		this.method = "patch";
		this.complete = true;
		this.body.rate_limit_per_user = ratelimit;

		return new Term(this, [{
			use: "name",
			real: "setChannelName"
		}, {
			use: "position",
			real: "setChannelPosition"
		}, {
			use: "topic",
			real: "setChannelTopic"
		}, {
			use: "nsfw",
			real: "setChannelNSFW"
		}, {
			use: "ratelimit",
			real: "setChannelRatelimit"
		}, {
			use: "bitrate",
			real: "setChannelBitrate"
		}, {
			use: "userLimit",
			real: "setChannelUserLimit"
		}, {
			use: "parentID",
			real: "setChannelParentID"
		}]);
	}

	setChannelBitrate(bitrate) {
		if(!Number.isInteger(bitrate)) {
			throw new Error("Bitrate but be a finite integer for channels.get(id).bitrate(bitrate)");
		} else if(bitrate < 8000 || bitrate > 128000) {
			throw new Error("Bitrate but be between 8000 and 128000 (96000 for non-vip)" +
				" for channels.get(id).bitrate(bitrate)");
		}

		this.method = "patch";
		this.complete = true;
		this.body.bitrate = bitrate;

		return new Term(this, [{
			use: "name",
			real: "setChannelName"
		}, {
			use: "position",
			real: "setChannelPosition"
		}, {
			use: "topic",
			real: "setChannelTopic"
		}, {
			use: "nsfw",
			real: "setChannelNSFW"
		}, {
			use: "ratelimit",
			real: "setChannelRatelimit"
		}, {
			use: "bitrate",
			real: "setChannelBitrate"
		}, {
			use: "userLimit",
			real: "setChannelUserLimit"
		}, {
			use: "parentID",
			real: "setChannelParentID"
		}]);
	}

	setChannelUserLimit(limit) {
		if(!Number.isInteger(limit)) {
			throw new Error("Limit but be a finite integer for channels.get(id).userLimit(limit)");
		} else if(limit < 0 || limit > 100) {
			throw new Error("Limit but be between 0 and 100 for channels.get(id).userLimit(limit)");
		}

		this.method = "patch";
		this.complete = true;
		this.body.user_limit = limit;

		return new Term(this, [{
			use: "name",
			real: "setChannelName"
		}, {
			use: "position",
			real: "setChannelPosition"
		}, {
			use: "topic",
			real: "setChannelTopic"
		}, {
			use: "nsfw",
			real: "setChannelNSFW"
		}, {
			use: "ratelimit",
			real: "setChannelRatelimit"
		}, {
			use: "bitrate",
			real: "setChannelBitrate"
		}, {
			use: "userLimit",
			real: "setChannelUserLimit"
		}, {
			use: "parentID",
			real: "setChannelParentID"
		}]);
	}

	guilds() {
		this.addPath("guilds");
		this.complete = true;

		return new Term(this, [{
			use: "get",
			real: "getGuild"
		}]);
	}

	getGuild(id) {
		if(!id) throw new Error("ID must be defined for guilds().get(id)");

		this.addPath(id);
		this.complete = true;

		return new Term(this, ["auditLogs"]);
	}

	auditLogs() {
		this.addPath("audit-logs");
		this.complete = true;

		return new Term(this);
	}

	run() {
		return new Promise((resolve, reject) => this.then(resolve, reject));
	}

	async then(success, failure) {
		if(!this.complete) throw new Error("Cannot execute request if it is not valid");

		try {
			const request = this.request[this.method](this.url)
				.set(this.headers)
				.query(this.query);

			if(this.multipart) {
				Object.entries(this.body).forEach(([key, value]) => {
					request.field(key, value);
				});
			} else {
				request.send(this.body);
			}

			const { body } = await request;
			success(body);
		} catch(err) {
			failure(err);
		}
	}
}

module.exports = () => new Request();
