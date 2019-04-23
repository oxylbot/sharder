const zmq = require("zeromq");

class MessageSocket {
	constructor() {
		this.socket = zmq.socket("push");

		this.proto = null;
	}

	start(proto) {
		this.proto = proto;
		this.socket.connect(`tcp://sharder-messages-zmq-proxy:${process.env.SHARDER_MESSAGES_ZMQ_PROXY_SERVICE_PORT_PULL}`);
	}

	send(message) {
		const messageProto = this.proto.lookup("Message");

		const verifyError = messageProto.verify(message);
		if(verifyError) {
			console.log("Invalid message:", message);
			throw new Error(verifyError);
		}

		this.socket.send(messageProto.encode(message).finish());
	}

	close() {
		this.socket.close();
	}
}

module.exports = MessageSocket;
