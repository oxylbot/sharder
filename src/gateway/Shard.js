const CompressionHandler = require("./CompressionHandler");
const { GATEWAY: constants } = require("../constants");
const EventEmitter = require("events");
const logger = require("../logger");
const WebSocket = require("ws");

class Shard extends EventEmitter {
	constructor({ gatewayURL, shardID, shardCount, messageSocket, token }) {
		super();

		gatewayURL += `?v=${constants.VERSION}&encoding=etf&compress=zlib-stream`;
		this.url = gatewayURL;

		this.token = token;
		this.id = shardID;
		this.shardCount = shardCount;
		this.messageSocket = messageSocket;

		this.reset();
	}

	reset(reconnecting = false) {
		logger.info(`Resetting shard, reconnect: ${reconnecting}`, { shard: this });
		this.latency = 0;
		this.user = reconnecting ? this.user : null;
		this.status = reconnecting ? "resuming" : "disconnected";
		this.messageQueue = [];
		this.requestMembersCallbacks = new Map();

		this.sessionID = reconnecting ? this.sessionID : null;
		this.lastSequence = reconnecting ? this.lastSequence : null;
		this.lastSentHeartbeat = null;

		if(this.heartbeatInterval) clearInterval(this.heartbeatInterval);
		this.heartbeatInterval = null;

		if(this.compressionHandler) this.compressionHandler.kill();
		this.compressionHandler = new CompressionHandler();
		this.compressionHandler.on("message", this.packet.bind(this));

		if(this.ws) this.close();

		setTimeout(() => this.createWebsocket(), 15000);
	}

	createWebsocket() {
		logger.info(`Creating websocket to ${this.url}`, { shard: this });

		this.ws = new WebSocket(this.url);
		this.ws.on("message", this.compressionHandler.push.bind(this.compressionHandler));
		this.ws.on("close", (code, reason) => {
			const [reconnect, errorMessage] = {
				1006: [true, "Connection reset by peer"],
				4001: [true, "Unknown opcode / invalid opcode payload"],
				4002: [true, "Invalid payload"],
				4003: [true, "Sent payload before identifying"],
				4004: [true, "Incorrect identify payload"],
				4005: [true, "Already identified"],
				4007: [true, "Invalid resume sequence"],
				4008: [true, "Rate limited"],
				4009: [true, "Session timeout"],
				4010: [false, "Invalid shard"],
				4011: [false, "Sharding required"]
			}[code] || [true, "Unknown error"];


			logger.info(`Websocket closed, reconnect: ${reconnect}`, {
				shard: this,
				errorMessage
			});

			if(code === 4007) this.lastSequence = null;
			if([4007, 4009].includes(code)) this.sessionID = null;

			this.reset(reconnect);

			const error = new Error(errorMessage);
			error.code = code;
			error.reason = reason;
			this.emit("disconnectError", error);
		});
	}

	close() {
		this.ws.close(1000);
		this.ws.removeAllListeners();
	}

	async send(data) {
		if(this.status !== "ready" &&
			![constants.OPCODES.IDENTIFY, constants.OPCODES.RESUME].includes(data.op)) this.messageQueue.push(data);
		else this.ws.send(this.compressionHandler.compress(data));
	}

	async emptyQueues() {
		while(this.messageQueue.length) {
			this.send(this.messageQueue.shift());
			await new Promise(resolve => setTimeout(resolve, 500));
		}
	}

	async requestMembers(guildId, { query, userIds }) {
		const nonce = (Date.now() + process.hrtime().reduce((a, b) => a + b)).toString(36);
		const d = {
			guild_id: guildId,
			nonce
		};

		if(query) {
			d.limit = 5;
			d.query = query;
		} else if(userIds) {
			d.user_ids = userIds;
		}

		logger.verbose(`Requesting guild members`, { d });
		this.send({
			op: constants.OPCODES.REQUEST_GUILD_MEMBERS,
			d
		});

		return await new Promise(resolve => {
			this.requestMembersCallbacks.set(nonce, data => {
				resolve(data);
				this.requestMembersCallbacks.delete(nonce);
			});
		});
	}

	heartbeat() {
		logger.info("Sending heartbeat", { shard: this });
		this.lastSentHeartbeat = Date.now();

		this.send({
			op: constants.OPCODES.HEARTBEAT,
			d: this.lastSequence
		});
	}

	async packet(packet) {
		logger.debug(`Received packet`, {
			shard: this,
			packet
		});

		switch(packet.op) {
			case constants.OPCODES.DISPATCH: {
				switch(packet.t) {
					case "RESUMED": {
						logger.info("DISPATCH: resumed", { shard: this });
						this.status = "ready";
						this.emptyQueues();

						break;
					}

					case "READY": {
						logger.info("DISPATCH: ready", { shard: this });
						this.emit("ready");

						this.status = "ready";
						this.emptyQueues();
						this.user = packet.d.user;
						this.sessionID = packet.d.session_id;

						break;
					}

					case "MESSAGE_CREATE": {
						if(packet.d.type === 0 && !packet.d.webhook_id && !packet.d.author.bot) {
							this.messageSocket.send({
								id: packet.d.id,
								channelId: packet.d.channel_id,
								authorId: packet.d.author.id,
								guildId: packet.d.guild_id,
								content: packet.d.content
							});
						}

						break;
					}

					case "GUILD_MEMBERS_CHUNK": {
						logger.verbose("Recieved member chunk", {
							shard: this,
							d: packet.d
						});

						if(!packet.d.nonce) {
							logger.warn("Received member chunk with no nonce", { shard: this });
						} else if(!this.requestMembersCallbacks.has(packet.d.nonce)) {
							logger.warn("Received member chunk with no callback", { shard: this });
						} else {
							this.requestMembersCallbacks.get(packet.d.nonce)(packet.d);
						}

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
						logger.info("DISPATCH: guild create", { shard: this });

						break;
					}

					case "GUILD_DELETE": {
						logger.info("DISPATCH: guild delete", { shard: this });

						break;
					}
				}

				break;
			}

			case constants.OPCODES.HELLO: {
				logger.info(`HELLO: interval ${packet.d.heartbeat_interval}ms`, { shard: this });
				if(this.heartbeatInterval) clearInterval(this.heartbeatInterval);
				this.heartbeatInterval = setInterval(() => this.heartbeat(), packet.d.heartbeat_interval);

				if(this.sessionID) this.resume();
				else this.identify();

				this.heartbeat();
				break;
			}

			case constants.OPCODES.INVALID_SESSION: {
				logger.info(`INVALID SESSION: reidentifying`, { shard: this });
				this.lastSequence = 0;
				this.sessionID = null;

				this.identify();
				break;
			}

			case constants.OPCODES.HEARTBEAT: {
				logger.info(`HEARTBEAT: heartbeat manually requested`, { shard: this });
				this.heartbeat();
				break;
			}

			case constants.OPCODES.RECONNECT: {
				logger.info(`RECONNECT: resetting with reconnect`, { shard: this });
				this.reset(true);
				break;
			}

			case constants.OPCODES.HEARTBEAT_ACK: {
				this.latency = Date.now() - this.lastSentHeartbeat;
				logger.info(`HEARTBEAT ACK: heartbeat was acknowledged (${this.latency}ms)`, { shard: this });
				break;
			}

			default: {
				logger.warn(`Unknown OPcode`, { shard: this });
				break;
			}
		}
	}

	resume() {
		logger.info(`Resuming session`, { shard: this });
		this.status = "resuming";
		this.send({
			op: constants.OPCODES.RESUME,
			d: {
				token: this.token,
				session_id: this.sessionID,
				seq: this.lastSequence
			}
		});
	}

	identify() {
		logger.info(`Identifying`, { shard: this });
		this.send({
			op: constants.OPCODES.IDENTIFY,
			d: {
				token: this.token,
				properties: {
					$os: process.platform,
					$browser: "oxyl-sharder",
					$device: "oxyl-sharder"
				},
				compress: true,
				large_threshold: 50,
				shard: [this.id, this.shardCount],
				presence: {
					since: null,
					game: {
						name: "o!help",
						type: 2
					},
					status: "online",
					afk: false
				},
				guild_subscriptions: false,
				intents: (1 << 0) | (1 << 2) | (1 << 9)
			}
		});
	}
}

module.exports = Shard;
