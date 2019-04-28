const cacheConverter = require("./cacheConverter");
const CompressionHandler = require("./CompressionHandler");
const { GATEWAY: constants } = require("../constants");
const EventEmitter = require("events");
const superagent = require("superagent");
const WebSocket = require("ws");

const gatewayAPIUrl = `http://gateway:${process.env.GATEWAY_SERVICE_PORT}`;

class Shard extends EventEmitter {
	constructor({ gatewayURL, shardID, shardCount, messageSocket, cacheSocket, token }) {
		super();

		gatewayURL += `?v=${constants.VERSION}&encoding=etf&compress=zlib-stream`;
		this.url = gatewayURL;

		this.token = token;
		this.id = shardID;
		this.shardCount = shardCount;
		this.messageSocket = messageSocket;
		this.cacheSocket = cacheSocket;

		this.reset();
	}

	reset(reconnecting = false) {
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

			if(code === 4007) this.lastSequence = null;
			if([4007, 4009].includes(code)) this.sessionID = null;

			if(reconnect) this.reset(true);

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
		if(this.status !== "ready" && data.op !== constants.OPCODES.IDENTIFY) this.messageQueue.push(data);
		else this.ws.send(this.compressionHandler.compress(data));
	}

	async emptyMessageQueue() {
		while(this.messageQueue.length) {
			this.send(this.messageQueue.shift());
			await new Promise(resolve => setTimeout(resolve, 500));
		}
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
						this.emptyMessageQueue();

						break;
					}

					case "READY": {
						this.emit("ready");

						this.status = "ready";
						this.emptyMessageQueue();
						this.user = packet.d.user;
						this.sessionID = packet.d.session_id;

						break;
					}

					case "GUILD_MEMBER_ADD": {
						this.cacheSocket.send("member", cacheConverter.member(packet.d));

						break;
					}

					case "GUILD_MEMBER_REMOVE": {
						await superagent.delete(`${gatewayAPIUrl}/guilds/${packet.d.guild_id}` +
							`/members/${packet.d.user.id}`);

						break;
					}

					case "GUILD_MEMBER_UPDATE": {
						this.cacheSocket.send("member", cacheConverter.member(packet.d));

						break;
					}

					case "GUILD_ROLE_CREATE": {
						const role = Object.assign(packet.d.role, { guild_id: packet.d.guild_id });
						this.cacheSocket.send("role", cacheConverter.role(role));

						break;
					}

					case "GUILD_ROLE_UPDATE": {
						const role = Object.assign(packet.d.role, { guild_id: packet.d.guild_id });
						this.cacheSocket.send("role", cacheConverter.role(role));

						break;
					}

					case "GUILD_ROLE_DELETE": {
						await superagent.delete(`${gatewayAPIUrl}/guilds/${packet.d.guild_id}` +
							`/roles/${packet.d.role.id}`);

						break;
					}

					case "MESSAGE_CREATE": {
						if(packet.d.type === 0 && !packet.d.webhook_id && !packet.d.author.bot) {
							this.messageSocket.send({
								id:	packet.d.id,
								channelId: packet.d.channel_id,
								authorId: packet.d.author.id,
								guildId: packet.d.guild_id,
								content: packet.d.content
							});
						}

						break;
					}

					case "USER_UPDATE": {
						this.cacheSocket.send("user", cacheConverter.user(packet.d));

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
						this.cacheSocket.send("guild", cacheConverter.guild(packet.d));

						break;
					}

					case "GUILD_UPDATE": {
						this.cacheSocket.send("guild", cacheConverter.guild(packet.d));

						break;
					}

					case "GUILD_DELETE": {
						if(packet.d.unavailable) return;
						await superagent.delete(`${gatewayAPIUrl}/guilds/${packet.d.guild_id}`);

						break;
					}

					case "CHANNEL_DELETE": {
						await superagent.delete(`${gatewayAPIUrl}/guilds/${packet.d.guild_id}` +
							`/channels/${packet.d.channel.id}`);

						break;
					}

					case "CHANNEL_UPDATE": {
						this.cacheSocket.send("channel", cacheConverter.channel(packet.d));

						break;
					}

					case "CHANNEL_CREATE": {
						this.cacheSocket.send("channel", cacheConverter.channel(packet.d));

						break;
					}

					case "VOICE_STATE_UPDATE": {
						if(!packet.d.channel_id) {
							await superagent.delete(`${gatewayAPIUrl}/guilds/${packet.d.guild_id}` +
								`/voicestates/${packet.d.user_id}`);
						} else {
							this.cacheSocket.send("voiceState", cacheConverter.voiceState(packet.d));
						}

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
			token: this.token,
			session_id: this.sessionID,
			seq: this.lastSequence
		});
	}

	identify() {
		this.send({
			op: constants.OPCODES.IDENTIFY,
			d: {
				token: this.token,
				large_threshold: 50,
				properties: {
					$os: process.platform,
					$browser: "oxyl-sharder",
					$device: "oxyl-sharder"
				},
				shard: [this.id, this.shardCount],
				presence: {
					since: null,
					game: {
						name: "o!help",
						type: 2
					},
					status: "online",
					afk: false
				}
			}
		});
	}
}

module.exports = Shard;
