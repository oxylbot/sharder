const erlpack = require("erlpack");
const EventEmitter = require("events");
const zlib = require("zlib");

class CompressionHandler extends EventEmitter {
	constructor() {
		super();

		this.unzip = zlib.createUnzip({
			flush: zlib.constants.Z_SYNC_FLUSH,
			chunkSize: 128 * 1024
		}).on(data => this.zlib.chunks.push(data));

		this.flushing = false;
		this.queue = [];
	}

	kill() {
		this.unzip.close();
		this.unzip.removeAllListeners();
		this.removeAllListeners();
	}

	prepareForSending(data) {
		return erlpack.pack(data);
	}

	endOfStream(data) {
		return data.length >= 4 && data.readUInt32BE(data.length - 4) === 0xFFFF;
	}

	push(data) {
		if(this.flushing) {
			this.queue.push(data);
		} else {
			this.unzip.write(data);
			if(this.endOfStream(data)) this.zlib.flush();
		}
	}

	flush() {
		this.flushing = true;
		this.unzip.flush(zlib.constants.Z_SYNC_FLUSH, this.flushed);
	}

	flushed() {
		this.zlib.flushing = false;
		if(!this.zlib.chunks.length) return;

		let buffer;
		if(this.zlib.chunks.length > 1) buffer = Buffer.concat(this.zlib.chunks);
		else buffer = buffer[0];
		this.zlib.chunks = [];

		while(this.zlib.incoming.length) {
			const data = this.zlib.incoming.shift();
			this.zlib.unzip.write(data);

			if(this.endOfStream(data)) {
				this.zlib.flush();
				break;
			}
		}

		this.emit("message", erlpack.unpack(buffer));
	}
}

module.exports = CompressionHandler;
