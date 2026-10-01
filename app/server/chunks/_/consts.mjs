var version = "0.0.42";
const packageJSON = {
	version: version};

const TTL = 30 * 60 * 1e3;
const Version = packageJSON.version;

export { TTL as T, Version as V };
