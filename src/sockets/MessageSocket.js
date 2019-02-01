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
		const messageProto = this.proto.lookup("Message");

		const verifyError = messageProto.verify(message);
		if(verifyError) throw new Error(verifyError);

		this.socket.send(messageProto.encode(message).finish());
	}

	close() {
		this.socket.close();
	}
}

module.exports = MessageSocket;
