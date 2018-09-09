const CompressionHandler = require("./CompressionHandler");
const config = require("../config");
const { GATEWAY: constants } = require("../constants");
const EventEmitter = require("events");
const WebSocket = require("ws");

class Shard extends EventEmitter {
	constructor(url, shard, totalShards) {
		super();

		url += `?v=${constants.VERSION}&encoding=etf&compress=zlib-stream`;
		this.url = url;

		this.id = shard;
		this.totalShards = totalShards;

		this.reset();
	}

	reset(reconnect = false) {
		this.latency = 0;
		this.user = reconnect ? this.user : null;
		this.status = reconnect ? "resuming" : "disconnected";

		this.sessionID = reconnect ? this.sessionID : null;
		this.lastSequence = reconnect ? this.lastSequence : null;
		this.lastSentHeartbeat = null;

		if(this.heartbeatInterval) clearInterval(this.heartbeatInterval);
		this.heartbeatInterval = null;

		if(this.compressionHandler) this.compressionHandler.kill();
		this.compressionHandler = new CompressionHandler();
		this.compressionHandler.on("message", this.packet);

		if(this.ws) {
			this.ws.terminate();
			this.ws.removeAllListeners();
		}

		this.ws = new WebSocket(this.url);
		this.ws.on("message", this.compressionHandler.push.bind(this.compressionHandler));
	}

	async send(data) {
		// TODO: check if websocket is open and add it to a queue, most likely a queue class that can double for REST api
		this.ws.send(this.compressionHandler.prepareForSending(data));
	}

	heartbeat() {
		this.lastSentHeartbeat = Date.now();

		this.send({
			op: constants.OPCODES.HEARTBEAT,
			d: this.lastSequence
		});
	}

	async packet(packet) {
		switch(packet.op) {
			case constants.OPCODES.DISPATCH: {
				switch(packet.t) {
					case "RESUMED": {
						this.status = "ready";

						break;
					}

					case "READY": {
						this.emit("ready");

						this.status = "ready";
						this.user = packet.d.user;
						this.sessionID = packet.d.session_id;

						break;
					}

					case "GUILD_MEMBER_ADD": {
						// TODO

						break;
					}

					case "GUILD_MEMBER_REMOVE": {
						// TODO

						break;
					}

					case "GUILD_MEMBER_UPDATE": {
						// TODO

						break;
					}

					case "GUILD_ROLE_CREATE": {
						// TODO

						break;
					}

					case "GUILD_ROLE_UPDATE": {
						// TODO

						break;
					}

					case "GUILD_ROLE_DELETE": {
						// TODO

						break;
					}

					case "MESSAGE_CREATE": {
						// TODO

						break;
					}

					case "USER_UPDATE": {
						// TODO

						break;
					}

					case "GUILD_BAN_ADD": {
						// TODO

						break;
					}

					case "GUILD_BAN_REMOVE": {
						// TODO

						break;
					}

					case "GUILD_CREATE": {
						// TODO: cache

						break;
					}

					case "GUILD_UPDATE": {
						// TODO: cache

						break;
					}

					case "GUILD_DELETE": {
						if(packet.d.unavailable) return;
						// TODO: cache

						break;
					}

					case "CHANNEL_DELETE": {
						// TODO: cache

						break;
					}

					case "CHANNEL_UPDATE": {
						// TODO: cache

						break;
					}

					case "CHANNEL_CREATE": {
						// TODO: cache

						break;
					}
				}

				break;
			}

			case constants.OPCODES.HELLO: {
				if(this.heartbeatInterval) clearInterval(this.heartbeatInterval);
				this.heartbeatInterval = setInterval(() => this.heartbeat(), packet.d.heartbeat_interval);

				if(this.sessionID) this.resume();
				else this.identify();

				this.heartbeat();
				break;
			}

			case constants.OPCODES.INVALID_SESSION: {
				this.lastSequence = 0;
				this.sessionID = null;

				this.identify();
				break;
			}

			case constants.OPCODES.HEARTBEAT: {
				this.heartbeat();
				break;
			}

			case constants.OPCODES.RECONNECT: {
				this.reset(true);
				break;
			}

			case constants.OPCODES.HEARTBEAT_ACK: {
				this.latency = Date.now() - this.lastSentHeartbeat;
			}
		}
	}

	resume() {
		this.status = "resuming";
		this.send({
			token: config.token,
			session_id: this.sessionID,
			seq: this.lastSequence
		});
	}

	identify() {
		this.send({
			op: constants.OPCODES.IDENTIFY,
			d: {
				token: config.token,
				properties: {
					$os: process.platform,
					$browser: "Oxyl",
					$device: "Oxyl"
				},
				shard: [this.id, this.totalShards],
				presence: {
					since: null,
					game: {
						name: "o!help",
						type: 0
					},
					status: "online",
					afk: false
				}
			}
		});
	}
}

module.exports = Shard;
