const path = require("path");
const protobuf = require("protobufjs");
const zmq = require("zeromq");

class MessageSocket {
	constructor(address) {
		this.socket = zmq.socket("push");
		this.socket.connect(address);

		this.proto = {};

		protobuf.load(path.resolve(__dirname, "..", "..", "Message.proto")).then(root => {
			this.proto.DiscordMessage = root.lookUpType("DiscordMessage");
		});
	}

	send(message) {
		const verifyError = this.proto.DiscordMessage.verify(message);
		if(verifyError) throw new Error(verifyError);

		const buffer = this.proto.DiscordMessage.encode(message).finish();
		this.socket.send(buffer);
	}

	close() {
		this.socket.close();
	}
}

module.exports = MessageSocket;
