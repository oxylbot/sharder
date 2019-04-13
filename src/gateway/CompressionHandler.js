const erlpack = require("erlpack");
const EventEmitter = require("events");
const zlib = require("zlib");

class CompressionHandler extends EventEmitter {
	constructor() {
		super();

		this.unzip = zlib.createUnzip({
			flush: zlib.constants.Z_SYNC_FLUSH,
			chunkSize: 128 * 1024
		}).on("data", data => this.chunks.push(data));

		this.flushing = false;
		this.queue = [];
		this.chunks = [];
	}

	kill() {
		this.unzip.close();
		this.unzip.removeAllListeners();
		this.removeAllListeners();
	}

	compress(data) {
		return erlpack.pack(data);
	}

	endOfStream(data) {
		return data.length >= 4 && data.readUInt32BE(data.length - 4) === 0xFFFF;
	}

	push(data) {
		console.log("pushing data");
		if(this.flushing) {
			console.log("flushing, adding to queue");
			this.queue.push(data);
		} else {
			console.log("not flushing, writing");
			this.unzip.write(data);
			if(this.endOfStream(data)) this.flush();
		}
	}

	flush() {
		this.flushing = true;
		console.log("flush time");
		this.unzip.flush(zlib.constants.Z_SYNC_FLUSH, this.flushed.bind(this));
	}

	flushed() {
		this.flushing = false;
		if(!this.chunks.length) return;

		let [buffer] = this.chunks;
		if(this.chunks.length > 1) buffer = Buffer.concat(this.chunks);
		this.chunks = [];

		while(this.queue.length) {
			const data = this.queue.shift();
			this.unzip.write(data);

			if(this.endOfStream(data)) {
				this.flush();
				break;
			}
		}

		console.log("emitting message");
		this.emit("message", erlpack.unpack(buffer));
	}
}

module.exports = CompressionHandler;
