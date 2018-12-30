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
		const discordMesage = this.proto.DiscordMesage;

		const verifyError = discordMesage.verify(message);
		if(verifyError) throw new Error(verifyError);

		const buffer = discordMesage.encode(message).finish();

		this.socket.send(buffer);
	}

	close() {
		this.socket.close();
	}
}

module.exports = MessageSocket;
