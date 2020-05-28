const CompressionHandler = require("./CompressionHandler");
const { GATEWAY: constants } = require("../constants");
const EventEmitter = require("events");
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
		console.log("Resetting shard, reconnect:", reconnecting);
		this.latency = 0;
		this.user = reconnecting ? this.user : null;
		this.status = reconnecting ? "resuming" : "disconnected";
		this.messageQueue = [];

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
		console.log("Creating websocket");
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


			console.log("Websocket closed, reconnect:", reconnect, "error message:", errorMessage);

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

	heartbeat() {
		console.log("Sending heartbeat");
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
						console.log("DISPATCH: Resumed!");
						this.status = "ready";
						this.emptyQueues();

						break;
					}

					case "READY": {
						console.log("DISPATCH: READY!");
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

					case "GUILD_BAN_ADD": {
						// TODO

						break;
					}

					case "GUILD_BAN_REMOVE": {
						// TODO

						break;
					}

					case "GUILD_CREATE": {
						console.log("DISPATCH: GUILD CREATE!");

						break;
					}

					case "GUILD_DELETE": {
						console.log("DISPATCH: GUILD DELETE!");

						break;
					}
				}

				break;
			}

			case constants.OPCODES.HELLO: {
				console.log("HELLO: heartbeat interval", packet.d.heartbeat_interval);
				if(this.heartbeatInterval) clearInterval(this.heartbeatInterval);
				this.heartbeatInterval = setInterval(() => this.heartbeat(), packet.d.heartbeat_interval);

				if(this.sessionID) this.resume();
				else this.identify();

				this.heartbeat();
				break;
			}

			case constants.OPCODES.INVALID_SESSION: {
				console.log("INVALID SESSION: reidentifying");
				this.lastSequence = 0;
				this.sessionID = null;

				this.identify();
				break;
			}

			case constants.OPCODES.HEARTBEAT: {
				console.log("HEARTBEAT: heartbeat manually requested");
				this.heartbeat();
				break;
			}

			case constants.OPCODES.RECONNECT: {
				console.log("RECONNECT: resetting with reconnect");
				this.reset(true);
				break;
			}

			case constants.OPCODES.HEARTBEAT_ACK: {
				console.log("HEARTBEAT ACK: heartbeat was acknowledged");
				this.latency = Date.now() - this.lastSentHeartbeat;
				break;
			}

			default: {
				console.log("Unknown OP:", packet);
				break;
			}
		}
	}

	resume() {
		console.log("resuming the session");
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
		console.log("identifying to gateway");
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
