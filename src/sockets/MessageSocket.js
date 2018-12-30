const zmq = require("zeromq");

class MessageSocket {
	constructor(address) {
		this.socket = zmq.socket("push");
		this.address = address;

		this.proto = null;
	}

	start(proto) {
		this.proto = proto;
		this.socket.connect(this.address);
	}

	send(message) {
		const discordMessage = this.proto.DiscordMessage;

		const verifyError = discordMessage.verify(message);
		if(verifyError) throw new Error(verifyError);

		const buffer = discordMessage.encode(message).finish();

		this.socket.send(buffer);
	}

	close() {
		this.socket.close();
	}
}

module.exports = MessageSocket;
